'use strict';

/* JSON tree domain model: deciding what a collapsible JSON tree view should
 * show, with no DOM in sight. src/ui/json-tree-view.js does the actual
 * drawing and imports these decisions rather than recomputing them.
 *
 * Paths are SEP-joined key chains; the root is the empty string.
 */

export const SEP = '';

export function isContainer(value) {
  return value !== null && typeof value === 'object';
}

export function entriesOf(value) {
  return Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.keys(value).map((key) => [key, value[key]]);
}

/* A short " [3 items]" / " {2 keys}" summary for a collapsed container, with a
 * trailing dot when a change is hiding inside it. */
export function summarise(value, path, changedBranch, changed) {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  const body = Array.isArray(value)
    ? ` [${count}${count === 1 ? ' item]' : ' items]'}`
    : ` {${count}${count === 1 ? ' key}' : ' keys}'}`;
  const hasHiddenChange = changedBranch && changedBranch.has(path) && changed && changed.size;
  return hasHiddenChange ? `${body} •` : body;
}

/* Every path whose key or value contains the query, plus every ancestor path
 * needed to reveal it, and every descendant path when the match is on a
 * container's own key (the whole subtree becomes visible). */
export function collectMatches(value, path, keyText, query, out) {
  const selfHit = String(keyText).toLowerCase().includes(query);
  let hit = selfHit;

  if (selfHit && isContainer(value)) addAllPaths(value, path, out, 0);

  if (isContainer(value)) {
    entriesOf(value).forEach(([childKey, childValue]) => {
      const childPath = path ? path + SEP + childKey : childKey;
      if (collectMatches(childValue, childPath, childKey, query, out)) hit = true;
    });
  } else if (String(value).toLowerCase().includes(query)) {
    hit = true;
  }

  if (hit) out.add(path);
  return hit;
}

export function addAllPaths(value, path, out, depth) {
  if (out.size > 20000 || depth > 40) return;
  out.add(path);
  if (!isContainer(value)) return;
  Object.keys(value).forEach((key) => {
    addAllPaths(value[key], path ? path + SEP + key : key, out, depth + 1);
  });
}
