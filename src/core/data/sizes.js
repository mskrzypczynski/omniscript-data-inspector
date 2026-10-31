'use strict';

/* Where the bytes of a payload are: the paths whose serialised value is the
 * longest, with their share of the whole. One pass over the value.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer, joinPath } from '../shared/json-tree-model.js';
import { valueAt } from './changes.js';
import { formatBytes } from '../shared/targets-model.js';

export const TOP_SIZES = 20;

/* The treemap shows this many top-level keys (the rest are folded into one
 * cell) and, inside each, this many children. */
const TREEMAP_GROUPS = 16;
const TREEMAP_CHILDREN = 8;
/* A child needs this share of its parent to get a cell of its own. */
const TREEMAP_MIN_SHARE = 0.02;

const MAX_DEPTH = 200;

/* Length of the compact JSON of `value`, and while at it of every node under
 * it down to `maxDepth` (the root is depth 0 and is not reported). A string is
 * measured as it would be written, quotes and escapes included.
 * visit(path, size, order, depth, parentPath, key) is called once the size of
 * a node is known (children first); `order` is the pre-order position, so ties
 * keep tree order. Returns { total, nodes }. */
function walkSizes(value, visit, maxDepth) {
  let nodes = 0;
  const measure = (node, path, depth, parent, key) => {
    const order = ++nodes;
    let size;
    if (node === null || typeof node !== 'object') {
      size = node === undefined ? 0 : String(JSON.stringify(node)).length;
    } else if (depth > MAX_DEPTH) {
      size = 2;
    } else {
      const isArray = Array.isArray(node);
      const keys = isArray ? null : Object.keys(node);
      const length = isArray ? node.length : keys.length;
      size = 2 + Math.max(0, length - 1); // brackets and commas
      for (let i = 0; i < length; i++) {
        const childKey = isArray ? String(i) : keys[i];
        const childPath = joinPath(path, childKey, depth);
        const childSize = measure(node[childKey], childPath, depth + 1, path, childKey);
        size += childSize + (isArray ? 0 : JSON.stringify(childKey).length + 1);
      }
    }
    if (path && depth <= maxDepth) visit(path, size, order, depth, parent, key);
    return size;
  };
  const total = measure(value, '', 0, '', '');
  return { total, nodes };
}

/* The `count` largest paths below the root, largest first, as
 * { path, size, percent }. `size` is the length of the value written as compact
 * JSON; `percent` its share of the whole payload (one decimal). Ties keep tree
 * order. Also returns the payload's `total` size and the number of `nodes`
 * looked at. */
export function topSizes(value, count = TOP_SIZES) {
  const found = [];
  let floor = 0; // once `found` is over-full and trimmed, nothing smaller than this can make the list

  const keep = (path, size, order) => {
    if (size < floor) return;
    found.push({ path, size, order });
    if (found.length >= count * 8) {
      found.sort((a, b) => b.size - a.size || a.order - b.order);
      found.length = count;
      floor = found[count - 1].size;
    }
  };

  const { total, nodes } = walkSizes(value, keep, Infinity);
  found.sort((a, b) => b.size - a.size || a.order - b.order);
  const items = found.slice(0, count).map(({ path, size }) => ({
    path, size, percent: total ? Math.round((size / total) * 1000) / 10 : 0
  }));
  return { items, total, nodes };
}

/* The payload one level deep, for the treemap: the largest top-level keys,
 * each with its largest children. A child gets a cell when it holds at least
 * `minShare` of its parent; what is left of the parent (small children, keys,
 * brackets and commas) is `other`, so the cells of a parent add up to it.
 *
 * { total, groups: [{ path, key, size, index, children: [{ path, key, size }],
 *   other }], rest: { count, size } }
 * `index` is the key's position in the payload, which the chart colours by, so
 * a colour stays with its key while sizes move. Keys past `maxGroups` are
 * counted in `rest`. */
export function sizeTree(value, { maxGroups = TREEMAP_GROUPS, maxChildren = TREEMAP_CHILDREN, minShare = TREEMAP_MIN_SHARE } = {}) {
  const top = [];
  const below = new Map(); // top-level path -> its children, in tree order
  const { total } = walkSizes(value, (path, size, order, depth, parent, key) => {
    if (depth === 1) top.push({ path, key, size, index: top.length, order });
    else if (depth === 2) {
      if (!below.has(parent)) below.set(parent, []);
      below.get(parent).push({ path, key, size, order });
    }
  }, 2);

  const bySize = (a, b) => b.size - a.size || a.order - b.order;
  const ranked = top.filter((entry) => entry.size > 0).sort(bySize);
  const shown = ranked.slice(0, maxGroups);
  const rest = ranked.slice(maxGroups);

  const groups = shown.map((group) => {
    const floor = group.size * minShare;
    const kept = (below.get(group.path) || []).filter((child) => child.size > 0 && child.size >= floor)
      .sort(bySize).slice(0, maxChildren);
    const inside = kept.reduce((sum, child) => sum + child.size, 0);
    return {
      path: group.path,
      key: group.key,
      size: group.size,
      index: group.index,
      children: kept.map(({ path, key, size }) => ({ path, key, size })),
      other: kept.length ? Math.max(0, group.size - inside) : 0
    };
  });
  return { total, groups, rest: { count: rest.length, size: rest.reduce((sum, entry) => sum + entry.size, 0) } };
}

/* The same chart for the part of the payload at `path` (a tree path), so the
 * treemap can zoom into one key: its children become the top-level cells, each
 * with its own largest children inside. Paths stay full tree paths from the
 * payload root, so a click still finds the value in the tree. `total` is the
 * share's denominator, the size of the whole payload when `options.total`
 * gives it, so percentages keep meaning "of the payload"; `size` is the size
 * of the zoomed part. null when nothing container-like is at that path. */
export function sizeTreeAt(value, path, options = {}) {
  const { total: whole, ...limits } = options;
  const part = valueAt(value, path);
  if (!path) {
    const tree = sizeTree(value, limits);
    return { ...tree, size: tree.total };
  }
  if (!isContainer(part)) return null;
  const tree = sizeTree(part, limits);
  const prefix = (inner) => path + SEP + inner;
  return {
    total: Number.isFinite(whole) && whole > 0 ? whole : tree.total,
    size: tree.total,
    groups: tree.groups.map((group) => ({
      ...group,
      path: prefix(group.path),
      children: group.children.map((child) => ({ ...child, path: prefix(child.path) }))
    })),
    rest: tree.rest
  };
}

/* ---------------------------------------------------------- the list */

/* The list shows this many rows at first and this many more per press; "Show
 * all" stops at SIZES_ALL_MAX, so a payload of a hundred thousand values cannot
 * freeze the panel by drawing them all. */
export const SIZES_STEP = 20;
export const SIZES_ALL_MAX = 2000;

const childCount = (node) => (isContainer(node) ? Object.keys(node).length : 0);
const shareOf = (size, total) => (total ? Math.round((size / total) * 1000) / 10 : 0);

/* The rows of the Sizes list at `path` ('' is the whole payload): up to `count`
 * of them, largest first, each { path, size, percent, kids }. They are always
 * the direct children of the node, at the root as in a drill: the top-level keys,
 * each with the size of everything under it, so a tester follows the biggest bar
 * down. `percent` is always a share of the whole payload (`whole`, its size, when
 * the caller has it; else it is measured); `kids` is how many values lie directly
 * under the row, so a row with kids can be drilled into. Also { size } of the
 * node, { total } of the payload, { count } of the children the list could show
 * and { array } when the node is a list (its children are items, not keys). null
 * when nothing container-like is at a non-empty `path` (the data moved on); the
 * root of a payload that is a scalar has no rows. */
export function rankSizes(value, path = '', count = TOP_SIZES, whole = undefined) {
  const limit = Math.max(0, Math.floor(count));
  const part = path ? valueAt(value, path) : value;
  if (!isContainer(part)) {
    if (path) return null;
    const total = walkSizes(value, () => {}, 0).total;
    return { size: total, total, count: 0, array: false, items: [] };
  }
  const children = [];
  const { total: size } = walkSizes(part, (rel, childSize, order) => children.push({ rel, size: childSize, order }), 1);
  const total = Number.isFinite(whole) && whole > 0 ? whole : (path ? walkSizes(value, () => {}, 0).total : size);
  const items = children.sort((a, b) => b.size - a.size || a.order - b.order).slice(0, limit)
    .map(({ rel, size: childSize }) => ({
      path: path ? path + SEP + rel : rel, size: childSize, percent: shareOf(childSize, total), kids: childCount(valueAt(part, rel))
    }));
  return { size, total, count: children.length, array: Array.isArray(part), items };
}

/* What the bar under the list offers, given how many rows are listed (`shown`)
 * and how many exist (`count`): { more } the size of the next step (0 when
 * nothing is left), { all } the number of rows Show all would list (0 when the
 * step already reaches the end), { capped } when Show all stops short of
 * `count`, and { fewer } when more than the first step is listed, so there is
 * a way back to it. */
export function listPaging(shown, count) {
  const reachable = Math.min(Math.max(0, count || 0), SIZES_ALL_MAX);
  const listed = Math.min(Math.max(0, shown || 0), reachable);
  const left = reachable - listed;
  const more = Math.min(SIZES_STEP, left);
  return { more, all: left > more ? reachable : 0, capped: count > SIZES_ALL_MAX, fewer: listed > SIZES_STEP, reachable };
}

/* The heading above the list: what is listed, how much of it, and where. For
 * the treemap (`shown` null) it says only where it is and how big that is.
 * `array`: the node is a list, whose children are items rather than keys. */
export function sizesHeading({ label = '', shown = null, count = 0, size, total, array = false }) {
  if (shown === null) return label ? `${label} · ${formatBytes(size)}, ${shareOf(size, total)}% of the data` : `Whole data · ${formatBytes(total)}`;
  const noun = array ? 'item' : 'key';
  const things = (n) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const what = shown >= count ? `All ${things(count)}` : `Largest ${shown} of ${things(count)}`;
  if (!label) return `${what} · whole data ${formatBytes(total)}`;
  return `${what} in ${label} · ${formatBytes(size)}, ${shareOf(size, total)}% of the data`;
}

/* The place the Sizes list is drilled into, once Unused is on or off. The
 * unused keys are of the whole data, so a drill would be in force but out of
 * sight (no trail, Esc ignored, and back in place when Unused goes off): turning
 * Unused on leaves the drill, and it stays left. */
export function zoomWithUnused(zoom, unusedOn) {
  return unusedOn ? '' : zoom || '';
}

/* A path as the list prints it, cut into pieces that may wrap: each ends at a
 * colon, so a long path breaks between its keys and never inside one. */
export function pathPieces(label) {
  return String(label).match(/[^:]+:?|:/g) || [];
}
