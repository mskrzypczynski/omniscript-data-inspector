'use strict';

/* The rule cards of the Structure detail pane, in the frame of fact-card.js:
 * the Visibility card of an element with a show rule, the Validation card of a
 * Messaging / Validation or Set Errors element, and a step's Validation tab,
 * which is a card per validation rule of the step (failing ones open, passing
 * ones closed to their header line), the required fields still empty, and a
 * card per custom component.
 *
 * Only DOM here: verdicts, tags and words come from src/core/structure/
 * (fact-words.js, live-validation.js, step-validation.js, visibility.js). */

import { Mask } from '../mask-setting.js';
import { notice } from '../notice.js';
import { liveMessaging, liveSetErrors } from '../../core/structure/live-validation.js';
import { blocksNext, STOPPERS_LEDE, CUSTOM_NOTE } from '../../core/structure/step-validation.js';
import { evaluateShow, withOverrides } from '../../core/structure/visibility.js';
import { ruleSummary } from '../../core/structure/rule-outline.js';
import {
  TAGS, verdictTag, messagingVerdict, setErrorsVerdict, visibilityVerdict, messageKind, messageLabel,
  checkedWhen, conditionReading, decidingCondition, cardText, shortName
} from '../../core/structure/fact-words.js';
import {
  factCard, factRows, factRow, factHeading, factSection, factNote, linkNode, monoNode, unknownNode, tagNode
} from './fact-card.js';
import { renderConditionTable } from './rule-view.js';
import { messageFact } from './message-view.js';

const VALIDATION_TIP = `What the element checks and which message it shows for the data right now. ${STOPPERS_LEDE}`;
const VISIBILITY_TIP = `Whether the element is shown for the data right now, and why. ${STOPPERS_LEDE}`;
const RULE_TIP = `One validation rule of the step: its verdict for the data right now. ${STOPPERS_LEDE}`;
const CUSTOM_TIP = 'A custom component of the step and the verdict of its show rule';

/* ctx (from the detail pane):
 *   state         — the tab's state (data, whatIf, visibility, formulaOpen, factOpen)
 *   refs()        — the reference index; jump(key) selects an element; elementOf(key)
 *   treeOf(rule, editable) — the rule table's tree against the data (what if when editable)
 *   estimator()   — the formula estimator; describeText(text) — a message as what it comes to
 *   onEdit(field, text) — a value typed into Is now
 *   explain(element) — explainVisibility(); headline(element, tab) — the head's verdict sentence
 *                   (of the Visibility tab for 'conditions', else of the Validation tab)
 *   links()       — the Depends on / Used by lists are available */
export function createRuleCards(ctx) {
  const { state, refs, jump, elementOf, treeOf, estimator, describeText, onEdit, explain, headline, links } = ctx;
  if (!state.factOpen) state.factOpen = new Map();

  /* A field that names an element: its name as a link that selects it, the field as written in the tooltip. */
  function fieldLink(field) {
    const target = field ? refs().resolve(String(field).replace(/^%|%$/g, '')).element : null;
    if (!target) return null;
    return linkNode(target.name, `Select ${target.name}${field !== target.name ? ` · ${field}` : ''}`, () => jump(target.key));
  }

  const elementLink = (element) => ({ text: element.name, title: `Select ${element.name}`, onClick: () => jump(element.key) });

  const tried = () => state.whatIf.size > 0;
  const reading = () => (tried() ? withOverrides(estimator(), state.whatIf, state.data) : estimator());

  /* The closed card's one line: the condition that decides it, in plain language. */
  function whyOf(tree, fallback = '') {
    const node = decidingCondition(tree);
    if (!node) return fallback;
    const read = conditionReading(node);
    return [monoNode(read.name), read.rest];
  }

  /* A fold that keeps what the user chose for a card across redraws. */
  const foldFor = (key, openByDefault) => ({
    open: state.factOpen.has(key) ? state.factOpen.get(key) : openByDefault,
    onToggle: (open) => state.factOpen.set(key, open)
  });

  /* ------------------------------------------------ Messaging / Set Errors */

  /* The facts of a Messaging / Validation element: its messages, each labelled by
   * when it shows, and what the one shown does. Returns the rows for Copy. */
  function messagingRows(validation, live, rows, { others: withOthers = true } = {}) {
    const out = [];
    const state0 = live ? live.state : 'unknown';
    const shown = validation.messages.filter((message) => messageLabel(message, state0) === 'Shows');
    const others = validation.messages.filter((message) => !shown.includes(message));
    if (state0 !== 'unknown' && !shown.length) {
      factRow(rows, 'Shows', unknownNode('no message'));
      out.push({ label: 'Shows', text: 'no message' });
    }
    shown.forEach((message) => {
      const fact = messageFact(message.text, describeText, state.formulaOpen);
      factRow(rows, 'Shows', fact.nodes);
      out.push({ label: 'Shows', text: fact.formula ? fact.formula.text : message.text, data: !!fact.formula });
      const kind = messageKind(message, blocksNext(message));
      factRow(rows, 'Kind', kind);
      out.push({ label: 'Kind', text: kind });
    });
    /* The messages for the other outcome: on the element's own card, dimmed, as "Comment: “…”". */
    if (!withOthers) return out;
    others.forEach((message) => {
      const label = messageLabel(message, state0);
      const fact = messageFact(message.text, describeText, state.formulaOpen);
      const type = document.createElement('span');
      type.className = 'fc-prose fc-dim';
      type.textContent = fact.formula ? `${message.type || 'Message'}: ` : `${message.type || 'Message'}: “${message.text}”`;
      factRow(rows, label, fact.formula ? [type, ...fact.nodes] : [type]);
      out.push({ label, text: `${message.type || 'Message'}: ${fact.formula ? fact.formula.text : `“${message.text}”`}`, data: !!fact.formula });
    });
    return out;
  }

  /* The facts of a Set Errors element: the errors it sets, its message and when it is checked. */
  function setErrorsRows(validation, live, rows) {
    const out = [];
    if (live && live.state === 'unknown' && !validation.triggerExpr) {
      factRow(rows, 'Condition', unknownNode('none set'));
      out.push({ label: 'Condition', text: 'none set' });
    }
    if (validation.errorMap.length) {
      factHeading(rows, 'Errors it sets');
      validation.errorMap.forEach((entry) => {
        const link = fieldLink(entry.element);
        const fact = messageFact(entry.message, describeText, state.formulaOpen);
        factRow(rows, link || monoNode(shortName(entry.element), entry.element), fact.nodes, { isName: true });
        out.push({ label: entry.element, text: fact.formula ? fact.formula.text : entry.message, data: !!fact.formula });
      });
    }
    if (validation.message) {
      const fact = messageFact(validation.message, describeText, state.formulaOpen);
      factRow(rows, 'Message', fact.nodes);
      out.push({ label: 'Message', text: fact.formula ? fact.formula.text : validation.message, data: !!fact.formula });
    }
    const when = checkedWhen(validation.runsOn);
    factRow(rows, 'Checked', when);
    out.push({ label: 'Checked', text: when });
    return out;
  }

  /* What a Messaging / Set Errors element comes to now: { live, verdict, tree, expression }.
   * `editable`: the values typed into Is now count (what if). */
  function judgeValidation(element, editable) {
    const validation = element.validation;
    if (validation.kind === 'messaging') {
      const expression = validation.raw && validation.raw.validateExpression;
      const live = liveMessaging(validation, state.data, editable ? reading() : estimator());
      return { live, verdict: messagingVerdict(live), estimated: !!(live && live.estimated), tree: treeOf(expression, editable), expression };
    }
    let info = state.visibility[element.key];
    if (editable && tried() && element.show) {
      const evaluation = evaluateShow(element.show, state.data, reading());
      const parentHides = !!(info && info.hidden && info.via && info.via !== element.key);
      info = { ...info, evaluation, live: evaluation.result !== null, estimated: evaluation.estimated, hidden: evaluation.result === false || parentHides };
    }
    const live = liveSetErrors(validation, info);
    return { live, verdict: setErrorsVerdict(live), estimated: !!(info && info.estimated), tree: treeOf(element.show, editable), expression: element.show };
  }

  /* The body of a validation card: its facts, the condition table, and, on the
   * element's own tab, the rule as written. Returns the text Copy puts on the clipboard. */
  function fillValidation(element, body, judged, { editable, asWritten }) {
    const validation = element.validation;
    const rows = factRows(body);
    const facts = validation.kind === 'messaging'
      ? messagingRows(validation, judged.live, rows, { others: asWritten })
      : setErrorsRows(validation, judged.live, rows);
    if (judged.tree) {
      renderConditionTable(judged.tree, body, {
        fieldLink, onEdit: editable ? onEdit : null, label: 'Condition'
      });
    }
    const written = ruleSummary(judged.tree ? judged.expression : (validation.validateExpr || judged.expression));
    if (asWritten && written) {
      factRow(factRows(body), 'As written', monoNode(written));
      facts.push({ label: 'As written', text: written });
    }
    return facts;
  }

  /* The Validation tab of a Messaging / Validation or Set Errors element: one card. */
  function renderValidation(element, container) {
    const judged = judgeValidation(element, true);
    const tag = { ...verdictTag(judged.verdict, { estimated: judged.estimated }), title: headline(element) };
    const tags = [];
    if (judged.estimated) tags.push(TAGS.estimated);
    if (judged.tree && judged.tree.edited) tags.push(TAGS.whatIf);
    let facts = [];
    const { body } = factCard(container, {
      name: 'Validation', id: 'validation', verdict: tag, tags, tip: VALIDATION_TIP,
      copy: {
        text: () => cardText({ title: `Validation · ${element.name}`, verdict: tag.text, rows: facts, tree: judged.tree, mask: Mask.on() }),
        title: 'Copy the Validation card as text. Honours Mask values.', help: 'Validation tab'
      }
    });
    facts = fillValidation(element, body, judged, { editable: true, asWritten: true });
  }

  /* ------------------------------------------------ Visibility */

  /* The Visibility tab: one card with the verdict, the conditions and the rule as written. */
  function renderVisibility(element, container) {
    const tree = treeOf(element.show, true);
    if (!tree) return false;
    const why = explain(element);
    const info = state.visibility[element.key] || {};
    const byParent = !!(info.hidden && info.via && info.via !== element.key);
    const verdict = tree.edited
      ? visibilityVerdict({ ok: tree.ok, byParent })
      : visibilityVerdict({ ok: tree.ok, hidden: why.hidden, byParent });
    const tag = { ...verdictTag(verdict), title: headline(element, 'conditions') };
    const tags = [];
    if (info.estimated || tree.estimated) tags.push(TAGS.estimated);
    if (tree.edited) tags.push(TAGS.whatIf);

    const facts = [];
    const { body } = factCard(container, {
      name: 'Visibility', id: 'visibility', verdict: tag, tags, tip: VISIBILITY_TIP,
      copy: {
        text: () => cardText({ title: `Visibility · ${element.name}`, verdict: tag.text, rows: facts, tree, mask: Mask.on() }),
        title: 'Copy the Visibility card as text. Honours Mask values.', help: 'Visibility tab'
      }
    });

    const before = factRows(body);
    const notes = why.lines.filter((line) => line.field === undefined);
    if (byParent) {
      const parent = elementOf(info.via);
      const parentLine = notes.shift();
      factRow(before, 'Hidden by', [
        parent ? linkNode(parent.name, `Select ${parent.name}`, () => jump(parent.key)) : unknownNode('a parent'),
        parentLine ? ` · ${parentLine.text}` : ''
      ]);
      facts.push({ label: 'Hidden by', text: `${parent ? parent.name : 'a parent'}${parentLine ? ` · ${parentLine.text}` : ''}` });
    }
    if (verdict === 'unknown') {
      factRow(before, 'Verdict', headline(element, 'conditions'));
      facts.push({ label: 'Verdict', text: headline(element, 'conditions') });
    }
    notes.forEach((line) => {
      factRow(before, 'Note', line.text);
      facts.push({ label: 'Note', text: line.text });
    });
    if (!before.children.length) before.remove();

    renderConditionTable(tree, body, { fieldLink, onEdit, label: 'Show rule' });

    const after = factRows(body);
    if (links()) {
      const depends = (refs().dependsOn.get(element.key) || []).map((entry) => (
        entry.key ? linkNode(elementOf(entry.key).name, `Select ${elementOf(entry.key).name}`, () => jump(entry.key))
          : unknownNode(`${entry.field} (not an element)`)));
      if (depends.length) {
        const parts = [];
        depends.forEach((part, i) => { if (i) parts.push(', '); parts.push(part); });
        factRow(after, 'Depends on', parts, { className: 'fc-depends' });
      }
    }
    const written = ruleSummary(element.show);
    if (written) {
      factRow(after, 'As written', monoNode(written));
      facts.push({ label: 'As written', text: written });
    }
    return true;
  }

  /* ------------------------------------------------ a step's Validation tab */

  function requiredCard(items, container) {
    if (!items.length) return;
    const certain = items.some((item) => !item.estimated);
    const facts = items.map((item) => ({ label: item.name, text: item.reason + (item.estimated ? ' · estimated ≈' : '') }));
    const { body } = factCard(container, {
      name: 'Required and empty', id: 'required',
      verdict: verdictTag('fails', { estimated: !certain }),
      tip: `Visible required elements of the step whose value is empty now. ${STOPPERS_LEDE}`,
      copy: { text: () => cardText({ title: 'Required and empty', rows: facts }), title: 'Copy the Required and empty card as text. Honours Mask values.', help: 'Step validation' }
    });
    const rows = factRows(body);
    items.forEach((item) => {
      const link = linkNode(item.name, `Select ${item.name}`, () => jump(item.elementKey));
      factRow(rows, link, [item.reason, item.estimated ? tagNode(TAGS.estimated) : ''], { isName: true });
    });
  }

  function ruleCard(rule, container) {
    const element = elementOf(rule.elementKey);
    if (!element) return;
    const judged = judgeValidation(element, false);
    const tag = verdictTag(rule.verdict, { estimated: rule.estimated });
    const tags = rule.estimated ? [TAGS.estimated] : [];
    const step = rule.outside ? stepOf(element) : '';
    const why = rule.verdict === 'hidden' ? 'hidden, so it holds nobody back' : whyOf(judged.tree, rule.verdict === 'unknown' ? headline(element) : '');
    let facts = [];
    const { body } = factCard(container, {
      name: element.validation.kind === 'messaging' ? 'Messaging' : 'Set Errors',
      link: elementLink(element),
      verdict: tag, tags,
      why: step ? [`(in ${step}) `].concat(why || []) : why,
      tip: RULE_TIP,
      id: 'rule',
      fold: foldFor(`rule:${element.key}`, rule.verdict === 'fails'),
      copy: {
        text: () => cardText({ title: `${element.validation.kind === 'messaging' ? 'Messaging' : 'Set Errors'} · ${element.name}`, verdict: tag.text, rows: facts, tree: judged.tree, mask: Mask.on() }),
        title: 'Copy this rule as text. Honours Mask values.', help: 'Step validation'
      }
    });
    facts = fillValidation(element, body, judged, { editable: false, asWritten: false });
  }

  function stepOf(element) {
    let node = element;
    let guard = 0;
    while (node && node.depth > 0 && guard++ < 100) node = elementOf(node.parentKey);
    return node ? node.name : '';
  }

  function customCard(item, container) {
    const verdict = item.hidden ? 'hidden' : (item.tree && item.tree.ok === null ? 'unknown' : 'shown');
    const why = item.tree ? whyOf(item.tree, item.verdict || '') : 'no condition, always shown';
    const tail = item.overriddenBy ? ` · overridden by ${item.overriddenBy}` : '';
    const { body } = factCard(container, {
      name: '',
      link: { text: item.name, title: `Select ${item.name}`, onClick: () => jump(item.elementKey) },
      verdict: { ...verdictTag(verdict), title: item.verdict || 'Always shown' },
      why: [].concat(why || [], tail),
      tip: CUSTOM_TIP,
      id: 'custom',
      fold: item.tree ? foldFor(`custom:${item.elementKey}`, verdict === 'hidden') : null,
      indent: !item.tree
    });
    /* A component with no show rule is its header line alone. */
    if (item.tree) renderConditionTable(item.tree, body, { fieldLink, label: 'Show rule' });
    else body.remove();
  }

  /* What may stop Next on a step, as cards: the required fields still empty,
   * every validation rule of the step (failing ones open), and its custom components. */
  function renderStepValidation(stoppers, rules, container) {
    if (state.data === undefined) {
      container.appendChild(notice('', 'The data could not be read, so nothing was checked.', false));
    }
    requiredCard(stoppers.required.concat(stoppers.estimated.filter((item) => item.kind === 'required')), container);
    if (rules.length) {
      factSection(container, `Validation rules (${rules.length})`);
      rules.forEach((rule) => ruleCard(rule, container));
    }
    if (!stoppers.custom.length) return;
    factSection(container, `Custom components (${stoppers.custom.length})`);
    stoppers.custom.forEach((item) => customCard(item, container));
    factNote(container, CUSTOM_NOTE);
  }

  return { renderValidation, renderVisibility, renderStepValidation, fieldLink };
}
