'use strict';

/* A show rule inside a repeating block holds per row: "Spouse name" is shown
 * only when this row's "Married" is ticked. computeVisibility judges each rule
 * once, reading a field name as the first match in the data (row 1), so for a
 * check that goes row by row (what may stop Next) the rule is read again with
 * the row's own values. A rule that still cannot be judged keeps its finding
 * under Estimated and out of every count.
 *
 * Pure: no DOM, no chrome.*. */

import { resolveRowValue } from '../shared/structure-model.js';
import { createEstimator, formulaOf } from './formula-values.js';
import { createReferences } from '../shared/references.js';
import { repeatChainOf } from './repeat-rows.js';
import { evaluateShow } from './visibility.js';

/* The estimator, reading a field that sits in one of `chain`'s blocks from
 * `rows` ({ blockName: n }) and any other field as it always does. */
function rowEstimator(base, refs, elements, chain, rows, data) {
  const inChain = new Set(chain.map((block) => block.key));
  const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));
  return {
    ...base,
    read(field) {
      const hit = refs.resolve(field).element;
      if (!hit) return base.read(field);
      const blocks = repeatChainOf(hit, byKey, data);
      if (!blocks.length || !blocks.every((block) => inChain.has(block.key))) return base.read(field);
      const value = hit.jsonPath ? resolveRowValue(hit, data, rows || {}) : undefined;
      if (value === undefined && formulaOf(hit)) return base.read(field); // a Formula the row does not hold yet: its estimate
      return value === undefined ? undefined : { value, estimated: false };
    }
  };
}

/* { judge(element, chain, rows) } where judge answers for an element inside
 * the repeating blocks `chain` (outermost first), in the row `rows`:
 * { hidden, estimated }. Only the element and what lies between it and the
 * outermost block are judged here; the block itself and everything above it
 * are the caller's, from computeVisibility. `hidden` is for certain only. */
export function createRowJudge(elements, data, visibility, references) {
  const base = createEstimator(elements, data);
  const refs = references || createReferences(elements);
  const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));

  function judge(element, chain, rows) {
    const reading = rowEstimator(base, refs, elements, chain, rows, data);
    let estimated = false;
    let node = element;
    let guard = 0;
    while (node && node.key !== chain[0].key && guard++ < 100) {
      if (node.conditional) {
        const verdict = evaluateShow(node.show, data, reading);
        if (verdict.result === false && !verdict.estimated) return { hidden: true, estimated: false };
        if (verdict.result === null || verdict.estimated) estimated = true;
      } else {
        const state = visibility && visibility[node.key];
        if (state && state.ownHidden) return { hidden: true, estimated: false };
      }
      node = byKey[node.parentKey];
    }
    return { hidden: false, estimated };
  }

  return { judge };
}
