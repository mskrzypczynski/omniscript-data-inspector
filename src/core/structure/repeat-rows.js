'use strict';

/* Elements inside a Repeat Block or Edit Block hold one value per row. This
 * finds the block an element repeats with and how many rows the data holds.
 *
 * OmniScript counts rows from 1 ("Block|1" is the first).
 *
 * Pure: no DOM, no chrome.*. */

import { resolvePath, withRows, valueByName } from '../shared/structure-model.js';

const REPEATS_BY_TYPE = /repeat|edit ?block/i;

function declaresRepeat(block) {
  const propertySet = block.node && block.node.propSetMap;
  return REPEATS_BY_TYPE.test(block.type || '') || !!(propertySet && propertySet.repeat === true);
}

/* The rows the data holds for a block: the length of the array at its path. */
export function rowCount(block, data, rows) {
  if (!data || typeof data !== 'object') return 0;
  let value;
  if (block.jsonPath) {
    const segments = String(block.jsonPath).split(':');
    const last = segments.length - 1;
    segments[last] = segments[last].split('|')[0]; // the block itself, not one of its rows
    /* `rows` ({ outerBlock: n }) picks the row of each enclosing block first,
     * so a block inside a block counts the rows of that one row. */
    value = resolvePath(data, rows ? withRows(segments.join(':'), rows) : segments.join(':'));
  }
  if (value === undefined && !rows) value = valueByName(data, block.name);
  return Array.isArray(value) ? value.length : 0;
}

/* { block, count } for the nearest block above the element that repeats (the
 * definition says so, or the data holds an array for it), else null. */
export function repeatBlockOf(element, byKey, data) {
  let node = byKey[element.parentKey];
  let guard = 0;
  while (node && guard++ < 100) {
    const count = rowCount(node, data);
    if (count > 0 || declaresRepeat(node)) return { block: node, count };
    node = byKey[node.parentKey];
  }
  return null;
}

/* Every block above the element that repeats, outermost first (the nearest
 * one is last): what repeatBlockOf finds, but for the whole chain. */
export function repeatChainOf(element, byKey, data) {
  const chain = [];
  let node = byKey[element.parentKey];
  let guard = 0;
  while (node && guard++ < 100) {
    if (declaresRepeat(node) || rowCount(node, data) > 0) chain.unshift(node);
    node = byKey[node.parentKey];
  }
  return chain;
}

/* Keeps the chosen row of a block inside 1..count. */
export function clampRow(row, count) {
  const n = Number.isFinite(row) ? Math.floor(row) : 1;
  return Math.min(Math.max(n, 1), Math.max(count, 1));
}

/* The rows to read: { blockName: row } for every block the user has stepped,
 * kept within the rows the data holds now. `chosen` maps block key -> row. */
export function rowsByName(chosen, byKey, data) {
  const out = {};
  Object.keys(chosen || {}).forEach((key) => {
    const block = byKey[key];
    if (!block) return;
    const count = rowCount(block, data);
    if (count > 0) out[block.name] = clampRow(chosen[key], count);
  });
  return out;
}
