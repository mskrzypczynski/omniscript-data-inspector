'use strict';

/* Linking the two descriptions of one script: Structure elements carry an
 * OmniScript JSONPath ("Step:Block|1:Field"), the Data tab walks the payload
 * with SEP-joined key chains. Both reduce to the same thing once repeat-block
 * indices are dropped: a list of keys from the root, e.g. ["Step","Block","Field"].
 *
 * Pure: no DOM, no chrome.*. */

import { SEP } from './json-tree-model.js';

/* An element's keys from the root. Taken from its JSONPath when it has one
 * (that works even before the data holds a value for it), otherwise by looking
 * its name up in the payload. null when neither says where it lives. */
export function elementSegments(element, data) {
  if (element.jsonPath) {
    return String(element.jsonPath).split(':').map((part) => {
      const bar = part.indexOf('|');
      return bar > -1 ? part.slice(0, bar) : part;
    }).filter(Boolean);
  }
  return findSegmentsByName(data, element.name);
}

function findSegmentsByName(data, name, trail = [], depth = 0) {
  if (!data || typeof data !== 'object' || depth > 12) return null;
  const isArray = Array.isArray(data);
  if (!isArray && Object.prototype.hasOwnProperty.call(data, name)) return trail.concat(name);
  const keys = Object.keys(data);
  for (const key of keys) {
    const child = data[key];
    if (child && typeof child === 'object') {
      const hit = findSegmentsByName(child, name, isArray ? trail : trail.concat(key), depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/* A tree path (SEP-joined, as the Data tab uses) reduced to keys: the index
 * segments of arrays are dropped so every repeat of a block maps to one place. */
export function dataSegments(data, treePath) {
  if (!treePath) return [];
  const out = [];
  let current = data;
  treePath.split(SEP).forEach((part) => {
    const isArray = Array.isArray(current);
    if (!isArray) out.push(part);
    current = current && typeof current === 'object' ? current[part] : undefined;
  });
  return out;
}

/* The tree path in the payload for a list of keys. Where a key sits under an
 * array (a repeat block) the first repeat is used. `exact` is false when the
 * payload ran out part-way: `path` is then the deepest place that does exist. */
export function treePathFor(data, segments) {
  const parts = [];
  let current = data;
  let exact = true;

  for (const key of segments) {
    if (Array.isArray(current)) {
      if (!current.length) { exact = false; break; }
      parts.push('0');
      current = current[0];
    }
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
      exact = false;
      break;
    }
    parts.push(key);
    current = current[key];
  }

  return { path: parts.join(SEP), exact, found: parts.length > 0 };
}

/* The element that owns a place in the payload: the one whose keys match
 * exactly, or failing that the nearest ancestor that does ("Step:Block:Field:0"
 * belongs to Field). null when nothing matches. */
export function ownerOf(elements, data, treePath) {
  return ownerOfSegments(elements, data, dataSegments(data, treePath));
}

/* Same, from keys already reduced by dataSegments (which may have been taken
 * from a payload other than `data`). */
export function ownerOfSegments(elements, data, wanted) {
  const hit = ownerIndex(elements, data)(wanted);
  return hit ? hit.element : null;
}

/* The same lookup for many places at once: builds the index of element keys
 * one time and returns a function from keys to { element, exact }, exact being
 * false when the element is only the nearest ancestor of the place. null when
 * nothing owns it. Use this when asking about every row of a tree. */
export function ownerIndex(elements, data) {
  const index = new Map();
  elements.forEach((element) => {
    const segments = elementSegments(element, data);
    if (!segments || !segments.length) return;
    const key = segments.join(SEP);
    if (!index.has(key)) index.set(key, element);
  });

  return (wanted) => {
    for (let length = wanted.length; length > 0; length--) {
      const element = index.get(wanted.slice(0, length).join(SEP));
      if (element) return { element, exact: length === wanted.length };
    }
    return null;
  };
}

/* A tree path written the way OmniScript writes a JSONPath: keys joined by
 * colons, a repeat-block position as |N (counting from 1) on the block's key.
 * StepA, Rows, 1, Code  ->  StepA:Rows|2:Code */
export function omniPath(data, treePath) {
  if (!treePath) return '';
  const out = [];
  let current = data;
  treePath.split(SEP).forEach((part) => {
    if (Array.isArray(current)) {
      if (out.length) out[out.length - 1] += `|${Number(part) + 1}`;
    } else {
      out.push(part);
    }
    current = current && typeof current === 'object' ? current[part] : undefined;
  });
  return out.join(':');
}
