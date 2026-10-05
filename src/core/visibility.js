'use strict';

/* Why is an element hidden? An element's propSetMap.show holds a rule group
 * ({ operator, rules: [{ field, condition, data }], groups }); the runtime
 * evaluates it against the live data and records the outcome as bShow on the
 * element. The definition is read once, so bShow is a snapshot — these helpers
 * re-evaluate the rules against the current data instead, and fall back to the
 * snapshot only for rules they cannot judge.
 *
 * Best effort by design: operators the Designer offers beyond the six
 * comparisons, and values that are formulas, come back as "unknown" rather
 * than a guess.
 *
 * Pure: no DOM, no chrome.*. */

import { resolvePath, valueFor, formatRule } from './structure-model.js';

const COMPARISONS = new Set(['=', '==', '<>', '!=', '>', '<', '>=', '<=']);
const MAX_DEPTH = 6;

/* A value as the rule sees it: a field name may be wrapped in %…% merge
 * syntax, and the data side of a rule may name another field the same way. */
function lookup(data, reference) {
  const name = String(reference).replace(/^%|%$/g, '');
  const direct = resolvePath(data, name);
  if (direct !== undefined) return direct;
  const last = name.split(':').pop().split('|')[0];
  return last ? valueFor(data, last) : undefined;
}

function isMerge(text) {
  return typeof text === 'string' && /^%[^%]+%$/.test(text.trim());
}

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

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

  const left = asNumber(actual);
  const right = asNumber(expected);
  const numeric = left !== null && right !== null;
  const a = numeric ? left : asText(actual);
  const b = numeric ? right : asText(expected);

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

function leaf(rule, data) {
  const field = rule.field || rule.name || '';
  const condition = rule.condition || rule.operator || '=';
  const rawExpected = rule.data !== undefined ? rule.data : rule.value;

  const actual = field ? lookup(data, field) : undefined;
  const expected = isMerge(rawExpected) ? lookup(data, rawExpected) : rawExpected;

  return {
    kind: 'rule',
    text: formatRule(rule),
    field,
    condition,
    expected: expected === undefined ? '' : expected,
    actual,
    result: field ? compare(actual, condition, expected) : null
  };
}

function group(node, data, depth) {
  const operator = String(node.operator || node.conditionOp || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  const children = [];

  (node.rules || []).forEach((rule) => {
    if (!rule || typeof rule !== 'object') return;
    if (rule.group || rule.rules || rule.groups) children.push(group(rule.group || rule, data, depth + 1));
    else children.push(leaf(rule, data));
  });
  (node.groups || []).forEach((nested) => {
    if (nested && typeof nested === 'object') children.push(group(nested.group || nested, data, depth + 1));
  });

  let result;
  if (!children.length || depth > MAX_DEPTH) {
    result = null;
  } else if (operator === 'AND') {
    if (children.some((c) => c.result === false)) result = false;
    else result = children.some((c) => c.result === null) ? null : true;
  } else if (children.some((c) => c.result === true)) {
    result = true;
  } else {
    result = children.some((c) => c.result === null) ? null : false;
  }

  return { kind: 'group', operator, children, result };
}

/* { result: true | false | null, tree } for a propSetMap.show value. */
export function evaluateShow(show, data) {
  if (!show || typeof show !== 'object' || data === undefined || data === null) return { result: null, tree: null };
  const tree = group(show.group || show, data, 0);
  return { result: tree.result, tree };
}

/* The rules that made a false group false: every false child of an AND, every
 * child of an OR (all of them were false). */
export function failingRules(tree) {
  if (!tree || tree.result !== false) return [];
  if (tree.kind === 'rule') return [tree];
  return tree.children
    .filter((child) => child.result === false)
    .flatMap((child) => failingRules(child));
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
  const should = SHOULD[rule.condition] || `satisfy ${rule.condition}`;
  return `${rule.field} should ${should} ${display(rule.expected)}, but is ${display(rule.actual)}`;
}

/* Per element key: { hidden, via, evaluation }.
 *   hidden      — hidden itself or because an ancestor is
 *   ownHidden   — hidden by its own rule (or its own bShow), whatever its parents do
 *   via         — key of the topmost element responsible: a hidden ancestor
 *                 when there is one, else itself; null when visible
 *   evaluation  — this element's own show rules against the live data, or null
 * An element's own state comes from re-evaluating its rules; only when those
 * cannot be judged does the definition's bShow snapshot decide. */
export function computeVisibility(elements, data) {
  const out = {};
  elements.forEach((element) => {
    const evaluation = element.show ? evaluateShow(element.show, data) : null;
    const live = evaluation && evaluation.result !== null;
    const ownHidden = live ? evaluation.result === false : element.shown === false;

    const parent = out[element.parentKey];
    const parentVia = parent && parent.hidden ? parent.via : null;

    out[element.key] = {
      hidden: ownHidden || !!parentVia,
      ownHidden,
      via: parentVia || (ownHidden ? element.key : null),
      evaluation,
      live: !!live
    };
  });
  return out;
}

/* One line per rule of the tree, in reading order, for a per-rule breakdown:
 * ok is true / false / null (not judged). */
export function ruleLines(tree) {
  if (!tree) return [];
  if (tree.kind === 'rule') {
    return [{
      ok: tree.result,
      text: `${tree.field} ${tree.condition} ${display(tree.expected)} — currently ${display(tree.actual)}`
    }];
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
    const failing = failingRules(own.tree).map(describeFailure);
    const allNeeded = own.tree.kind === 'group' && own.tree.operator === 'OR' && failing.length > 1;
    headline = failing.length
      ? `Hidden: ${allNeeded ? 'none of these holds — ' : ''}${failing.join('; ')}`
      : 'Hidden: its show rules are not met';
  } else if (info.hidden && info.via && info.via !== element.key) {
    const root = elementsByKey[info.via];
    headline = `Hidden because ${root ? root.name : 'a parent'} is hidden`;
    if (root) {
      const why = explainVisibility(root, visibility, elementsByKey);
      if (why.headline) extra.push({ ok: false, text: why.headline });
    }
  } else if (info.ownHidden) {
    headline = element.show
      ? 'Hidden: the definition marks it bShow: false and its show rules cannot be judged here'
      : 'Hidden: the definition marks it bShow: false';
  } else if (info.live) {
    headline = 'Visible: its show rules currently hold';
  } else if (element.show) {
    headline = 'Its show rules cannot be judged here — treated as visible';
  }

  if (info.live && info.ownHidden === false && element.shown === false) {
    extra.push({ ok: null, text: 'The loaded definition says bShow: false, but the rules hold now — Rescan to reload it.' });
  }

  return { hidden: info.hidden, headline, lines: extra.concat(lines) };
}
