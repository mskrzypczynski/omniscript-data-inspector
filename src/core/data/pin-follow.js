'use strict';

/* Watched values follow their row. A pin is a tree path, which names an array
 * row by its position; when a row above it is removed the position now holds a
 * different row. Where the rows can be told apart (every row carries the same
 * unique Id / Name style key, see diff-walk.js) the pin moves to wherever its
 * row went; where they cannot, it keeps its position.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer } from '../shared/json-tree-model.js';
import { alignRows } from '../shared/diff-walk.js';

/* The place a pin lands when its row is gone. No payload has such a key, so
 * the strip shows "not in the data" instead of some other row's value. The
 * marker carries a counter, never the row's Id or Name: a pin is shown, stored
 * and written to the debug bundle, and none of those may learn a value. */
export const GONE = '\u0002gone:';

let goneCount = 0;

/* A path part that marks a removed row (see GONE). */
export const isGonePart = (part) => typeof part === 'string' && part.startsWith(GONE);

/* Whether a pin points at a removed row. */
export const isGonePin = (path) => typeof path === 'string' && path.split(SEP).some(isGonePart);

/* A pin made readable: the removed row's place says "removed row". */
export function readablePin(path) {
  return path.split(SEP).map((part) => (isGonePart(part) ? '(removed row)' : part)).join('.');
}

function followOne(previous, next, path, alignments) {
  if (!path) return path;
  const parts = path.split(SEP);
  const out = [];
  let a = previous;
  let b = next;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!isContainer(a) || !isContainer(b)) { out.push(...parts.slice(i)); break; }

    let target = part;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (!alignments.has(a)) alignments.set(a, alignRows(a, b));
      const { ops, key } = alignments.get(a);
      if (key) {
        const op = ops.find((candidate) => candidate.a === Number(part));
        if (op && op.b !== undefined) target = String(op.b);
        else if (op) { out.push(`${GONE}${++goneCount}`, ...parts.slice(i + 1)); break; }
      }
    }
    out.push(target);
    a = a[part];
    b = b[target];
  }
  return out.join(SEP);
}

/* The pins after the payload changed from `previous` to `next`, and which
 * paths moved (old -> new). Two pins that land on one place are kept once. */
export function followPins(previous, next, pins) {
  const alignments = new Map();
  const moved = new Map();
  const seen = new Set();
  const followed = [];

  pins.forEach((path) => {
    const landed = followOne(previous, next, path, alignments);
    if (landed !== path) moved.set(path, landed);
    if (seen.has(landed)) return;
    seen.add(landed);
    followed.push(landed);
  });
  return { pins: followed, moved };
}
