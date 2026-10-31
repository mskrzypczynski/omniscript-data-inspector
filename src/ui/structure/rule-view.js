'use strict';

/* The rule-shaped parts of the Structure detail pane, drawn instead of JSON:
 * the conditions of a show rule or a validation expression as the table of a
 * Visibility or Validation card (a ✓ / ✗ per condition, Field, Must be, Is now,
 * and the condition in plain language under it), and, in the Properties tab,
 * a rule as one aligned table.
 *
 * Only DOM here; every decision (which rule is true, the words of a reading)
 * comes from src/core/. */

import { whatIfText } from '../../core/structure/what-if.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { notEvaluatedText } from '../../core/structure/formula.js';
import { kindOf, RESULT_WORDS, groupHeadline, rollUp } from '../../core/structure/rule-words.js';
import {
  TAGS, mustBe, isNow, conditionReading, conditionDot, groupReading, shortName
} from '../../core/structure/fact-words.js';
import { tagNode, monoNode, unknownNode } from './fact-card.js';

function span(className, text, title) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  if (title) node.title = title;
  return node;
}

const ESTIMATE_TITLE = 'Estimated: this result rests on a formula that the panel evaluates best effort.';

/* A result is its mark and what it says: "✓ true now", "✗ false now", "? can't tell".
 * One that rests on a formula's estimate is drawn with ≈ in front. */
function markOf(ok, estimated, { saysWords = true } = {}) {
  const { glyph, words } = RESULT_WORDS[kindOf(ok)];
  const node = span(`rule-mark is-${kindOf(ok)}${estimated ? ' is-estimated' : ''}`, '');
  node.appendChild(span('rule-glyph', `${estimated ? '≈' : ''}${glyph}`));
  if (saysWords) node.appendChild(span('rule-words', ` ${words}`));
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', estimated ? `${words} (estimated)` : words);
  if (estimated) node.title = ESTIMATE_TITLE;
  return node;
}

/* The comparison as a person writes it. */
const OPERATOR = { '==': '=', '<>': '≠', '!=': '≠', '>=': '≥', '<=': '≤' };
const operatorText = (condition) => OPERATOR[condition] || condition;

/* What the field holds now, never blank. The model gives display() text:
 * "not set" for a field the data does not have, "" for an empty string. */
function isNowText(node) {
  if (node.actual === null) return '(no data)';
  if (node.ok === null) return "can't tell";
  if (node.actual === 'not set') return '(not in data)';
  if (node.actual === '""') return '(empty)';
  return node.actual;
}

function cell(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* "What if": the Is now cell becomes an input to try another value. Enter or
 * leaving the box keeps it, Escape drops it. Nothing is written to the page. */
function startEdit(td, button, node, ctx) {
  const initial = whatIfText(node.actualValue);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'whatif-input';
  input.value = initial;
  input.spellcheck = false;
  input.setAttribute('aria-label', `Value of ${node.field} to try`);
  let finished = false;
  const finish = (keep) => {
    if (finished) return;
    finished = true;
    if (keep && input.value !== initial) { ctx.onEdit(node.field, input.value); return; }
    input.replaceWith(button);
    button.focus();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  button.replaceWith(input);
  input.focus();
  input.select();
}

/* The Is now cell of a rule that can be tried with another value. */
function editableNow(td, node, ctx, text = isNowText(node)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'whatif-cell';
  button.textContent = text;
  button.title = 'Try another value to see how the verdict changes. Nothing is written to the page.';
  button.addEventListener('click', () => startEdit(td, button, node, ctx));
  td.appendChild(button);
  if (node.edited) {
    const tag = span(`rule-edited ${tagClasses('info')}`, 'edited');
    tag.title = 'A value typed in here, not what the data holds. Reset what-if puts them back.';
    td.appendChild(tag);
  }
}

function drawLeaf(node, body, ctx, depth) {
  const row = document.createElement('tr');
  row.className = `rule-leaf is-${kindOf(node.ok)}`;
  row.style.setProperty('--depth', String(depth));

  const mark = cell('td', 'rule-col-mark');
  mark.appendChild(markOf(node.ok, node.estimated));
  row.appendChild(mark);

  const field = cell('th', 'rule-field');
  field.scope = 'row';
  const button = ctx.fieldButton ? ctx.fieldButton(node.field) : null;
  if (button) field.appendChild(button);
  else field.textContent = node.field || '(no field)';
  row.appendChild(field);

  const must = cell('td', 'rule-cond', `${operatorText(node.condition)} ${node.expected}`);
  if (node.expectedEstimated) must.title = 'Estimated from a formula, best effort.';
  else if (node.formula && node.reason) must.title = notEvaluatedText(node.reason);
  row.appendChild(must);
  const now = cell('td', `rule-now${node.ok === null ? ' is-unknown' : ''}`);
  const editable = ctx.onEdit && node.actual !== null && node.field && !node.field.startsWith('=');
  if (editable) editableNow(now, node, ctx); else now.textContent = isNowText(node);
  if (node.actualEstimated) now.title = 'Estimated from the Formula element\'s expression: the data holds no value yet.';
  row.appendChild(now);
  body.appendChild(row);
}

function drawGroup(node, body, ctx, depth) {
  const row = document.createElement('tr');
  row.className = `rule-group-row is-${kindOf(node.ok)}`;
  row.style.setProperty('--depth', String(depth));
  const head = cell('th', 'rule-group-head');
  head.colSpan = 4;
  head.scope = 'colgroup';
  /* The mark says whether it holds; the headline says what it is (ALL of these are true); only a group that can't be told needs the words too. */
  head.appendChild(markOf(node.ok, node.estimated, { saysWords: node.ok === null }));
  head.appendChild(document.createTextNode(` ${groupHeadline(node.operator)} `));
  head.appendChild(span('rule-now', rollUp(node)));
  row.appendChild(head);
  body.appendChild(row);
  node.children.forEach((child) => draw(child, body, ctx, depth + 1));
}

function draw(node, body, ctx, depth) {
  if (node.kind === 'group') drawGroup(node, body, ctx, depth);
  else drawLeaf(node, body, ctx, depth);
}

/* tree: core/structure/visibility.js ruleTree(). One aligned table: result, field, what
 * it must be, what it is now, so the values line up. ctx.fieldButton(field)
 * returns a button that selects the element the field names, or null when it
 * names none. ctx.onEdit(field, text), when given, makes the Is now cell of a
 * rule that has data editable (what if). A group holding a single rule needs
 * no header of its own. */
export function renderRuleTree(tree, container, ctx = {}) {
  if (!tree) return;
  const table = document.createElement('table');
  table.className = 'rule-table';
  table.setAttribute('aria-label', 'Rule');

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const result = cell('th', 'rule-col-mark');
  result.scope = 'col';
  result.appendChild(cell('span', 'sr-only', 'Result'));
  headRow.appendChild(result);
  [['Field', 'rule-field'], ['Must be', 'rule-cond'], ['Is now', 'rule-now']].forEach(([text, className]) => {
    const th = cell('th', className, text);
    th.scope = 'col';
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement('tbody');
  const root = tree.kind === 'group' && tree.children.length === 1 && tree.children[0].kind === 'rule'
    ? tree.children[0] : tree;
  draw(root, body, ctx, 0);
  table.appendChild(body);
  container.appendChild(table);
}

/* ------------------------------------------------ the conditions of a card */

/* A condition's ● / ○ / ?, said once: "met", "not met", "can't tell". Neutral on
 * purpose: a met condition is good on a show rule and the reason a Set Errors
 * element fails, so colour belongs to the card's verdict, not to the row. */
function conditionMarkNode(ok, { estimated = false, className = 'fc-mark-glyph' } = {}) {
  const mark = conditionDot(ok);
  const out = span(`${className} is-${mark.kind}`, `${estimated ? '≈' : ''}${mark.glyph}`);
  out.setAttribute('role', 'img');
  out.setAttribute('aria-label', estimated ? `${mark.words} (estimated)` : mark.words);
  if (estimated) out.title = ESTIMATE_TITLE;
  return out;
}

function conditionRow(node, body, ctx, depth) {
  const main = document.createElement('tr');
  main.className = `fc-main is-${kindOf(node.ok)}`;
  main.style.setProperty('--depth', String(depth));

  const markCell = cell('td', 'fc-mark');
  markCell.appendChild(conditionMarkNode(node.ok, { estimated: node.estimated }));
  main.appendChild(markCell);

  const field = cell('td', 'fc-col-field');
  field.dataset.label = 'Field';
  const link = ctx.fieldLink ? ctx.fieldLink(node.field) : null;
  if (link) field.appendChild(link);
  else field.appendChild(monoNode(node.field ? shortName(node.field) : '(no field)', node.field || ''));
  main.appendChild(field);

  const must = cell('td', 'fc-col-must fc-mono', mustBe(node));
  must.dataset.label = 'Must be';
  if (node.expectedEstimated) must.title = 'Estimated from a formula, best effort.';
  else if (node.formula && node.reason) must.title = notEvaluatedText(node.reason);
  main.appendChild(must);

  const now = cell('td', 'fc-col-now');
  now.dataset.label = 'Is now';
  const shown = isNow(node);
  const editable = ctx.onEdit && node.actual !== null && node.field && !node.field.startsWith('=');
  if (editable) {
    editableNow(now, node, ctx, shown.text);
    now.firstChild.classList.add(shown.unknown ? 'fc-unknown' : 'fc-mono');
  } else {
    now.appendChild(shown.unknown ? unknownNode(shown.text) : monoNode(shown.text));
  }
  if (node.edited && !editable) now.appendChild(tagNode(TAGS.edited));
  if (node.actualEstimated) now.title = 'Estimated from the Formula element\'s expression: the data holds no value yet.';
  main.appendChild(now);
  body.appendChild(main);

  /* The condition in plain language, under its row; at a narrow pane it comes
   * first, with the mark. */
  const read = document.createElement('tr');
  read.className = 'fc-read';
  read.style.setProperty('--depth', String(depth));
  read.appendChild(cell('td', 'fc-read-gap'));
  const text = cell('td', 'fc-read-text');
  text.colSpan = 3;
  const narrowMark = conditionMarkNode(node.ok, { estimated: node.estimated, className: 'fc-mark-copy' });
  narrowMark.setAttribute('aria-hidden', 'true');
  narrowMark.removeAttribute('role');
  text.appendChild(narrowMark);
  const reading = conditionReading(node);
  text.appendChild(monoNode(reading.name));
  text.appendChild(document.createTextNode(reading.rest));
  read.appendChild(text);
  body.appendChild(read);
}

function conditionGroup(node, table, ctx, depth, isRoot) {
  const body = document.createElement('tbody');
  const row = document.createElement('tr');
  row.className = `fc-group-row is-${kindOf(node.ok)}`;
  row.style.setProperty('--depth', String(depth));
  const head = cell('td');
  head.colSpan = 4;
  /* The card's header says how the whole rule stands; a nested group says it with its mark. */
  if (!isRoot) head.appendChild(conditionMarkNode(node.ok, { estimated: node.estimated }));
  head.appendChild(document.createTextNode(`${isRoot ? '' : ' '}${groupReading(node)}`));
  row.appendChild(head);
  body.appendChild(row);
  table.appendChild(body);
  node.children.forEach((child) => drawCondition(child, table, ctx, isRoot ? depth : depth + 1));
}

function drawCondition(node, table, ctx, depth, isRoot = false) {
  if (node.kind === 'group') { conditionGroup(node, table, ctx, depth, isRoot); return; }
  const body = document.createElement('tbody');
  conditionRow(node, body, ctx, depth);
  table.appendChild(body);
}

/* tree: core/structure/visibility.js ruleTree(). The conditions of a Visibility
 * or Validation card: one row per condition, with its mark (met / not met /
 * can't tell, once), the Field as a link, what it Must be and what it Is now,
 * then the condition in plain language. A group reads what it needs and how it
 * stands ("All of these must be true; 1 of 2 is not"); a group holding a single
 * condition is that condition. ctx.fieldLink(field) returns the link of a field
 * that names an element, or null; ctx.onEdit(field, text), when given, makes
 * Is now editable (what if). */
export function renderConditionTable(tree, container, ctx = {}) {
  if (!tree) return null;
  const table = document.createElement('table');
  table.className = 'fc-table fc-cond';
  table.setAttribute('aria-label', ctx.label || 'Conditions');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  const markHead = cell('th', 'fc-mark');
  markHead.scope = 'col';
  markHead.appendChild(cell('span', 'sr-only', 'Met'));
  headRow.appendChild(markHead);
  [['Field', 'fc-col-field'], ['Must be', 'fc-col-must'], ['Is now', 'fc-col-now']].forEach(([text, className]) => {
    const th = cell('th', className, text);
    th.scope = 'col';
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);
  const root = tree.kind === 'group' && tree.children.length === 1 ? tree.children[0] : tree;
  drawCondition(root, table, ctx, 0, true);
  container.appendChild(table);
  return table;
}
