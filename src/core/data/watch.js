'use strict';

/* The watch list: a few paths kept in view above the Data tree.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer } from '../shared/json-tree-model.js';
import { valueAt } from './changes.js';
import { omniPath } from '../shared/path-links.js';
import { preview } from '../shared/structure-model.js';
import { isGonePart, isGonePin } from './pin-follow.js';

/* One line of text for a value: strings quoted, branches summarised, cut at
 * 80 characters. */
export function watchText(value) {
  const text = isContainer(value) ? preview(value) : (typeof value === 'string' ? JSON.stringify(value) : String(value));
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/* What a watched path shows right now: { path, label, present, text, shown,
 * value }. text is a one-line preview; a path that no longer exists says so.
 * `shown` is that text for the screen: with `mask` (Mask values is on) the value
 * goes through it first, while text, which tells whether the value changed,
 * stays the real one. */
export function watchRows(data, paths, mask = null) {
  return paths.map((path) => {
    const value = data === undefined ? undefined : valueAt(data, path);
    const present = value !== undefined;
    /* As the OmniScript writes it, Step:Rows|2:Field, so two rows of a list
     * are not both just "Rows › Field". */
    const label = (data === undefined || isGonePin(path) ? '' : omniPath(data, path)) || path.split(SEP).map((part) => (isGonePart(part) ? '(removed row)' : part)).join(':');
    let text = '— not in the data —';
    if (present) text = watchText(value);
    return { path, label, present, text, shown: present && mask ? watchText(mask(value)) : text, value };
  });
}
