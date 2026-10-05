'use strict';

/* Navigating changes on the Data tab. The amber flash fades after a few
 * seconds, so the tab also keeps the paths that changed since the marks were
 * last cleared; these helpers turn that set into an ordered list to step
 * through and into the set of rows a "changed only" view should show.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer, entriesOf, addAllPaths } from './json-tree-model.js';

export function valueAt(value, path) {
  if (!path) return value;
  let current = value;
  for (const part of path.split(SEP)) {
    if (!isContainer(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

/* The paths in `touched` that still exist in `value`, in the order the tree
 * lists them (parents before children). */
export function orderedChanges(value, touched) {
  const out = [];
  if (!touched || !touched.size) return out;

  (function walk(node, path, depth) {
    if (depth > 40) return;
    if (path && touched.has(path)) out.push(path);
    if (!isContainer(node)) return;
    entriesOf(node).forEach(([key, child]) => {
      walk(child, path ? path + SEP + key : key, depth + 1);
    });
  }(value, '', 0));

  return out;
}

/* Rows a "changed only" view shows: each changed path, the way down to it, and
 * everything under it when the changed value is itself a branch. */
export function changedVisible(value, touched) {
  const visible = new Set();
  orderedChanges(value, touched).forEach((path) => {
    const parts = path.split(SEP);
    for (let i = 0; i < parts.length; i++) visible.add(parts.slice(0, i).join(SEP));
    addAllPaths(valueAt(value, path), path, visible, 0);
  });
  if (visible.size) visible.add('');
  return visible;
}

/* The path after (dir = 1) or before (dir = -1) `from` in `list`, wrapping
 * round at the ends. With no usable `from`, the first or last. */
export function stepChange(list, from, dir) {
  if (!list.length) return null;
  const at = list.indexOf(from);
  if (at === -1) return dir > 0 ? list[0] : list[list.length - 1];
  return list[(at + dir + list.length) % list.length];
}

/* Every ancestor path of `path`, root first, excluding the path itself. */
export function ancestorsOf(path) {
  const parts = path ? path.split(SEP) : [];
  const out = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i).join(SEP));
  return out;
}

/* ---------------------------------------------- finding what changed */

/* The paths whose value differs between two payloads: leaves that changed,
 * keys that appeared or vanished, and branches whose type changed. Stops
 * collecting past `limit` paths (a rewritten payload would otherwise list
 * everything). */
export function changedPaths(a, b, limit = 800) {
  const out = new Set();

  (function walk(x, y, path) {
    if (out.size > limit) return;
    const containerX = isContainer(x);
    const containerY = isContainer(y);
    if (!containerX && !containerY) { if (x !== y) out.add(path); return; }
    if (containerX !== containerY || Array.isArray(x) !== Array.isArray(y)) { out.add(path); return; }

    new Set([...Object.keys(x), ...Object.keys(y)]).forEach((key) => {
      const childPath = path ? path + SEP + key : key;
      if (!(key in x) || !(key in y)) { out.add(childPath); return; }
      walk(x[key], y[key], childPath);
    });
  }(a, b, ''));

  return out;
}

/* Every ancestor of the given paths, root included: the collapsed branches
 * that hide a change get a dot. */
export function branchesAbove(paths) {
  const out = new Set();
  paths.forEach((path) => {
    const parts = path.split(SEP);
    for (let i = parts.length - 1; i > 0; i--) out.add(parts.slice(0, i).join(SEP));
    out.add('');
  });
  return out;
}

/* The paths to open the first time a payload is shown: the root and its first
 * level of keys. */
export function initialExpansion(value) {
  const out = new Set(['']);
  if (isContainer(value)) Object.keys(value).slice(0, 200).forEach((key) => out.add(key));
  return out;
}
