'use strict';

/* Navigating changes on the Data tab. The amber flash fades after a few
 * seconds, so the tab also keeps the paths that changed since the marks were
 * last cleared; these helpers turn that set into an ordered list to step
 * through and into the set of rows a "changed only" view should show.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer, entriesOf, addAllPaths, joinPath } from '../shared/json-tree-model.js';
import { walkDiff } from '../shared/diff-walk.js';
import { formatPath } from '../shared/diff.js';

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
      walk(child, joinPath(path, key, depth), depth + 1);
    });
  }(value, '', 0));

  return out;
}

/* The rows the tree may show once the filter box (`structured`, the paths a
 * path / key=value / $ query picked, or null) and Changed only (`changed`, the
 * paths it lets through, or null) have both had their say: only what both
 * allow, and null when neither narrows the tree. */
export function allowedRows(structured, changed) {
  if (structured && changed) return new Set([...structured].filter((path) => changed.has(path)));
  return structured || changed || null;
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

/* Most differences kept; a rewritten payload would otherwise list everything. */
export const CHANGE_LIMIT = 800;

/* What differs between two payloads, for the tree's marks, the status bar and
 * the change log. Built on the same walk as the list of differences
 * (diff-walk.js), so array rows are lined up by identity or content first:
 * one removed row is one removed row, not a change in every row after it.
 *
 * Returns
 *   paths      the tree paths to mark: changed and added values, removed keys
 *              (gone from the tree, but listed so their old value is kept)
 *              and added rows. A removed row has no place in the new tree and
 *              is not here.
 *   before     path -> the value it had in `a` (what "Was:" shows)
 *   entries    every difference, in reading order: { path, text, kind, before,
 *              after, identity? }; `path` is the tree path (a removed row
 *              names the array that lost it), `text` the readable path
 *   counts     { updated, rowsAdded, rowsRemoved }
 *   truncated  more than `limit` differences were found; the rest are left out */
export function detectChanges(a, b, limit = CHANGE_LIMIT) {
  const paths = new Set();
  const before = new Map();
  const entries = [];
  const counts = { updated: 0, rowsAdded: 0, rowsRemoved: 0 };
  let truncated = false;

  walkDiff(a, b, (entry) => {
    if (entries.length >= limit) { truncated = true; return true; }
    const removedRow = entry.kind === 'row-removed';
    const path = (removedRow ? entry.parts.slice(0, -1) : entry.parts).join(SEP);
    entries.push({ path, text: formatPath(entry.parts), kind: entry.kind, before: entry.before, after: entry.after,
      ...(entry.identity === undefined ? {} : { identity: entry.identity }) });
    if (removedRow) { counts.rowsRemoved++; return false; }
    if (entry.kind === 'row-added') counts.rowsAdded++; else counts.updated++;
    paths.add(path);
    before.set(path, entry.before);
    return false;
  });

  return { paths, before, entries, counts, truncated };
}

/* The paths whose value differs between two payloads: leaves that changed,
 * keys that appeared or vanished, rows that were added, and branches whose
 * type changed. Stops collecting past `limit` paths. */
export function changedPaths(a, b, limit = CHANGE_LIMIT) {
  return detectChanges(a, b, limit).paths;
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
