'use strict';

/* Where formulas meet the live data: the rules, Set Values and Formula
 * elements of a script, evaluated with evaluateFormula against the payload.
 * Everything that comes out of here is an estimate, and says so (`estimated`),
 * so a view can mark it with ≈ and the red counts can leave it out.
 *
 * An estimator reads a field the way a rule would (the data first) and falls
 * back to a Formula element's own expression when the data holds nothing for
 * it yet. Cycles are cut: a formula that needs itself has no value.
 *
 * Pure: no DOM, no chrome.*. */

import { lookup } from '../shared/structure-model.js';
import { createReferences } from '../shared/references.js';
import { evaluateFormula } from './formula.js';

const FORMULA_ELEMENT = /formula/i;

/* The expression of a Formula element ('' for any other element). */
export function formulaOf(element) {
  if (!element || !FORMULA_ELEMENT.test(element.type || '')) return '';
  const propertySet = element.node && element.node.propSetMap;
  const expression = propertySet && propertySet.expression;
  return typeof expression === 'string' && expression.trim() ? expression : '';
}

/* The reference index, built once per element list, and only for a script that
 * has a Formula element at all: it is the only thing the index is needed for. */
const referenceCache = new WeakMap();
function referencesOf(elements) {
  if (!referenceCache.has(elements)) {
    referenceCache.set(elements, elements.some(formulaOf) ? createReferences(elements) : null);
  }
  return referenceCache.get(elements);
}

/* { read(field), evaluate(text), estimate(element) }
 *   read(field)     — { value, estimated } for what the field holds: the
 *                     data's value, else a Formula element's estimate;
 *                     undefined when neither exists
 *   evaluate(text)  — evaluateFormula(text) reading fields through read(),
 *                     as { ok, value | reason, estimated: true }
 *   estimate(element) — evaluate() of a Formula element's expression, or null
 *                     for an element that is not a Formula one
 * `elements` may be empty: then only formulas written in a rule or a Set
 * Values map are evaluated, not Formula elements. */
export function createEstimator(elements, data) {
  const refs = elements && elements.length ? referencesOf(elements) : null;
  const resolving = new Set();

  function evaluate(text) {
    const result = evaluateFormula(text, (path) => {
      const read = readField(path);
      return read ? read.value : undefined;
    });
    return { ...result, estimated: true };
  }

  function readField(field) {
    const found = data === undefined || data === null ? undefined : lookup(data, field);
    const hit = refs && (found === undefined || found === null) ? refs.resolve(field).element : null;
    const expression = formulaOf(hit);
    if (!expression || resolving.has(hit.key)) {
      return found === undefined ? undefined : { value: found, estimated: false };
    }

    resolving.add(hit.key);
    try {
      const result = evaluate(expression);
      if (result.ok) return { value: result.value, estimated: true };
    } finally {
      resolving.delete(hit.key);
    }
    return found === undefined ? undefined : { value: found, estimated: false };
  }

  function estimate(element) {
    const expression = formulaOf(element);
    if (!expression) return null;
    resolving.add(element.key);
    try {
      return evaluate(expression);
    } finally {
      resolving.delete(element.key);
    }
  }

  return { read: readField, evaluate, estimate };
}
