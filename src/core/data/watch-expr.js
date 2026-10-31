'use strict';

/* Watch expressions: besides a pinned row, the watch list takes a typed
 * expression, shown with its value as the payload changes.
 *
 *   Step:Rows|2:Code        an OmniScript path (positions from 1); a bare name is
 *                           looked for at any depth
 *   $.Rows[*].Qty           a $ query (see shared/json-query.js)
 *   Step:Total > 100        a comparison: path or query, operator, value
 *   Status = "Done"         operators = != < <= > >= contains
 *   Items.length >= 3       .length: items of a list, characters of a text,
 *                           keys of an object
 *
 * The value on the right is a number, a quoted text, true, false or null.
 * Numbers and numeric texts compare as numbers ("5" > 3); texts otherwise
 * exactly, case included. A path that matches several places compares true
 * when any of them does.
 *
 * Pure: no DOM, no chrome.*. */

import { isContainer } from '../shared/json-tree-model.js';
import { parsePathSegments, findPaths } from '../shared/filter-query.js';
import { parseQuerySteps, queryPaths } from '../shared/json-query.js';
import { valueAt } from './changes.js';
import { watchText } from './watch.js';

export const NOT_IN_DATA = '— not in the data —';

/* The most expressions one script's watch list holds. */
export const MAX_EXPRESSIONS = 20;

const OPERATORS = ['!=', '<=', '>=', '=', '<', '>'];

/* ----------------------------------------------------------------- parse */

/* Where the operator is: the first one outside quotes and brackets. Returns
 * { at, op } or null. `contains` is a word between spaces. */
function findOperator(text) {
  let quote = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') { depth++; continue; }
    if (c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    const two = text.slice(i, i + 2);
    const op = OPERATORS.find((candidate) => (candidate.length === 2 ? two === candidate : c === candidate));
    if (op) return { at: i, op };
    const word = /^\s+contains\s+/i.exec(text.slice(i));
    if (word && i > 0) return { at: i, op: 'contains', length: word[0].length };
  }
  return null;
}

/* The value on the right of a comparison, or { error }. */
function parseOperand(text) {
  const t = text.trim();
  if (!t) return { error: 'Nothing to compare with: write a number, "text", true, false or null after the operator' };
  if (t === 'true') return { value: true };
  if (t === 'false') return { value: false };
  if (t === 'null') return { value: null };
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return { value: Number(t) };
  const quote = t[0];
  if ((quote === '"' || quote === "'") && t.length >= 2 && t[t.length - 1] === quote) {
    let value = '';
    for (let i = 1; i < t.length - 1; i++) {
      if (t[i] === '\\' && i + 1 < t.length - 1) { value += t[i + 1]; i++; } else if (t[i] === quote) {
        return { error: `A ${quote} inside the text must be written \\${quote}` };
      } else value += t[i];
    }
    return { value };
  }
  return { error: 'The value after the operator must be a number, "text" in quotes, true, false or null' };
}

/* A path or $ query, optionally ending in .length: { kind, segments | steps, length }
 * or { error }. */
function parseTarget(text) {
  let body = text.trim();
  if (!body) return { error: 'Write a path such as Step:Rows|2:Code, or a $ query' };
  let length = false;
  if (/\.length$/.test(body) && body.length > '.length'.length) { length = true; body = body.slice(0, -'.length'.length).trim(); }

  if (body.startsWith('$')) {
    const steps = parseQuerySteps(body);
    if (!steps) return { error: 'Not a $ query: try $.Step.Rows[*].Code or $..Code' };
    return { kind: 'query', steps, length };
  }
  const segments = parsePathSegments(body);
  if (!segments) return { error: 'Not a path: try Step:Rows|2:Code (positions count from 1)' };
  return { kind: 'path', segments, length };
}

/* { kind: 'path' | 'query', text, segments | steps, length } or
 * { kind: 'compare', text, left: (a path or query as above), op, right }, or
 * { error } with a sentence to show the user. */
export function parseExpression(input) {
  const text = String(input === undefined || input === null ? '' : input).trim();
  if (!text) return { error: 'Write a path or a comparison, such as Step:Total > 100' };

  const found = findOperator(text);
  if (!found) {
    /* "Total contains" has an operator and no operand: not a path with a space in it. */
    if (/\s+contains$/i.test(text)) return parseOperand('');
    const target = parseTarget(text);
    return target.error ? target : { ...target, text };
  }

  const left = parseTarget(text.slice(0, found.at));
  if (left.error) return left;
  const right = parseOperand(text.slice(found.at + (found.length || found.op.length)));
  if (right.error) return right;
  return { kind: 'compare', text, left, op: found.op, right: right.value };
}

/* ------------------------------------------------------------- evaluate */

/* The length of a list, text or object (its keys); undefined for the rest. */
export function lengthOf(value) {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (isContainer(value)) return Object.keys(value).length;
  return undefined;
}

const isNumeric = (value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

/* Numbers and numeric texts are numbers when the other side is a number or a
 * numeric text and at least one is a real number ("5" = 5); two texts are
 * texts ("05" = "5" is false). */
function sameValue(a, b) {
  if (a === null || b === null) return a === b;
  if (isContainer(a) || isContainer(b)) return false;
  if ((typeof a === 'number' || typeof b === 'number') && isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
  return a === b;
}

function ordered(a, b, op) {
  let x;
  let y;
  if (isNumeric(a) && isNumeric(b)) { x = Number(a); y = Number(b); } else if (typeof a === 'string' && typeof b === 'string') { x = a; y = b; } else return false;
  if (op === '<') return x < y;
  if (op === '<=') return x <= y;
  if (op === '>') return x > y;
  return x >= y;
}

function contains(a, b) {
  if (Array.isArray(a)) return a.some((item) => sameValue(item, b));
  if (typeof a === 'string' || typeof a === 'number') return String(a).includes(String(b));
  return false;
}

/* Does the value stand in this relation to `right`? */
export function compareValues(value, op, right) {
  if (op === '=') return sameValue(value, right);
  if (op === '!=') return !sameValue(value, right);
  if (op === 'contains') return contains(value, right);
  return ordered(value, right, op);
}

/* The places a path or query leads to, as tree paths, and the values there
 * (with .length applied; a place that has no length is left out). */
function resolveTarget(data, target) {
  const paths = target.kind === 'query' ? queryPaths(data, { kind: 'query', steps: target.steps }).paths : findPaths(data, target.segments);
  const places = [];
  paths.forEach((path) => {
    const raw = valueAt(data, path);
    const value = target.length ? lengthOf(raw) : raw;
    if (value !== undefined) places.push({ path, value });
  });
  return places;
}

/* One value for the strip: strings bare, branches summarised, kept short. */
function shortValue(value) {
  const text = typeof value === 'string' ? value : watchText(value);
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

const LISTED = 5;

/* { text, value, truthy, present, paths } for a parsed expression against
 * the payload. text is what the strip shows: the value, "true" / "false" for
 * a comparison, "3 values: a, b, c" for several, "— not in the data —" for
 * none. value is the value (an array for several places, a boolean for a
 * comparison); truthy is the comparison's answer, or whether the value is
 * truthy; present is false when nothing was found; paths are the tree paths
 * of the places (the first is the one to show in the tree). With `mask`, `shown`
 * is the text with every value passed through it (undefined: same as text). */
export function evaluateExpression(data, parsed, mask = null) {
  const missing = { text: NOT_IN_DATA, value: undefined, truthy: false, present: false, paths: [] };
  if (!parsed || parsed.error || data === undefined) return missing;

  const target = parsed.kind === 'compare' ? parsed.left : parsed;
  const places = resolveTarget(data, target);
  if (!places.length) return missing;
  const paths = places.map((place) => place.path);

  if (parsed.kind === 'compare') {
    const answer = places.some((place) => compareValues(place.value, parsed.op, parsed.right));
    return { text: String(answer), value: answer, truthy: answer, present: true, paths };
  }

  if (places.length === 1) {
    const { value } = places[0];
    return { text: watchText(value), shown: mask ? watchText(mask(value)) : undefined, value, truthy: !!value, present: true, paths };
  }
  const values = places.map((place) => place.value);
  const listed = (list) => {
    const text = `${list.length} values: ${list.slice(0, LISTED).map(shortValue).join(', ')}${list.length > LISTED ? ', …' : ''}`;
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  };
  return { text: listed(values), shown: mask ? listed(values.map(mask)) : undefined, value: values, truthy: true, present: true, paths };
}

/* How a comparison's answer is written: a mark and the word. */
export const verdictText = (verdict) => (verdict ? '✓ true' : '✕ false');

/* The rows the watch strip draws for a list of expression texts:
 * { id, expr, label, present, text, shown, value, verdict, paths, error? }.
 * verdict is true or false for a comparison, else null. A comparison is shown
 * as "✓ true" or "✕ false": the answer is told by its mark, never by colour,
 * and false is an answer, not a warning. text stays the plain true / false,
 * which is what a change notice quotes. An expression that no longer parses
 * is shown with its error. */
export function expressionRows(data, texts, mask = null) {
  return texts.map((expr) => {
    const parsed = parseExpression(expr);
    const id = expressionId(expr);
    if (parsed.error) return { id, expr, label: expr, present: false, text: parsed.error, shown: parsed.error, value: undefined, verdict: null, paths: [], error: true };
    const result = evaluateExpression(data, parsed, mask);
    const verdict = parsed.kind === 'compare' && result.present ? !!result.truthy : null;
    const shown = verdict === null ? (result.shown === undefined ? result.text : result.shown) : verdictText(verdict);
    return { id, expr, label: parsed.text, present: result.present, text: result.text, shown, value: result.value, verdict, paths: result.paths };
  });
}

/* The key of an expression among the strip's rows: apart from every tree
 * path, which never starts with this character. */
export function expressionId(text) {
  return `\u0002${text}`;
}

/* The list of expression texts after the user typed `input` into the box:
 * { texts, error, added }. An expression that is already there is not added
 * twice; one that does not parse, or one too many, comes back with the
 * sentence to show and the list as it was. */
export function addExpression(texts, input) {
  const parsed = parseExpression(input);
  if (parsed.error) return { texts, error: parsed.error, added: false };
  if (texts.includes(parsed.text)) return { texts, error: '', added: false };
  if (texts.length >= MAX_EXPRESSIONS) return { texts, error: `At most ${MAX_EXPRESSIONS} expressions can be watched`, added: false };
  return { texts: [...texts, parsed.text], error: '', added: true };
}
