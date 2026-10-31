'use strict';

/* The Valid column of the Structure list: one verdict per row, whether Next
 * would go as far as that row is concerned. Built on what step-validation.js
 * and live-validation.js already compute, so the glyph can never disagree with
 * the red May stop Next number: the same findings, shown on the rows they are
 * about.
 *
 *   tone 'good'    ✓ passes its rules now (a step only: elements show ✕ or – and are otherwise blank)
 *   tone 'bad'     ✕ would stop Next now
 *   tone 'neutral' – the panel tried and cannot tell
 *   no entry       blank: nothing to judge. Blank is not a dash.
 *
 * Only the current step and the steps already passed are judged: the data of a
 * step ahead does not exist yet, and a ✕ there would say Next is blocked on a
 * step the user is not on. A passed step is judged like the current one,
 * against the data now.
 *
 * Judged against the data right now; best effort.
 *
 * Pure: no DOM, no chrome.*. */

import { isCertainlyHidden } from './visibility.js';
import { createEstimator } from './formula-values.js';
import { describeMessage } from './message-text.js';
import { liveMessaging, liveSetErrors } from './live-validation.js';
import { requiredEmpty, stepStoppers, STOPPERS_LEDE } from './step-validation.js';

const hasData = (data) => data !== undefined && data !== null && typeof data === 'object';

const good = (text) => ({ tone: 'good', text });
const bad = (text) => ({ tone: 'bad', text });
const neutral = (text) => ({ tone: 'neutral', text });

/* The tooltip of the column header. */
export function verdictHeaderTitle(dataRead = true) {
  return 'Whether the element is valid now: ✕ would stop Next, – the panel cannot tell; a step shows ✓ when nothing stops Next on it. Blank is valid or nothing to judge. ' +
    STOPPERS_LEDE + (dataRead ? '' : ' No data has been read yet.');
}

const thingsMayStop = (count) => `${count} ${count === 1 ? 'thing may' : 'things may'} stop Next`;

/* A message in words for a tooltip: its own text in quotes, or what a message
 * written as a formula comes to. */
function messageWords(text, estimator, language) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const described = describeMessage(text, estimator, { language });
  return described.formula ? described.sentence : `“${text}”`;
}

/* "Can't tell: ..." once, whether or not the sentence already says it. */
const cantTell = (sentence) => (/^can't tell/i.test(sentence) ? sentence : `Can't tell: ${sentence}`);

const CUSTOM_VERDICT = cantTell(
  'a custom component may carry its own required controls or Next and Previous buttons, which the panel cannot read from the definition'
);

/* The step an element belongs to (itself, for a step), or null. */
function stepOf(element, byKey) {
  let node = element;
  let guard = 0;
  while (node && guard++ < 100) {
    if (node.category && node.category.key === 'step') return node;
    node = byKey.get(node.parentKey);
  }
  return null;
}

/* What one judged step says about itself and each of its elements. Findings
 * are indexed by element once per step and reused for every row below it. */
function judgeStep({ step, elements, data, visibility, language, stoppers, estimator }) {
  const found = stoppers(step);
  const own = (item) => !item.outside; // a Set Errors elsewhere that targets this step is that row's business
  const byKey = (items, kind) => {
    const map = new Map();
    items.filter((item) => own(item) && (!kind || item.kind === kind)).forEach((item) => {
      map.set(item.elementKey, [...(map.get(item.elementKey) || []), item]);
    });
    return map;
  };
  const empty = byKey(found.required);
  const firing = byKey(found.firing);
  const estimated = byKey(found.estimated);
  const custom = new Set(found.custom.map((item) => item.elementKey));

  /* The inputs requiredEmpty judges are asked of requiredEmpty itself, against
   * data that holds nothing and rules that hide nothing: every required input
   * it looks at is then empty and listed. That keeps "which elements count" in
   * one place (Edit Block children, elements that take no input and the rest
   * are its decision), at the cost of one extra pass for a step that has a
   * required element at all. */
  let judged = null;
  const isJudgedRequired = (element) => {
    if (!element.required) return false;
    if (!judged) judged = new Set(requiredEmpty(elements, step.key, {}, undefined).map((item) => item.elementKey));
    return judged.has(element.key);
  };

  const count = found.count;
  const stepVerdict = count > 0
    ? bad(thingsMayStop(count))
    : found.estimated.length > 0
      ? neutral(cantTell(`${found.estimated.length === 1 ? 'a finding rests' : `${found.estimated.length} findings rest`} on a formula's estimate, so it is not counted`))
      : good('Nothing stops Next on this step');

  function requiredVerdict(element) {
    const hits = empty.get(element.key);
    if (hits) {
      const more = hits.length > 1 ? ` (and ${hits.length - 1} more ${hits.length === 2 ? 'row' : 'rows'})` : '';
      return bad(`${hits[0].reason}${more}: would stop Next`);
    }
    if (estimated.has(element.key)) return neutral(cantTell('whether it is empty and shown rests on a formula\'s estimate'));
    if (custom.has(element.key)) return neutral(CUSTOM_VERDICT);
    if (isCertainlyHidden(visibility && visibility[element.key])) return null; // hidden fields do not stop Next
    return good('Required and filled');
  }

  function messagingVerdict(element) {
    if (isCertainlyHidden(visibility && visibility[element.key])) return null;
    const hits = firing.get(element.key);
    const live = liveMessaging(element.validation, data, estimator);
    if (!live) return null;
    if (hits) {
      const blocking = live.active.find((message) => message.blocks);
      const words = blocking ? messageWords(blocking.text, estimator, language) : '';
      return bad(`Validation fires and stops Next${words ? `: ${words}` : ''}`);
    }
    if (estimated.has(element.key)) return neutral(cantTell('it rests on a formula\'s estimate'));
    if (live.state === 'unknown') return neutral(cantTell(live.headline));
    if (live.blocks) return neutral(cantTell('it would stop Next, but only by a formula\'s estimate'));
    if (live.active.length) return good('Fires a warning, does not stop Next');
    return good('Validation passes');
  }

  function setErrorsVerdict(element) {
    const live = liveSetErrors(element.validation, visibility && visibility[element.key]);
    if (!live) return null;
    const hits = firing.get(element.key);
    if (hits) {
      const { validation } = element;
      const message = (validation.errorMap.map((entry) => entry.message).find(Boolean)) || validation.message;
      const words = messageWords(message, estimator, language);
      return bad(`Set Errors fires${words ? `: ${words}` : ''}`);
    }
    if (estimated.has(element.key)) return neutral(cantTell('it rests on a formula\'s estimate'));
    if (live.state === 'unknown') return neutral(cantTell(live.headline));
    return good('Set Errors does not fire');
  }

  function elementVerdict(element) {
    const kind = element.validation && element.validation.has ? element.validation.kind : '';
    if (kind === 'messaging') return messagingVerdict(element);
    if (kind === 'set-errors') return setErrorsVerdict(element);
    if (isJudgedRequired(element)) return requiredVerdict(element);
    if (custom.has(element.key)) return neutral(CUSTOM_VERDICT);
    return null;
  }

  return { stepVerdict, elementVerdict };
}

/* { [element.key]: { tone, text } } for the rows that have a verdict.
 *   elements, data, visibility — the Structure tab's, as the other judges read them
 *   progress    — executionStatus's { [key]: 'done' | 'current' | 'skipped' | 'pending' }
 *   stoppers    — optional (step) => stepStoppers(...), so a caller that keeps
 *                 that answer for the red number shares it
 *   language    — the script's language code, for a message written as a formula
 * Empty without data. */
export function rowVerdicts({ elements, data, visibility, progress, stoppers, language = '' }) {
  const out = {};
  if (!hasData(data) || !elements.length) return out;
  const stoppersOf = stoppers || ((step) => stepStoppers(elements, step.key, data, visibility, { language }));
  const byKey = new Map(elements.map((element) => [element.key, element]));
  let estimator = null; // built when the first Messaging or Set Errors needs it
  const lazyEstimator = {
    read: (...args) => { estimator = estimator || createEstimator(elements, data); return estimator.read(...args); },
    evaluate: (...args) => { estimator = estimator || createEstimator(elements, data); return estimator.evaluate(...args); },
    estimate: (...args) => { estimator = estimator || createEstimator(elements, data); return estimator.estimate(...args); }
  };

  const judges = new Map(); // step key -> its judge, or null for a step that is not judged
  const judgeOf = (step) => {
    if (judges.has(step.key)) return judges.get(step.key);
    const state = progress && progress[step.key];
    const judge = state === 'current' || state === 'done'
      ? judgeStep({ step, elements, data, visibility, language, stoppers: stoppersOf, estimator: lazyEstimator })
      : null;
    judges.set(step.key, judge);
    return judge;
  };

  elements.forEach((element) => {
    const step = stepOf(element, byKey);
    if (!step) return;
    const state = progress && progress[step.key];
    if (element === step) {
      if (state === 'skipped') { out[element.key] = neutral('Passed without running'); return; }
      const judge = judgeOf(step);
      if (judge) out[element.key] = judge.stepVerdict;
      return;
    }
    const judge = judgeOf(step);
    const verdict = judge ? judge.elementVerdict(element) : null;
    /* A tick on every valid element drowns the failures: only a step carries one. */
    if (verdict && verdict.tone !== 'good') out[element.key] = verdict;
  });
  return out;
}
