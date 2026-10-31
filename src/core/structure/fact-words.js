'use strict';

/* The words of the fact cards of the Structure detail pane (Current value,
 * Formula, Set values, Options, Merge fields, Visibility, Validation): the
 * verdict in a card's header, the tags after a value, the quiet type hint of a
 * value, and the plain-language reading of a condition and of a group of
 * conditions. The view only draws what this says.
 *
 * A tone is a word the view maps to a tag style: 'error' (red), 'ok' (green),
 * 'warn' (amber), 'neutral' (grey), 'info' (blue) and 'outline' (the bare,
 * outlined tag).
 *
 * Pure: no DOM, no chrome.*. */

import { maskValues } from '../shared/mask.js';
import { display } from './visibility.js';

/* ------------------------------------------------------------ tags */

/* The tags a value can carry: a state, never a sentence. */
export const TAGS = Object.freeze({
  estimated: Object.freeze({
    text: 'estimated ≈', tone: 'outline',
    title: 'Estimated, best effort: a formula the panel evaluates itself; the script decides what it really does.'
  }),
  readFromData: Object.freeze({ text: 'read from the data', tone: 'neutral', title: '' }),
  differs: Object.freeze({ text: 'differs', tone: 'warn', title: 'The computed value and the current value are not the same.' }),
  whatIf: Object.freeze({ text: 'what if', tone: 'info', title: 'A value typed into Is now decides this, not what the data holds. Reset what-if puts them back.' }),
  edited: Object.freeze({ text: 'edited', tone: 'info', title: 'A value typed in here, not what the data holds. Reset what-if puts them back.' })
});

/* "read from the data", with why the panel did not work it out itself. */
export function readFromDataTag(reason, name) {
  const why = reason ? `The panel cannot evaluate this formula (${reason}), so` : 'The panel cannot evaluate this formula, so';
  return { ...TAGS.readFromData, title: `${why} this is what the data holds${name ? ` for ${name}` : ''}.` };
}

/* "differs", said of an estimate when the computed value is one. */
export function differsTag({ estimated = false } = {}) {
  return estimated
    ? { ...TAGS.differs, title: 'Differs from the estimate of the formula, which is best effort.' }
    : { ...TAGS.differs };
}

/* ------------------------------------------------------------ verdicts */

/* The verdict a card's header carries: a word and a tone. */
export const VERDICTS = Object.freeze({
  fails: Object.freeze({ text: 'Fails', tone: 'error' }),
  passes: Object.freeze({ text: 'Passes', tone: 'ok' }),
  hidden: Object.freeze({ text: 'Hidden', tone: 'neutral' }),
  shown: Object.freeze({ text: 'Shown', tone: 'ok' }),
  unknown: Object.freeze({ text: "Can't tell", tone: 'neutral' })
});

/* A verdict word as its tag: { text, tone }. A 'fails' that rests on an estimate
 * is amber, not red: an estimate alone never makes a red mark. */
export function verdictTag(verdict, { estimated = false } = {}) {
  const tag = VERDICTS[verdict] || VERDICTS.unknown;
  return estimated && verdict === 'fails' ? { ...tag, tone: 'warn' } : { ...tag };
}

/* A Messaging / Validation element (live-validation.js liveMessaging): it fails
 * while the message it selects holds the user back. */
export function messagingVerdict(live) {
  if (!live || live.state === 'unknown') return 'unknown';
  return live.blocks ? 'fails' : 'passes';
}

/* A Set Errors element (liveSetErrors): it fails while its error is set. */
export function setErrorsVerdict(live) {
  if (!live || live.state === 'unknown') return 'unknown';
  return live.state === 'true' ? 'fails' : 'passes';
}

/* An element's show rule: hidden (by its own rule or a parent's), shown, or
 * can't tell. `ok` is its own rule's result (null: can't tell, undefined: no
 * rule), `hidden` whether the element is hidden now, `byParent` whether a
 * parent hides it whatever its own rule says. */
export function visibilityVerdict({ ok, hidden = false, byParent = false }) {
  if (byParent) return 'hidden';
  if (ok === null) return 'unknown';
  return hidden || ok === false ? 'hidden' : 'shown';
}

/* ------------------------------------------------------------ values */

/* The quiet hint after a simple value: what kind of value it is. */
export function valueHint(value) {
  if (value === undefined) return 'not in data';
  if (value === null || value === '') return 'empty';
  if (typeof value === 'boolean') return 'true/false';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'object';
  return 'text';
}

/* Does the value draw as a tree (an object or a list) rather than one line? */
export const isContainerValue = (value) => value !== null && typeof value === 'object';

/* The Current value card of a simple value: { text, hint, unknown }.
 *   text    — the value as a form shows it: unquoted, true / false as words,
 *             "null" for null, "" for an empty text; a choice element's stored
 *             value is joined with its option's label ("US (United States)")
 *   hint    — valueHint()
 *   unknown — nothing is in the data: the text is the dimmed "not in data"
 * `optionLabels` is the element's map of stored value -> option label. */
export function currentValueFact(value, { optionLabels = null } = {}) {
  const hint = valueHint(value);
  if (value === undefined) return { text: 'not in data', hint: '', unknown: true };
  if (value === null) return { text: 'null', hint, unknown: false };
  if (value === '') return { text: '""', hint, unknown: false };
  if (isContainerValue(value)) return { text: JSON.stringify(value), hint, unknown: false };
  const text = String(value);
  const label = optionLabels && (typeof value === 'string' || typeof value === 'number') ? optionLabels[text] : '';
  return { text: label && label !== text ? `${text} (${label})` : text, hint, unknown: false };
}

/* The hint of a row of the Form view (form-rows.js kinds): text is what a form
 * holds anyway, so it says nothing. */
const FORM_HINTS = { number: 'number', bool: 'true/false', empty: 'empty' };
export const formRowHint = (kind) => FORM_HINTS[kind] || '';

/* ------------------------------------------------------------ names */

/* An element's name from a field as a rule or a Set Values map writes it
 * (Step:Block|1:Field): its last part. The whole path goes in the tooltip. */
export function shortName(field) {
  const text = String(field === undefined || field === null ? '' : field).replace(/^%|%$/g, '');
  const last = text.split(':').pop();
  return last.replace(/\|\d+$/, '') || text;
}

/* ------------------------------------------------------------ conditions */

/* The comparison as a person writes it. */
const OPERATOR = { '==': '=', '<>': '≠', '!=': '≠', '>=': '≥', '<=': '≤' };

/* What a condition's value must be: "= true", "≥ 18", "≠ """. `rule` is a leaf
 * of visibility.js ruleTree(). */
export function mustBe(rule) {
  return `${OPERATOR[rule.condition] || rule.condition} ${rule.expected}`;
}

/* What the field holds now, never blank: { text, unknown }. Unknown is drawn
 * dimmed and italic. */
export function isNow(rule) {
  if (rule.actual === null || rule.actual === undefined) return { text: 'no data', unknown: true };
  if (rule.ok === null) return { text: "can't tell", unknown: true };
  if (rule.actual === 'not set') return { text: 'not in data', unknown: true };
  if (rule.actual === '""') return { text: 'empty', unknown: true };
  return { text: rule.actual, unknown: false };
}

/* How "the field is X" goes on, by operator, when the condition is met / not met. */
const MET = {
  '=': () => '',
  '==': () => '',
  '<>': (expected) => `not ${expected}`,
  '!=': (expected) => `not ${expected}`,
  '>': (expected) => `which is more than ${expected}`,
  '<': (expected) => `which is less than ${expected}`,
  '>=': (expected) => `which is ${expected} or more`,
  '<=': (expected) => `which is ${expected} or less`
};
const NOT_MET = {
  '=': (expected) => `not ${expected}`,
  '==': (expected) => `not ${expected}`,
  '<>': () => 'which it must not be',
  '!=': () => 'which it must not be',
  '>': (expected) => `which is not more than ${expected}`,
  '<': (expected) => `which is not less than ${expected}`,
  '>=': (expected) => `which is less than ${expected}`,
  '<=': (expected) => `which is more than ${expected}`
};
const BLANK = new Set(['null', 'not set', '""']);

/* The condition in plain language, as { name, rest }: the field's short name
 * (drawn in mono) and the rest of the sentence. Read together:
 *   met       FO_Age is 30, which is 18 or more
 *             FO_Kind is "Business"
 *   not met   FO_HasCard is false, not true
 *             FO_HasCard is null, which counts as not true
 *   unknown   FO_Total: can't tell (a formula the panel does not evaluate)
 * `rule` is a leaf of visibility.js ruleTree(). */
export function conditionReading(rule) {
  const name = shortName(rule.field || '') || '(no field)';
  if (rule.actual === null || rule.actual === undefined) return { name, rest: ': no data was read' };
  if (rule.ok === null) {
    return { name, rest: rule.formula ? ": can't tell (a formula the panel cannot evaluate)" : ": can't tell (an operator the panel does not evaluate)" };
  }
  const is = `is ${rule.actual === 'not set' ? 'not in the data' : (rule.actual === '""' ? 'empty' : rule.actual)}`;
  const condition = rule.condition;
  if (rule.ok) {
    const how = (MET[condition] || ((expected) => `which meets ${condition} ${expected}`))(rule.expected);
    return { name, rest: how ? ` ${is}, ${how}` : ` ${is}` };
  }
  if ((condition === '=' || condition === '==') && rule.expected === 'true' && BLANK.has(rule.actual)) {
    return { name, rest: ` ${is}, which counts as not true` };
  }
  return { name, rest: ` ${is}, ${(NOT_MET[condition] || ((expected) => `which fails ${condition} ${expected}`))(rule.expected)}` };
}

/* The mark of a condition row, said once: whether the condition is met now. */
export function conditionMark(ok) {
  if (ok === true) return { glyph: '✓', words: 'met', kind: 'true' };
  if (ok === false) return { glyph: '✗', words: 'not met', kind: 'false' };
  return { glyph: '?', words: "can't tell", kind: 'unknown' };
}

/* The mark of a condition row on screen: a neutral dot, not a tick. Whether a met
 * condition is good depends on the card (a met Set Errors rule is why it fails), so
 * the row says only met / not met and the card's verdict carries the colour. */
export function conditionDot(ok) {
  const mark = conditionMark(ok);
  return { ...mark, glyph: ok === true ? '●' : ok === false ? '○' : '?' };
}

/* The line of a group of conditions: what it needs, and how it stands now.
 *   All of these must be true; 1 of 2 is not
 *   One of these must be true; none is
 * `node` is a group of ruleTree(). */
export function groupReading(node) {
  const all = node.operator !== 'OR';
  const head = all ? 'All of these must be true' : 'One of these must be true';
  if (!node.total) return `${head}; there are none`;
  if (node.ok === null || node.ok === undefined) return `${head}; can't tell`;
  if (all) {
    if (node.ok) return `${head}; ${node.total === 1 ? 'it is' : `all ${node.total} are`}`;
    return `${head}; ${node.fails} of ${node.total} ${node.fails === 1 ? 'is' : 'are'} not`;
  }
  if (!node.ok) return `${head}; none is`;
  return `${head}; ${node.holds} of ${node.total} ${node.holds === 1 ? 'is' : 'are'}`;
}

/* The condition that decides a rule tree, for the one line of a closed card:
 * the first one whose result is the tree's own (the first false one of a
 * failing ALL group, the first true one of a holding ANY group). null for no
 * tree or one that can't be told. */
export function decidingCondition(tree) {
  if (!tree) return null;
  if (tree.kind === 'rule') return tree;
  if (tree.ok === null || tree.ok === undefined) return null;
  const child = tree.children.find((node) => node.ok === tree.ok);
  return child ? decidingCondition(child) : null;
}

/* ------------------------------------------------------------ messages */

/* "Requirement, which blocks Next": what a message type does to the user. */
export function messageKind(message, blocks) {
  const type = (message && message.type) || 'Message';
  return `${type}, which ${blocks ? 'blocks' : 'does not block'} Next`;
}

/* The label of a message's row on a Validation card: the one the result selects
 * now is what it Shows; the others say when they would be shown. */
export function messageLabel(message, state) {
  if (state !== 'unknown' && message.when && message.when === state) return 'Shows';
  if (message.when === 'true') return 'If it passes';
  if (message.when === 'false') return 'If it fails';
  return message.condition ? `When ${message.condition}` : 'Message';
}

/* When a Set Errors element checks its condition. */
export function checkedWhen(runsOn) {
  return /^step$/i.test(runsOn || 'step') ? 'When the user moves between steps' : `On ${runsOn}`;
}

/* ------------------------------------------------------------ copy */

const MASKED = '(masked)';

/* Each condition of a rule tree as one line of text, indented by its group:
 *   ✗ FO_HasCard = true · is now false · FO_HasCard is false, not true
 * With `mask`, what the data holds is masked and the reading (which repeats it)
 * is left out. */
export function conditionLines(tree, { mask = false } = {}) {
  const lines = [];
  const walk = (node, depth) => {
    const indent = '  '.repeat(depth);
    if (node.kind === 'group') {
      lines.push(`${indent}${groupReading(node)}`);
      node.children.forEach((child) => walk(child, depth + 1));
      return;
    }
    const now = isNow(node);
    const shown = mask && !now.unknown && node.actualValue !== undefined ? display(maskValues(node.actualValue)) : now.text;
    const reading = conditionReading(node);
    const tail = mask ? '' : ` · ${reading.name}${reading.rest}`;
    lines.push(`${indent}${conditionMark(node.ok).glyph} ${node.field} ${mustBe(node)} · is now ${shown}${tail}`);
  };
  if (tree) walk(tree.kind === 'group' && tree.children.length === 1 ? tree.children[0] : tree, 0);
  return lines;
}

/* A rule card as text for Copy: its name and verdict, its labelled rows (a row
 * whose text came from the data reads "(masked)" with `mask`), then its
 * conditions. `rows` is [{ label, text, data }]. */
export function cardText({ title, verdict = '', rows = [], tree = null, mask = false }) {
  const lines = [verdict ? `${title} · ${verdict}` : title];
  rows.forEach((row) => lines.push(`${row.label}\t${mask && row.data ? MASKED : String(row.text).replace(/[\t\r\n]+/g, ' ')}`));
  return lines.concat(conditionLines(tree, { mask })).join('\n');
}
