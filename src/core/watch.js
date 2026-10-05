'use strict';

/* The watch list: a few paths kept in view above the Data tree.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer } from './json-tree-model.js';
import { valueAt } from './changes.js';
import { dataSegments } from './path-links.js';
import { preview } from './structure-model.js';

/* What a watched path shows right now: { path, label, present, text, value }.
 * text is a one-line preview; a path that no longer exists says so. */
export function watchRows(data, paths) {
  return paths.map((path) => {
    const value = data === undefined ? undefined : valueAt(data, path);
    const present = value !== undefined;
    const keys = dataSegments(data, path);
    const label = (keys.length ? keys : path.split(SEP)).join(' › ');
    let text = '— not in the data —';
    if (present) {
      text = isContainer(value) ? preview(value) : (typeof value === 'string' ? JSON.stringify(value) : String(value));
      if (text.length > 80) text = `${text.slice(0, 80)}…`;
    }
    return { path, label, present, text, value };
  });
}
