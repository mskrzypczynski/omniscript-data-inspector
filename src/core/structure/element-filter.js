'use strict';

/* Which elements the Structure list shows: the filters first, then the folds.
 *
 * Pure: no DOM, no chrome.*. */

import { overrideQuery, matchesOverride } from './overrides.js';

/* The elements the filters let through. `query` matches searchText (already
 * lower case); `override:` lists the elements a custom component overrides,
 * `override:name` those it is that component's (overrides.js); `actionsOnly` keeps those that call something; `visibleOnly`
 * drops those isHidden(element) says are not shown right now. */
export function filterElements(elements, { query = '', actionsOnly = false, visibleOnly = false, isHidden = () => false } = {}) {
  const text = String(query).trim().toLowerCase();
  const wanted = overrideQuery(text);
  return elements.filter((element) => {
    if (actionsOnly && !element.remote) return false;
    if (visibleOnly && isHidden(element)) return false;
    if (wanted !== null) return matchesOverride(element, wanted);
    return !text || element.searchText.includes(text);
  });
}

/* The one line for a filter that lets nothing through: what was asked for and
 * nothing else. */
export function noMatchText({ query = '', actionsOnly = false, visibleOnly = false } = {}) {
  const text = String(query).trim();
  const wanted = overrideQuery(text);
  if (wanted !== null) return wanted ? `No element is overridden by “${wanted}”` : 'No element is overridden by a custom component';
  if (text) return `No elements match “${text}”`;
  if (actionsOnly && visibleOnly) return 'No visible element calls anything';
  if (actionsOnly) return 'No element calls anything';
  if (visibleOnly) return 'No element is visible';
  return 'No elements to show';
}

/* Is a section above this element folded? `byKey` maps element key to element. */
export function underFoldedSection(element, byKey, collapsed) {
  let parent = byKey[element.parentKey];
  let guard = 0;
  while (parent && guard++ < 100) {
    if (collapsed.has(parent.key)) return true;
    parent = byKey[parent.parentKey];
  }
  return false;
}

/* The rows left once folded sections hide what is inside them. This works the
 * same with a filter on: a folded section hides its matches too, and they come
 * back when it is unfolded. */
export function withoutFolded(rows, byKey, collapsed) {
  if (!collapsed.size) return rows;
  return rows.filter((element) => !underFoldedSection(element, byKey, collapsed));
}

/* { rows, context }: the matches together with the steps and blocks above
 * them, in script order, so a filtered list keeps the shape of the script
 * instead of turning into a flat run of rows. `context` holds the keys of the
 * rows added only for that reason. `elements` is the whole script, `matches`
 * what the filters let through. */
export function withContext(elements, matches) {
  const wanted = new Set(matches.map((element) => element.key));
  const context = new Set();
  if (wanted.size === elements.length) return { rows: matches, context };

  const byKey = new Map(elements.map((element) => [element.key, element]));
  matches.forEach((element) => {
    let parent = byKey.get(element.parentKey);
    let guard = 0;
    while (parent && guard++ < 100) {
      if (!wanted.has(parent.key)) { wanted.add(parent.key); context.add(parent.key); }
      parent = byKey.get(parent.parentKey);
    }
  });
  return { rows: elements.filter((element) => wanted.has(element.key)), context };
}

/* How many elements sit directly inside each section: Map(key -> n), built
 * once per element list. */
const counts = new WeakMap();
export function childCounts(elements) {
  let map = counts.get(elements);
  if (!map) {
    map = new Map();
    elements.forEach((element) => {
      if (element.parentKey) map.set(element.parentKey, (map.get(element.parentKey) || 0) + 1);
    });
    counts.set(elements, map);
  }
  return map;
}

/* The keys of every section above an element, outermost first. `byKey` maps
 * element key to element. */
export function ancestorKeys(element, byKey) {
  const out = [];
  let parent = byKey[element.parentKey];
  let guard = 0;
  while (parent && guard++ < 100) {
    out.unshift(parent.key);
    parent = byKey[parent.parentKey];
  }
  return out;
}

/* Is the row inside the section with this key, at any depth? `ancestors` is
 * the space-separated list a row carries in data-ancestors. */
export function isWithin(ancestors, key) {
  return !!key && (` ${ancestors} `).includes(` ${key} `);
}
