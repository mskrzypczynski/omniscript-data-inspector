'use strict';

/* Reading an expression against the live data: the %merge% fields filled in
 * from what the data holds, and a formula (a value that starts with "=")
 * evaluated best effort. Set Values, Formula, text, extra input and options
 * all read what a text or an expression "comes to" this way.
 *
 * Pure: no DOM, no chrome.*. */

import { lookup } from './visibility.js';
import { resolveElementValue } from '../shared/structure-model.js';
import { createEstimator } from './formula-values.js';
import { evaluateFormula } from './formula.js';

const MERGE_ALL = /%([A-Za-z_][\w:|.-]*)%/g;
const MERGE_ONE = /^%([A-Za-z_][\w:|.-]*)%$/;

function asText(value) {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* What an expression reads its fields through, for resolveExpression: the data's
 * value of a field (an element's own value first, in the chosen repeat rows), and
 * a Formula element's estimate when the data holds none yet. */
export function reader(data, refs, rows, estimator) {
  const hasData = data !== undefined && data !== null && typeof data === 'object';
  const valueOf = (ref) => {
    const hit = refs.resolve(ref).element;
    const value = hit ? resolveElementValue(hit, data, rows) : undefined;
    return value === undefined ? lookup(data, ref) : value;
  };
  return { hasData, valueOf, ctx: estimator || createEstimator([], data) };
}

/* One expression of a Set Values map, an extra input or a text, against the data:
 *   text — the expression with the %merge% fields it names filled in
 *   missing — fields that hold nothing in the data
 *   isFormula — it starts with "="
 *   resolved — the value it comes to, or undefined when that cannot be told
 *   estimated — resolved comes from a formula's estimate
 *   formulaReason — why a formula could not be evaluated ('' otherwise)
 * `read` is reader()'s result. */
export function resolveExpression(expression, read) {
  const { hasData, valueOf, ctx } = read;
  const isFormula = expression.trim().startsWith('=');
  const missing = [];

  const text = expression.replace(MERGE_ALL, (whole, ref) => {
    const value = hasData ? valueOf(ref) : undefined;
    if (value === undefined) { missing.push(ref); return whole; }
    return asText(value);
  });

  let resolved;
  let estimated = false;
  let formulaReason = '';
  if (isFormula) {
    if (hasData) {
      const result = evaluateFormula(expression, (path) => {
        const value = valueOf(path);
        if (value !== undefined) return value;
        const found = ctx.read(path);
        return found ? found.value : undefined;
      });
      if (result.ok) { resolved = result.value; estimated = true; } else formulaReason = result.reason;
    }
  } else if (!missing.length) {
    const single = MERGE_ONE.exec(expression.trim());
    resolved = single ? valueOf(single[1]) : text;
  }
  return { text, missing, isFormula, resolved, estimated, formulaReason };
}

/* An object or list written in a definition, its strings read against the data one by one
 * (the same fields a text reads), so a value that holds a quote or a bracket cannot break
 * the shape of the whole:
 *   value   — a copy with each string that names fields filled in (a string that is a
 *             single %field% keeps the type of what the data holds)
 *   missing — fields that hold nothing in the data
 *   changed — at least one string named a field
 * A string that starts with "=" is left as written. `read` is reader()'s result. */
export function resolveLeaves(value, read) {
  const missing = [];
  let changed = false;
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node.trim().startsWith('=') || !fieldsRead(node).length) return node;
      changed = true;
      const result = resolveExpression(node, read);
      result.missing.forEach((ref) => { if (!missing.includes(ref)) missing.push(ref); });
      return result.resolved !== undefined && !result.missing.length ? result.resolved : result.text;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  return { value: walk(value), missing, changed };
}

/* What a field holds now, as { value, estimated } or undefined: the data first (an
 * element's own value in the chosen repeat rows), else a Formula element's
 * estimate. `read` is reader()'s result. */
export function fieldValue(field, read) {
  const ref = String(field).replace(/^%|%$/g, '');
  const value = read.hasData ? read.valueOf(ref) : undefined;
  if (value !== undefined) return { value, estimated: false };
  const found = read.hasData ? read.ctx.read(ref) : undefined;
  return found ? { value: found.value, estimated: !!found.estimated } : undefined;
}

/* The fields a text or an expression reads, once each, in reading order. */
export function fieldsRead(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  MERGE_ALL.lastIndex = 0;
  let match = MERGE_ALL.exec(text);
  while (match) {
    if (!out.includes(match[1])) out.push(match[1]);
    match = MERGE_ALL.exec(text);
  }
  return out;
}
