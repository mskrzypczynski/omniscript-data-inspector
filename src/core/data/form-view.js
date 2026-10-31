'use strict';

/* The Form view of the Data tab: the data JSON laid out as the page's form.
 * The rows themselves come from core/structure/form-rows.js (the UI hands them
 * in, because a tab's core folder never imports another's); this file decides
 * what is around them: which element the top-level keys are named after, where
 * each row sits in the tree (so a change mark, the row menu and a copy find the
 * same path the tree uses), which rows a filter lets through and which groups
 * are open.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, joinPath, isContainer, entriesOf, collectMatches, addAllPaths } from '../shared/json-tree-model.js';
import { valueAt, ancestorsOf } from './changes.js';

/* The separator formRows() puts between the keys of a row's id. */
const ID_SEP = '\u001f';

/* The names of an element's children, first of a name winning, as formRows() reads them. */
function childIndex(elements) {
  const byParent = new Map();
  elements.forEach((element) => {
    if (!byParent.has(element.parentKey)) byParent.set(element.parentKey, new Map());
    const names = byParent.get(element.parentKey);
    if (!names.has(element.name)) names.set(element.name, element);
  });
  return (parentKey, name) => {
    const names = byParent.get(parentKey);
    return (names && names.get(name)) || null;
  };
}

/* Which element the top-level keys of the data are named after. A script's definition
 * may hold the script itself as the root element with the steps under it, or the steps
 * directly: the place whose children carry the names of most keys wins, the top (no
 * parent) on a tie. Returns the key to read children of; '' is the top. */
export function formScopeKey(elements, data) {
  if (!Array.isArray(elements) || !elements.length || !isContainer(data) || Array.isArray(data)) return '';
  const childOf = childIndex(elements);
  const candidates = [''].concat(elements.filter((element) => element.depth === 0).map((element) => element.key));
  const keys = Object.keys(data);
  let best = '';
  let bestHits = -1;
  candidates.forEach((candidate) => {
    const hits = keys.filter((key) => childOf(candidate, key)).length;
    if (hits > bestHits) { best = candidate; bestHits = hits; }
  });
  return best;
}

/* The tree path of every row of formRows(), in the same order, and whether the row is
 * an item of a list (it then has no key of its own). Rows come in tree order with
 * their depth, so the path of a row is its key under the path of the last row one
 * level up. `data` is the value the rows were made from. */
export function rowPlaces(rows, data) {
  const trail = []; // trail[depth] = the path of the last row seen at that depth
  return rows.map((row) => {
    const parent = row.depth === 0 ? '' : trail[row.depth - 1];
    const path = joinPath(parent, row.key, row.depth);
    trail[row.depth] = path;
    trail.length = row.depth + 1;
    const holder = row.depth === 0 ? data : valueAt(data, parent);
    return { ...row, path, inArray: Array.isArray(holder) };
  });
}

/* Where a group is, from the id formRows() gave it: the keys joined by a separator,
 * with a list row that carries an Id of its own written "#Id". Returns a function from
 * id to tree path ('' for none found); it remembers what it worked out. */
export function pathResolver(data) {
  const known = new Map();
  return (id) => {
    if (known.has(id)) return known.get(id);
    let current = data;
    let path = '';
    let depth = 0;
    id.split(ID_SEP).every((segment) => {
      let key = segment;
      if (Array.isArray(current) && segment.startsWith('#')) {
        const wanted = segment.slice(1);
        const at = current.findIndex((item) => isContainer(item) && !Array.isArray(item) && String(item.Id) === wanted);
        key = at < 0 ? null : String(at);
      }
      if (key === null || !isContainer(current)) { path = null; return false; }
      path = joinPath(path, key, depth);
      current = current[key];
      depth += 1;
      return true;
    });
    known.set(id, path);
    return path;
  };
}

/* The paths of the keys whose element label contains `query` (case does not matter):
 * the Form shows a label before a key, so a search for the label must find the row.
 * Named after the elements the way formRows() names rows. */
export function labelHits(data, elements, scopeKey, query) {
  const text = String(query || '').trim().toLowerCase();
  const hits = [];
  if (!text || !Array.isArray(elements) || !elements.length || !isContainer(data)) return hits;
  const childOf = childIndex(elements);
  let visited = 0;

  (function walk(object, scope, path, depth) {
    if (depth > 40) return;
    const isList = Array.isArray(object);
    entriesOf(object).forEach(([key, child]) => {
      if (visited++ > 250000) return;
      const owner = !isList && scope ? childOf(scope.key, key) : null;
      const childPath = joinPath(path, key, depth);
      if (owner && owner.label && owner.label.toLowerCase().includes(text)) hits.push(childPath);
      if (isContainer(child)) walk(child, isList ? scope : owner, childPath, depth + 1);
    });
  }(data, { key: scopeKey }, '', 0));
  return hits;
}

/* The paths the Form may show, as the tree works them out: what the text in the filter
 * box matches (a key, a value, or the label of the element that owns the key; the way
 * down to a match, and everything under a key or label that matched), narrowed by `only`
 * (the rows a path, key=value or $ query picked and Changed only allows, or null).
 * null when nothing narrows the rows. `hits` is labelHits(). */
export function formVisible(data, { query = '', only = null, hits = [] } = {}) {
  const text = String(query || '').trim().toLowerCase();
  let visible = null;
  if (text) {
    visible = new Set();
    collectMatches(data, '', '', text, visible);
    hits.forEach((path) => {
      ancestorsOf(path).forEach((above) => visible.add(above));
      addAllPaths(valueAt(data, path), path, visible, 0, path.split(SEP).length);
    });
  }
  if (only) visible = visible ? new Set([...visible].filter((path) => only.has(path))) : only;
  return visible;
}

/* The rows a filter lets through: those whose path is in `visible` (null keeps all). */
export function visibleRows(rows, visible) {
  return visible ? rows.filter((row) => visible.has(row.path)) : rows;
}

/* The path to scroll to and flash for a row that is not drawn: the nearest ancestor
 * that is (the way a jump to a row inside a closed group lands on the group). */
export function nearestDrawn(rows, path) {
  const drawn = new Set(rows.map((row) => row.path));
  if (drawn.has(path)) return path;
  const above = ancestorsOf(path).reverse().find((candidate) => drawn.has(candidate));
  return above === undefined ? null : above;
}
