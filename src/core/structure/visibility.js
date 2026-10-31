'use strict';

/* Why is an element hidden? An element's propSetMap.show holds a rule group
 * ({ operator, rules: [{ field, condition, data }], groups }); the runtime
 * evaluates it against the live data and records the outcome as bShow on the
 * element. The definition is read once, so bShow is a snapshot — these helpers
 * re-evaluate the rules against the current data instead, and fall back to the
 * snapshot only for rules they cannot judge.
 *
 * Best effort by design: operators the Designer offers beyond the six
 * comparisons come back as "unknown" rather than a guess. A value that is a
 * formula (it starts with "=") is evaluated with evaluateFormula, and so is a
 * field that names a Formula element the data holds nothing for yet; a verdict
 * that depends on either is marked `estimated`, and stays a verdict only for
 * display: nothing that counts as an error may rest on it alone. A formula
 * that cannot be evaluated is "unknown".
 *
 * Pure: no DOM, no chrome.*. */

import { lookup, formatRule } from '../shared/structure-model.js';
import { createEstimator } from './formula-values.js';

const COMPARISONS = new Set(['=', '==', '<>', '!=', '>', '<', '>=', '<=']);
const MAX_DEPTH = 6;

export { lookup };

function isMerge(text) {
  return typeof text === 'string' && /^%[^%]+%$/.test(text.trim());
}

function isFormula(text) {
  return typeof text === 'string' && text.trim().startsWith('=');
}

/* A plain decimal: no leading zero ("01234" is an identifier, not 1234), no
 * hex ("0x10"), no exponent, no sign other than "-". */
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const PLAIN_INTEGER = /^-?(0|[1-9]\d*)$/;
/* Past this many digits a number no longer survives being a double. */
const SAFE_DIGITS = 15;

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && PLAIN_NUMBER.test(value.trim())) {
    /* An identifier of 16+ digits is a different value from its neighbour even
     * when the two round to the same double: it is compared as an integer. */
    if (value.trim().replace(/^-/, '').length > SAFE_DIGITS && !value.includes('.')) return null;
    return Number(value);
  }
  return null;
}

/* The integer a long digit string stands for, or null. */
function asLongInteger(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && PLAIN_INTEGER.test(value.trim())) return BigInt(value.trim());
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

/* The text two values are compared as. true and false are written however the
 * data holds them (a real boolean, "true", "TRUE"). */
function asText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean' || (typeof value === 'string' && /^(true|false)$/i.test(value.trim()))) {
    return String(value).trim().toLowerCase();
  }
  return String(value);
}

/* "Less than" a value that is not there: text order would put '' before
 * everything, so an empty field would look less than any number. (">" and ">="
 * give false for an empty value either way, which is the right answer.) */
const LESS_THAN = new Set(['<', '<=']);
const isBlank = (value) => value === undefined || value === null || value === '';

/* true / false, or null when the rule cannot be judged. */
export function compare(actual, condition, expected) {
  if (!COMPARISONS.has(condition)) return null;
  if ((actual !== null && typeof actual === 'object' && !Array.isArray(actual)) ||
      (expected !== null && typeof expected === 'object')) return null;

  if (Array.isArray(actual)) {
    if (condition === '=' || condition === '==') return actual.map(asText).includes(asText(expected));
    if (condition === '<>' || condition === '!=') return !actual.map(asText).includes(asText(expected));
    return null;
  }

  if (LESS_THAN.has(condition) && (isBlank(actual) || isBlank(expected))) return null;

  const left = asNumber(actual);
  const right = asNumber(expected);
  const numeric = left !== null && right !== null;
  const ordering = condition !== '=' && condition !== '==' && condition !== '<>' && condition !== '!=';

  /* Long integers (ids) are compared as integers, not as doubles. */
  if (!numeric) {
    const bigLeft = asLongInteger(actual);
    const bigRight = asLongInteger(expected);
    if (bigLeft !== null && bigRight !== null) return compareValues(bigLeft, condition, bigRight);
  }

  /* "$5" against 10: text order would answer, and the answer would be about
   * characters. A number against something that is not one cannot be ordered. */
  if (ordering && (left === null) !== (right === null) && !isBlank(actual) && !isBlank(expected)) return null;

  const a = numeric ? left : asText(actual);
  const b = numeric ? right : asText(expected);
  return compareValues(a, condition, b);
}

function compareValues(a, condition, b) {
  switch (condition) {
    case '=': case '==': return a === b;
    case '<>': case '!=': return a !== b;
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: return null;
  }
}

/* What a field or an expected value comes to: the plain value, or a formula's
 * estimate. A %merge% may name a Formula element the data does not hold yet. */
/* The estimator with some fields read as the user typed them ("what if"):
 * `overrides` maps a field, as a rule writes it, to the value it should hold.
 * The page and its data are not touched; only this reading changes. */
export function withOverrides(ctx, overrides, data) {
  const base = ctx || createEstimator([], data);
  const map = overrides instanceof Map ? overrides : new Map(Object.entries(overrides || {}));
  if (!map.size) return base;
  return {
    ...base,
    read: (field) => {
      const name = String(field).replace(/^%|%$/g, '');
      return map.has(name) ? { value: map.get(name), estimated: false, edited: true } : base.read(field);
    }
  };
}

function operand(raw, ctx, { merge }) {
  if (isFormula(raw)) {
    const result = ctx.evaluate(raw);
    return result.ok
      ? { value: result.value, estimated: true, formula: true, ok: true }
      : { value: undefined, estimated: false, formula: true, ok: false, reason: result.reason };
  }
  if (merge) {
    const read = ctx.read(raw);
    return {
      value: read ? read.value : undefined, estimated: !!(read && read.estimated), formula: false, ok: true,
      edited: !!(read && read.edited)
    };
  }
  return { value: raw, estimated: false, formula: false, ok: true };
}

function leaf(rule, data, ctx) {
  const field = rule.field || rule.name || '';
  const condition = rule.condition || rule.operator || '=';
  const rawExpected = rule.data !== undefined ? rule.data : rule.value;

  const actual = !field ? { value: undefined, estimated: false, ok: true }
    : operand(field, ctx, { merge: !isFormula(field) });
  const expected = operand(rawExpected, ctx, { merge: isMerge(rawExpected) });
  const judged = !!field && actual.ok && expected.ok;
  const result = judged ? compare(actual.value, condition, expected.value) : null;

  return {
    kind: 'rule',
    text: formatRule(rule),
    field,
    condition,
    expected: expected.formula && !expected.ok ? rawExpected : (expected.value === undefined ? '' : expected.value),
    actual: actual.value,
    result,
    /* The field was given a value by hand (withOverrides). */
    edited: !!(actual.edited || expected.edited),
    /* The verdict rests on a formula's estimate. */
    estimated: result !== null && (actual.estimated || expected.estimated),
    expectedFormula: expected.formula,
    expectedOk: expected.ok,
    expectedEstimated: expected.estimated,
    actualEstimated: actual.estimated,
    formulaReason: expected.reason || actual.reason || ''
  };
}

function group(node, data, depth, ctx) {
  const operator = String(node.operator || node.conditionOp || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  const children = [];

  (node.rules || []).forEach((rule) => {
    if (!rule || typeof rule !== 'object') return;
    if (rule.group || rule.rules || rule.groups) children.push(group(rule.group || rule, data, depth + 1, ctx));
    else children.push(leaf(rule, data, ctx));
  });
  (node.groups || []).forEach((nested) => {
    if (nested && typeof nested === 'object') children.push(group(nested.group || nested, data, depth + 1, ctx));
  });

  let result;
  let estimated = false;
  if (!children.length || depth > MAX_DEPTH) {
    result = null;
  } else if (operator === 'AND') {
    if (children.some((c) => c.result === false)) {
      result = false;
      estimated = onlyEstimated(children, false);
    } else {
      result = children.some((c) => c.result === null) ? null : true;
      estimated = result === true && children.some((c) => c.estimated);
    }
  } else if (children.some((c) => c.result === true)) {
    result = true;
    estimated = onlyEstimated(children, true);
  } else {
    result = children.some((c) => c.result === null) ? null : false;
    estimated = result === false && children.some((c) => c.estimated);
  }

  return { kind: 'group', operator, children, result, estimated, edited: children.some((c) => c.edited) };
}

/* A verdict that one child settles is estimated only when every child that
 * settles it is: one certain rule is enough to be sure. */
function onlyEstimated(children, deciding) {
  const decisive = children.filter((c) => c.result === deciding);
  return decisive.length > 0 && decisive.every((c) => c.estimated);
}

/* { result: true | false | null, tree, estimated } for a propSetMap.show
 * value. `ctx` is createEstimator()'s result; without one, formulas written in
 * the rule are still evaluated, but a Formula element is not looked up. */
export function evaluateShow(show, data, ctx) {
  if (!show || typeof show !== 'object' || data === undefined || data === null) {
    return { result: null, tree: null, estimated: false };
  }
  const tree = group(show.group || show, data, 0, ctx || createEstimator([], data));
  return { result: tree.result, tree, estimated: tree.result !== null && tree.estimated };
}

/* What made a false group false: every false child of an AND (an OR inside
 * it stays one item, { kind: 'one-of', rules }, because only one of its rules
 * needs to hold), and every rule of an OR (all of them were false). */
export function failingRules(tree) {
  if (!tree || tree.result !== false) return [];
  if (tree.kind === 'rule') return [tree];
  if (tree.operator === 'OR') return tree.children.flatMap((child) => failingRules(child));
  return tree.children
    .filter((child) => child.result === false)
    .flatMap((child) => (child.kind === 'group' && child.operator === 'OR'
      ? [{ kind: 'one-of', rules: failingRules(child) }]
      : failingRules(child)));
}

/* A value as written in a sentence. The rule stores "true" as text while the
 * data holds a real boolean (or the other way round), and quoting one side
 * but not the other made a failing rule read as if it contradicted itself, so
 * true, false and numbers are shown bare whatever their type. */
export function display(value) {
  if (value === undefined) return 'not set';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return /^(true|false)$/i.test(value) || (value.trim() !== '' && Number.isFinite(Number(value)))
      ? value : JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const SHOULD = {
  '=': 'be', '==': 'be', '<>': 'not be', '!=': 'not be',
  '>': 'be greater than', '<': 'be less than', '>=': 'be at least', '<=': 'be at most'
};

/* "StepA:Kind should be alpha, but is "beta"" */
export function describeFailure(rule) {
  if (rule.kind === 'one-of') return `one of: ${rule.rules.map(describeFailure).join(' or ')}`;
  const should = SHOULD[rule.condition] || `satisfy ${rule.condition}`;
  return `${rule.field} should ${should} ${display(rule.expected)}, but is ${display(rule.actual)}`;
}

/* The same evaluator for a validateExpression: { result, tree }. Only a rule
 * group can be judged; a formula string comes back unknown. */
export function evaluateExpression(expression, data, ctx) {
  if (!expression || typeof expression !== 'object') return { result: null, tree: null, estimated: false };
  return evaluateShow(expression, data, ctx);
}

/* Per element key: { hidden, via, evaluation }.
 *   hidden      — hidden itself or because an ancestor is
 *   ownHidden   — hidden by its own rule (or its own bShow), whatever its parents do
 *   via         — key of the topmost element responsible: a hidden ancestor
 *                 when there is one, else itself; null when visible
 *   evaluation  — this element's own show rules against the live data, or null
 *   estimated   — whether hidden / shown rests on a formula's estimate, here
 *                 or in a parent, or on a rule that cannot be judged, and
 *                 nothing certain settles it
 *   unknown     — it has a show rule this code cannot judge (an operator it
 *                 does not know, a formula that does not evaluate, no data)
 * An element's own state comes from re-evaluating its rules; only when those
 * cannot be judged does the definition's bShow snapshot decide, for how the
 * list looks. That snapshot is stale and is not evidence: an `unknown` element
 * is `estimated`, so it is never counted as hidden and what it would stop is
 * listed apart, like any other finding that rests on an estimate. */
export function computeVisibility(elements, data) {
  const out = {};
  const ctx = createEstimator(elements, data);
  elements.forEach((element) => {
    const evaluation = element.show ? evaluateShow(element.show, data, ctx) : null;
    const live = evaluation && evaluation.result !== null;
    const ownHidden = live ? evaluation.result === false : element.shown === false;
    const ownEstimated = !!(live && evaluation.estimated);
    const unknown = !!element.conditional && !live;

    const parent = out[element.parentKey];
    const parentVia = parent && parent.hidden ? parent.via : null;

    /* Hidden for certain when a rule that holds no estimate hides it, or a
     * parent that is certainly hidden does. */
    const certainlyHidden = (ownHidden && !ownEstimated && !unknown) || !!(parent && parent.hidden && !parent.estimated);

    out[element.key] = {
      hidden: ownHidden || !!parentVia,
      ownHidden,
      via: parentVia || (ownHidden ? element.key : null),
      evaluation,
      live: !!live,
      unknown,
      estimated: !certainlyHidden && (ownEstimated || unknown || !!(parent && parent.estimated))
    };
  });
  return out;
}

/* Hidden for certain, as against hidden by a guess: a formula's estimate, a
 * rule that cannot be judged and the stale bShow behind it, or a parent that is
 * hidden for one of those reasons. Only this is shown as "hidden" and counted;
 * everything else that is `hidden` is dropped by Visible only and nothing more. */
export function isCertainlyHidden(info) {
  return !!(info && info.hidden && !info.estimated);
}

/* How a rule's two sides read: a formula's estimate carries ≈, a formula that
 * could not be evaluated is "(formula)". */
function sides(node) {
  const expected = node.expectedFormula && !node.expectedOk
    ? '(formula)'
    : (node.expectedEstimated ? `≈ ${display(node.expected)}` : display(node.expected));
  return { expected, actual: node.actualEstimated ? `≈ ${display(node.actual)}` : display(node.actual) };
}

/* One line per rule of the tree, in reading order, for a per-rule breakdown:
 * ok is true / false / null (not judged). */
export function ruleLines(tree) {
  if (!tree) return [];
  if (tree.kind === 'rule') {
    const text = sides(tree);
    const rest = ` ${tree.condition} ${text.expected} — currently ${text.actual}`;
    /* field and rest let a view make the field a button; text is the whole line. */
    return [{ ok: tree.result, text: `${tree.field}${rest}`, field: tree.field, rest }];
  }
  return tree.children.flatMap((child) => ruleLines(child));
}

/* What the detail pane says about an element's visibility:
 *   { hidden, headline, lines } — headline is '' for an element with no show
 * rule that is not hidden. `elementsByKey` resolves the hidden ancestor. */
export function explainVisibility(element, visibility, elementsByKey) {
  const info = visibility[element.key];
  if (!info) return { hidden: false, headline: '', lines: [] };

  const own = info.evaluation;
  const lines = ruleLines(own && own.tree);
  const extra = [];
  let headline = '';

  if (info.live && info.ownHidden) {
    headline = describeVerdict(toRuleTree(own.tree));
  } else if (info.hidden && info.via && info.via !== element.key) {
    const root = elementsByKey[info.via];
    headline = `Hidden because ${root ? root.name : 'a parent'} is hidden`;
    if (root) {
      const why = explainVisibility(root, visibility, elementsByKey);
      if (why.headline) extra.push({ ok: false, text: why.headline });
    }
  } else if (info.ownHidden) {
    headline = element.show
      ? describeVerdict(unjudgedTree(own), { assumed: false })
      : 'Hidden: the loaded copy of the definition says it was hidden';
  } else if (info.live) {
    headline = describeVerdict(toRuleTree(own.tree));
  } else if (element.show) {
    headline = describeVerdict(unjudgedTree(own), { assumed: true });
  }

  if (info.estimated && headline && !headline.endsWith('(estimated)')) headline += ' (estimated)';

  if (info.live && info.ownHidden === false && element.shown === false) {
    extra.push({ ok: null, text: 'The loaded copy of the definition says it was hidden, but its rules are true now. Rescan to reload it.' });
  }

  return { hidden: info.hidden, headline, lines: extra.concat(lines) };
}

/* The rule group as a tree a view can draw line by line, instead of one
 * sentence:
 *   group  { kind: 'group', operator: 'AND' | 'OR', label: 'ALL of' | 'ANY of', ok, children }
 *   rule   { kind: 'rule', ok, estimated, field, condition, expected, formula, reason, actual }
 * ok is true / false, or null when the rule cannot be judged (a formula that
 * does not evaluate, an operator the panel does not know, no data).
 * `expected` and `actual` are already text ("\"business\"", "not set");
 * `actual` is null when there is no data to read it from. A formula's estimate
 * reads "≈ 100", and `expected` is "(formula)" for a formula that could not be
 * evaluated (`reason` says why). `estimated` is true on a rule or group whose
 * verdict rests on such an estimate. `overrides` (a Map of field -> value, see
 * withOverrides) reads those fields as typed by hand: the rule's `edited` is
 * true, a group's when any of its rules is, and `actualValue` is the raw value.
 * The verdict, the roll-ups and the sentence all follow. null for something that is not a rule
 * group.
 *
 * Accepts { group: {...} } or a bare group, like evaluateShow. */
export function ruleTree(show, data, ctx, overrides) {
  if (!show || typeof show !== 'object') return null;
  const hasData = data !== undefined && data !== null && typeof data === 'object';
  const reading = hasData && overrides && (overrides.size || Object.keys(overrides).length)
    ? withOverrides(ctx, overrides, data) : (hasData ? ctx : undefined);
  const { tree } = evaluateShow(show, hasData ? data : {}, reading);
  return tree ? toRuleTree(tree, hasData) : null;
}

/* The evaluator's tree in the shape ruleTree documents. `hasData` false marks
 * every rule as not judged. A group also counts how many of its direct
 * children fail and hold, for its roll-up. */
function toRuleTree(evaluated, hasData = true) {
  const convert = (node) => {
    if (node.kind === 'group') {
      const children = node.children.map(convert);
      return {
        kind: 'group',
        operator: node.operator,
        label: node.operator === 'OR' ? 'ANY of' : 'ALL of',
        ok: hasData ? node.result : null,
        estimated: hasData && !!node.estimated,
        edited: hasData && !!node.edited,
        children,
        total: children.length,
        fails: children.filter((child) => child.ok === false).length,
        holds: children.filter((child) => child.ok === true).length
      };
    }
    const formula = !!node.expectedFormula;
    const text = sides(node);
    return {
      kind: 'rule',
      ok: hasData ? node.result : null,
      estimated: hasData && !!node.estimated,
      edited: hasData && !!node.edited,
      field: node.field,
      condition: node.condition,
      expected: text.expected,
      formula,
      /* Why a formula could not be evaluated, for a tooltip. */
      reason: node.formulaReason || '',
      expectedEstimated: !!node.expectedEstimated,
      actualEstimated: !!node.actualEstimated,
      /* The value as it is, for putting it in an input. */
      actualValue: hasData ? node.actual : undefined,
      actual: hasData ? text.actual : null
    };
  };
  return convert(evaluated);
}

/* A rule the live data could not judge, as a tree whose verdict is "not judged". */
function unjudgedTree(evaluation) {
  const tree = evaluation && evaluation.tree ? toRuleTree(evaluation.tree, false) : null;
  return tree || { kind: 'rule', ok: null, field: '', condition: '=', expected: '', actual: null };
}

/* How a failing comparison reads after "<field> is <value>, ". */
const NOT = {
  '=': (expected) => `not ${expected}`,
  '==': (expected) => `not ${expected}`,
  '<>': (expected) => `but must not be ${expected}`,
  '!=': (expected) => `but must not be ${expected}`,
  '>': (expected) => `not greater than ${expected}`,
  '<': (expected) => `not less than ${expected}`,
  '>=': (expected) => `not at least ${expected}`,
  '<=': (expected) => `not at most ${expected}`
};

function describeSingleFailure(rule) {
  const phrase = NOT[rule.condition] ? NOT[rule.condition](rule.expected) : `which fails ${rule.condition} ${rule.expected}`;
  return `${rule.field || '(no field)'} is ${rule.actual === null ? 'not read' : rule.actual}, ${phrase}`;
}

/* A group whose only content is one group or one rule is that group or rule. */
function unwrap(tree) {
  let node = tree;
  while (node && node.kind === 'group' && node.children.length === 1) node = node.children[0];
  return node;
}

/* The one sentence a person reads for a show rule, from ruleTree()'s output
 * (null: no rule). `assumed` is what the script itself shows when the rule
 * cannot be judged here (true shown, false hidden).
 *   no rule             Always shown
 *   true                Shown: its condition is true / Shown: at least one condition is true
 *   one rule fails      Hidden: Step:Plan is "Standard", not "Gold"
 *   ALL of, some fail   Hidden: 2 of 3 conditions fail (1 of 3 conditions fails)
 *   ANY of, none true   Hidden: no condition is true (0 of 3)
 *   can't tell          Can't tell if this rule is true (...); the script treats it as hidden */
export function describeVerdict(tree, { assumed } = {}) {
  if (!tree || (tree.kind === 'group' && !tree.children.length)) return 'Always shown';

  if (tree.ok === null) {
    return "Can't tell if this rule is true (a formula or an operator the panel does not evaluate); " +
      `the script treats it as ${assumed === false ? 'hidden' : 'shown'}`;
  }

  /* A verdict that rests on a formula's estimate, or on a value typed in by
   * hand, says so. */
  const tail = (tree.estimated ? ' (estimated)' : '') + (tree.edited ? ' (what if)' : '');
  const node = unwrap(tree);
  if (tree.ok === true) {
    return (node.kind === 'group' && node.operator === 'OR'
      ? 'Shown: at least one condition is true' : 'Shown: its condition is true') + tail;
  }

  if (node.kind === 'rule') return `Hidden: ${describeSingleFailure(node)}${tail}`;
  if (node.operator === 'OR') return `Hidden: no condition is true (0 of ${node.total})${tail}`;
  return `Hidden: ${node.fails} of ${node.total} conditions ${node.fails === 1 ? 'fails' : 'fail'}${tail}`;
}
