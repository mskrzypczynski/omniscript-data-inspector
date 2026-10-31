'use strict';

/* What may stop the user pressing Next on a step, judged from the definition
 * and the live data as they are now. Three groups, each its own function:
 *   - requiredEmpty: visible required elements whose value is empty (a
 *     required Checkbox must be ticked). Required children of an Edit Block
 *     are not listed: they are enforced when the row is saved, not on Next;
 *   - firingErrors: Set Errors / Validation / Messaging elements that belong
 *     to the step (inside it at any depth, or a Set Errors anywhere whose
 *     error map targets an element of the step) and whose condition holds
 *     now. A Messaging / Validation element counts only while its expression
 *     selects a Requirement or Error message (Info and Warning hold nobody
 *     back);
 *   - customComponents: the Custom LWC elements in the step. Their own
 *     required controls and Next / Previous buttons are not in the
 *     definition, so they are listed for a person to look at, not judged.
 * Best effort by design: a rule this code cannot judge is left out of the
 * first two rather than guessed, and the page can hold Next back for reasons
 * that are not in the definition (server-side checks, an element not
 * rendered yet). A finding that rests on a formula's estimate (a show rule or
 * an expression that compares with a formula) is listed apart as `estimated`
 * and never counted: an estimate alone does not make a red number.
 *
 * Pure: no DOM, no chrome.*. */

import { resolveElementValue, resolveRowValue } from '../shared/structure-model.js';
import { repeatChainOf, rowCount } from './repeat-rows.js';
import { evaluateExpression, ruleTree, describeVerdict } from './visibility.js';
import { createReferences } from '../shared/references.js';
import { createEstimator } from './formula-values.js';
import { describeMessage } from './message-text.js';
import { createRowJudge } from './row-visibility.js';

export const STOPPERS_LEDE = 'Judged against the data right now; best effort.';

export const CUSTOM_NOTE = 'A custom component may carry its own required controls or Next/Previous buttons; ' +
  'those cannot be read from the definition.';

/* undefined, null, '', [] and {} count as empty; false and 0 do not. */
export function isEmptyValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/* Message types that hold the user back; the others only inform. */
const BLOCKING_MESSAGE = /require|error/i;
const EDIT_BLOCK = /edit ?block/i;
/* A Checkbox and a Disclosure ("I agree") both have to be ticked when required. */
const CHECKBOX = /check ?box|disclosure/i;

/* What the validateExpression selects right now: { result, messages } where
 * each message carries the expression result it is shown for. null when the
 * expression cannot be judged (a formula string, an operator the panel does
 * not know, no data). */
export function activeMessages(validation, data, ctx) {
  const raw = validation && validation.raw ? validation.raw.validateExpression : null;
  const { result, estimated } = evaluateExpression(raw, data, ctx);
  if (result === null) return null;
  return {
    result, estimated: !!estimated,
    messages: validation.messages.filter((message) => message.when === String(result))
  };
}

/* Does this message type hold the user back? */
export function blocksNext(message) {
  return BLOCKING_MESSAGE.test((message && message.type) || '');
}

/* The step's descendants in script order, each with whether it sits inside an
 * Edit Block. Parents come before their children in the flattened list, so
 * one pass is enough. */
function under(elements, stepKey) {
  const inEdit = new Map([[stepKey, false]]);
  const typeOf = new Map(elements.map((element) => [element.key, element.type || '']));
  const out = [];
  elements.forEach((element) => {
    if (!inEdit.has(element.parentKey)) return;
    const inside = inEdit.get(element.parentKey) || EDIT_BLOCK.test(typeOf.get(element.parentKey));
    inEdit.set(element.key, inside);
    out.push({ element, inEdit: inside });
  });
  return out;
}

const hasData = (data) => data !== undefined && data !== null && typeof data === 'object';
const isHiddenIn = (visibility, element) => !!(visibility && visibility[element.key] && visibility[element.key].hidden);
/* Hidden for certain. A guess (a formula's estimate, a show rule that cannot be
 * judged and the stale bShow behind it) is not enough to excuse a finding: it
 * is listed apart as estimated instead. */
const isCertainlyHiddenIn = (visibility, element) => isHiddenIn(visibility, element) && !isEstimatedIn(visibility, element);
const isEstimatedIn = (visibility, element) => !!(visibility && visibility[element.key] && visibility[element.key].estimated);
/* The flag is only present when set, so a finding keeps its plain shape. */
const flag = (estimated) => (estimated ? { estimated: true } : {});

/* Only elements a person fills in can be "required and empty". A Text Block,
 * a Formula, an action or a Set Values carries no input, so a `required` flag
 * on one (the Designer lets you set it) says nothing about the data. A Custom
 * LWC may be an input, so it stays judged. */
const INPUT_CATEGORIES = new Set(['input', 'choice', 'custom']);
const COMPUTED = /formula|aggregate/i;
/* Types the category list files elsewhere (a Disclosure with the display
 * elements, Name and Geolocation under "other") that a person still answers. */
const ANSWERED_TYPES = /^\s*(disclosure|geolocation|name)\s*$/i;
function takesInput(element) {
  if (ANSWERED_TYPES.test(element.type || '')) return true;
  return INPUT_CATEGORIES.has(element.category.key) && !COMPUTED.test(element.type || '');
}

/* A Name or Geolocation holds an object: one whose every value is empty has
 * not been answered. */
function isUnanswered(value, depth = 0) {
  if (isEmptyValue(value)) return true;
  if (value && typeof value === 'object' && !Array.isArray(value) && depth < 5) {
    return Object.keys(value).every((key) => isUnanswered(value[key], depth + 1));
  }
  return false;
}

/* `row` is the repeat row this finding is for ("2", or "2.1" for row 1 of a
 * block inside row 2), and `rows` the same as { blockName: n } for the value
 * lookup; both null for an element outside a repeating block or in blocks
 * that hold a single row. */
function requiredFinding(element, data, rows, estimated, row) {
  if (!element.required || element.hasChildren || !takesInput(element)) return null;
  /* In a row the value is that row's: a row without the field is empty, it
   * does not borrow the first row's. */
  const value = rows ? resolveRowValue(element, data, rows) : resolveElementValue(element, data);
  const checkbox = CHECKBOX.test(element.type || '');
  /* A required checkbox has to be ticked: false is an answer, but not enough. */
  if (checkbox ? (value === true || value === 'true') : !isUnanswered(value)) return null;
  const reason = checkbox ? 'Required and not ticked' : 'Required and empty';
  return {
    elementKey: element.key, name: element.name, kind: 'required',
    reason: row ? `${reason} (row ${row})` : reason,
    ...flag(estimated)
  };
}

/* Most rows judged for one element: a block inside a block multiplies. */
const MAX_ROW_COMBINATIONS = 500;

/* The rows to judge an element in: one entry per row of every repeating block
 * it sits in, [{ rows: { Block: n }, row: '2.1' }] (outer row first), or
 * [{ rows: undefined, row: null }] when it is not in one. Every row counts,
 * not only the one the stepper shows: Next is held back by any row. A block
 * with a single row is named in `rows` but not in the label. */
function rowsToJudge(chain, data) {
  if (!chain.length) return [{ rows: undefined, row: null }];
  let combos = [{ rows: {}, labels: [] }];
  chain.forEach((block) => {
    const next = [];
    combos.forEach((combo) => {
      const count = rowCount(block, data, Object.keys(combo.rows).length ? combo.rows : undefined);
      if (count === 0) { next.push(combo); return; }
      for (let n = 1; n <= count && next.length < MAX_ROW_COMBINATIONS; n += 1) {
        next.push({ rows: { ...combo.rows, [block.name]: n }, labels: count > 1 ? [...combo.labels, n] : combo.labels });
      }
    });
    combos = next;
  });
  return combos.map(({ rows, labels }) => ({
    rows: Object.keys(rows).length ? rows : undefined,
    row: labels.length ? labels.join('.') : null
  }));
}

/* [{ elementKey, name, kind: 'required', reason }] in script order, one per
 * empty row for an element in a repeating block ("Required and empty (row
 * 2)"). Without data there is nothing to judge, so the result is empty. */
export function requiredEmpty(elements, stepKey, data, visibility) {
  if (!hasData(data)) return [];
  const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));
  let judge = null; // built when the first required element in a repeating block needs it
  const found = [];
  under(elements, stepKey).forEach(({ element, inEdit }) => {
    if (inEdit || !element.required) return;
    const chain = repeatChainOf(element, byKey, data);
    /* In a repeating block a show rule holds per row, so the rows decide; the
     * outermost block and what is above it are judged as everywhere else. */
    const outer = chain.length ? chain[0] : element;
    if (isCertainlyHiddenIn(visibility, outer)) return;
    const outerEstimated = isEstimatedIn(visibility, outer);
    const own = chain.length ? null : outerEstimated;

    rowsToJudge(chain, data).forEach(({ rows, row }) => {
      let estimated = own;
      if (chain.length) {
        if (!judge) judge = createRowJudge(elements, data, visibility, referencesOf(elements));
        const verdict = judge.judge(element, chain, rows);
        if (verdict.hidden) return;
        estimated = outerEstimated || verdict.estimated;
      }
      const finding = requiredFinding(element, data, rows, estimated, row);
      if (finding) found.push(finding);
    });
  });
  return found;
}

/* A message in two forms. `text` is what may leave the panel: the definition's
 * own words, or "(formula)" for a message that is a formula (its raw text rides
 * in `formula`). `shown` is for the Validation tab only: what a formula comes to
 * against the live data, which holds org data. */
function messageIn(text, ctx, options) {
  const described = describeMessage(text, ctx, options);
  if (!described.formula) return { text: `“${text}”`, shown: `“${text}”`, formula: undefined };
  return { text: '(formula)', shown: described.sentence, formula: { raw: described.raw, note: described.note } };
}

function setErrorsReason(validation, ctx, options) {
  const targets = validation.errorMap.map((entry) => entry.element).filter(Boolean);
  const message = validation.errorMap.map((entry) => entry.message).find(Boolean) || validation.message;
  let text = 'Set Errors will fire';
  if (targets.length) text += ` on ${targets.join(', ')}`;
  if (!message) return { reason: text };
  const shown = messageIn(message, ctx, options);
  return { reason: `${text}: ${shown.text}`, shownReason: `${text}: ${shown.shown}`, formula: shown.formula };
}

function messagingFinding(element, data, ctx, estimatedByVisibility, options) {
  const active = activeMessages(element.validation, data, ctx);
  if (!active) return null;
  const blocking = active.messages.find(blocksNext);
  if (!blocking) return null;
  const shown = messageIn(blocking.text, ctx, options);
  return {
    elementKey: element.key,
    name: element.name,
    kind: 'messaging',
    reason: `${blocking.type} message is active: ${shown.text}`,
    ...(shown.formula ? { shownReason: `${blocking.type} message is active: ${shown.shown}`, formula: shown.formula } : {}),
    ...flag(active.estimated || estimatedByVisibility)
  };
}

function firingFinding(element, visibility, data, ctx, options) {
  const validation = element.validation;
  if (!validation || !validation.has) return null;

  if (validation.kind === 'messaging') {
    return isCertainlyHiddenIn(visibility, element) ? null : messagingFinding(element, data, ctx, isEstimatedIn(visibility, element), options);
  }
  if (validation.kind !== 'set-errors') return null;

  /* Only a show rule that can be judged and holds right now counts. */
  const info = visibility && visibility[element.key];
  if (!info || !info.live || info.hidden || !info.evaluation || info.evaluation.result !== true) return null;
  const { reason, shownReason, formula } = setErrorsReason(validation, ctx, options);
  return {
    elementKey: element.key, name: element.name, kind: 'set-errors', reason,
    ...(formula ? { shownReason, formula } : {}),
    ...flag(info.estimated)
  };
}

/* The reference index is built once per element list. */
const referenceCache = new WeakMap();
function referencesOf(elements) {
  if (!referenceCache.has(elements)) referenceCache.set(elements, createReferences(elements));
  return referenceCache.get(elements);
}

/* Does this Set Errors put an error on an element of the step? */
function targetsStep(element, keys, elements) {
  const validation = element.validation;
  if (!validation || validation.kind !== 'set-errors') return false;
  const refs = referencesOf(elements);
  return validation.errorMap.some((entry) => {
    const hit = refs.resolve(entry.element).element;
    return !!hit && keys.has(hit.key);
  });
}

/* [{ elementKey, name, kind: 'set-errors' | 'messaging', reason, outside }]
 * in script order: the Set Errors / Validation / Messaging elements that
 * belong to the step and hold now. `outside` marks one that sits elsewhere in
 * the script and targets an element of this step; `estimated` one that holds
 * only by a formula's estimate. `visibility` is computeVisibility's output.
 * `options.language` is the script's language code, for a message written as a
 * formula that reads %LanguageCode% (message-text.js). `reason` never holds org
 * data (it leaves the panel in the report and the bundle); a message that is a
 * formula reads "(formula)" there and carries `formula` { raw, note } and
 * `shownReason`, the sentence with what the message comes to, for the
 * Validation tab only.
 * Empty without data. */
export function firingErrors(elements, stepKey, data, visibility, options = {}) {
  if (!hasData(data)) return [];
  const inside = under(elements, stepKey).map(({ element }) => element);
  const keys = new Set(inside.map((element) => element.key));

  const ctx = createEstimator(elements, data);
  const found = [];
  elements.forEach((element) => {
    const isInside = keys.has(element.key);
    if (!isInside && !targetsStep(element, keys, elements)) return;
    const finding = firingFinding(element, visibility, data, ctx, options);
    if (finding) found.push({ ...finding, outside: !isInside });
  });
  return found;
}

/* The verdict of one Messaging / Validation or Set Errors element for the data
 * now: 'fails' (its Requirement or Error message shows, or its error is set),
 * 'passes', 'hidden' (hidden for certain, so it holds nobody back) or 'unknown'
 * (the panel cannot judge it), and whether that rests on a formula's estimate.
 * It agrees with firingErrors(): a rule that 'fails' is listed there. */
function ruleVerdict(element, visibility, data, ctx) {
  const validation = element.validation;
  if (validation.kind === 'messaging') {
    if (isCertainlyHiddenIn(visibility, element)) return { verdict: 'hidden', estimated: false };
    const active = activeMessages(validation, data, ctx);
    if (!active) return { verdict: 'unknown', estimated: false };
    const estimated = active.estimated || isEstimatedIn(visibility, element);
    return { verdict: active.messages.some(blocksNext) ? 'fails' : 'passes', estimated };
  }
  const info = visibility && visibility[element.key];
  if (!info || !info.live || !info.evaluation || info.evaluation.result === null) return { verdict: 'unknown', estimated: false };
  const estimated = !!info.estimated;
  if (info.evaluation.result !== true) return { verdict: 'passes', estimated };
  return { verdict: info.hidden ? 'hidden' : 'fails', estimated };
}

/* [{ elementKey, name, kind: 'messaging' | 'set-errors', outside, verdict, estimated }]
 * in script order: every validation rule of the step, firing or not, each with
 * ruleVerdict()'s verdict. The same elements as firingErrors() looks at (inside
 * the step, or a Set Errors elsewhere that targets an element of it, marked
 * `outside`). Empty without data. */
export function validationRules(elements, stepKey, data, visibility) {
  if (!hasData(data)) return [];
  const keys = new Set(under(elements, stepKey).map(({ element }) => element.key));
  const ctx = createEstimator(elements, data);
  const found = [];
  elements.forEach((element) => {
    const validation = element.validation;
    if (!validation || !validation.has || (validation.kind !== 'messaging' && validation.kind !== 'set-errors')) return;
    const isInside = keys.has(element.key);
    if (!isInside && !targetsStep(element, keys, elements)) return;
    found.push({
      elementKey: element.key, name: element.name, kind: validation.kind, outside: !isInside,
      ...ruleVerdict(element, visibility, data, ctx)
    });
  });
  return found;
}

/* [{ elementKey, name, type, hidden, verdict, tree }]: every Custom LWC
 * element in the step, and every standard element a custom component overrides
 * (those also say `overriddenBy`): the component's own validation may stop Next
 * and the definition cannot show it. `verdict` is describeVerdict's sentence for an element
 * with a show rule and null for one without. */
export function customComponents(elements, stepKey, data, visibility) {
  const ctx = createEstimator(elements, data);
  return under(elements, stepKey)
    .map(({ element }) => element)
    .filter((element) => element.category.key === 'custom' || !!element.override)
    .map((element) => {
      const tree = element.conditional ? ruleTree(element.show, data, ctx) : null;
      return {
        elementKey: element.key,
        name: element.name,
        type: element.type,
        hidden: isHiddenIn(visibility, element),
        verdict: tree ? describeVerdict(tree, { assumed: element.shown }) : null,
        tree,
        ...(element.override ? { overriddenBy: element.override } : {})
      };
    });
}

/* { required, firing, custom, estimated, items, count }: everything above for
 * one step. `items` is required + firing in script order, and `count` their
 * number, the figure on the red badge. Findings that rest on a formula's
 * estimate are in `estimated` (script order) and in none of the others, so no
 * number ever depends on one. */
export function stepStoppers(elements, stepKey, data, visibility, options = {}) {
  const position = new Map(elements.map((element, i) => [element.key, i]));
  const inOrder = (list) => list.slice().sort((a, b) => position.get(a.elementKey) - position.get(b.elementKey));
  const required = requiredEmpty(elements, stepKey, data, visibility);
  const firing = firingErrors(elements, stepKey, data, visibility, options);
  const custom = customComponents(elements, stepKey, data, visibility);
  const certain = (list) => list.filter((item) => !item.estimated);
  const items = inOrder([...certain(required), ...certain(firing)]);
  const estimated = inOrder([...required, ...firing].filter((item) => item.estimated));
  return { required: certain(required), firing: certain(firing), custom, estimated, items, count: items.length };
}
