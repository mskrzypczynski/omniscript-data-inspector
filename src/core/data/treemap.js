'use strict';

/* The geometry of the Sizes treemap: a squarified layout (Bruls, Huizing, van
 * Wijk) and the plan that nests one level of children inside each top-level
 * cell. Drawing is the UI's job; every decision about where things go is here.
 *
 * Pure: no DOM, no chrome.* */

import { omniPath } from '../shared/path-links.js';

/* The categorical colours the chart has (ui CSS defines --tm-1 .. --tm-8). A
 * key past the eighth, and the "more" cell, share the neutral slot 0. */
export const TREEMAP_SLOTS = 8;

const HEADER = 16; // height of a cell's name strip when it holds children
const INSET = 2; // room around the children inside a cell
const MIN_NEST_W = 56;
const MIN_NEST_H = 40;
const CHAR_W = 6; // width of a 10px monospace character
const LABEL_H = 14; // a cell lower than this has no room for text

/* Worst aspect ratio of a row of `areas` laid along a side of length `side`. */
function worst(areas, sum, side) {
  const long = Math.max(...areas);
  const short = Math.min(...areas);
  const squared = side * side;
  return Math.max((squared * long) / (sum * sum), (sum * sum) / (squared * short));
}

/* Lay `items` ({ value, ...anything }) out in a width x height box so that
 * each item's area is its share of the total value. Largest first; the items
 * come back with x, y, w, h added. Items with no positive value are left out.
 * Cells tile the box without overlap. */
export function treemapLayout(items, width, height) {
  const usable = items.filter((item) => Number.isFinite(item.value) && item.value > 0);
  if (!usable.length || !(width > 0) || !(height > 0)) return [];
  const sorted = usable.map((item, order) => ({ item, order }))
    .sort((a, b) => b.item.value - a.item.value || a.order - b.order).map(({ item }) => item);
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  const scale = (width * height) / total;

  const out = [];
  let box = { x: 0, y: 0, w: width, h: height };

  /* Place a finished row: a column on the left when the box is wide, a strip
   * on top when it is tall. The last cell of a row takes what is left of the
   * side, so rounding never leaves a gap or an overlap. */
  const place = (row, sum) => {
    const horizontal = box.w >= box.h;
    const thickness = horizontal ? Math.min(box.w, sum / box.h) : Math.min(box.h, sum / box.w);
    let offset = 0;
    row.forEach((entry, i) => {
      const last = i === row.length - 1;
      const side = horizontal ? box.h : box.w;
      const length = last ? side - offset : (entry.area / sum) * side;
      const cell = horizontal
        ? { x: box.x, y: box.y + offset, w: thickness, h: length }
        : { x: box.x + offset, y: box.y, w: length, h: thickness };
      out.push({ ...entry.item, ...cell });
      offset += length;
    });
    if (horizontal) box = { x: box.x + thickness, y: box.y, w: box.w - thickness, h: box.h };
    else box = { x: box.x, y: box.y + thickness, w: box.w, h: box.h - thickness };
  };

  let row = [];
  let rowSum = 0;
  sorted.forEach((item, i) => {
    const entry = { item, area: item.value * scale };
    const side = Math.min(box.w, box.h);
    const areas = row.map((e) => e.area);
    const better = !row.length
      || worst(areas, rowSum, side) >= worst([...areas, entry.area], rowSum + entry.area, side);
    if (!better) { place(row, rowSum); row = []; rowSum = 0; }
    row.push(entry);
    rowSum += entry.area;
    if (i === sorted.length - 1) place(row, rowSum);
  });
  return out;
}

const percentOf = (size, total) => (total ? Math.round((size / total) * 1000) / 10 : 0);

/* The trail above a zoomed treemap: "Data" then one step per key of the
 * zoomed path, each { label, path } with the tree path it leads back to.
 * Without a path, just the root. `separator` is the tree-path separator.
 *
 * With `data` (the payload; the separator must then be the tree's own), a step
 * is named the way the rows below it are: what omniPath() adds to its parent's
 * path, so a repeat-block position reads |2 (from 1) where the raw key is 1. */
export function treemapCrumbs(path, separator, rootLabel = 'Data', data = undefined) {
  const crumbs = [{ label: rootLabel, path: '' }];
  if (!path) return crumbs;
  let sofar = '';
  let before = '';
  path.split(separator).forEach((part) => {
    sofar = sofar ? sofar + separator + part : part;
    let label = part;
    if (data !== undefined) {
      const written = omniPath(data, sofar);
      if (written.startsWith(before) && written.length > before.length) label = written.slice(before.length).replace(/^:/, '');
      before = written;
    }
    crumbs.push({ label, path: sofar });
  });
  return crumbs;
}

/* The path one step up from a zoomed path ('' is the root). */
export function treemapParent(path, separator) {
  const at = path ? path.lastIndexOf(separator) : -1;
  return at < 0 ? '' : path.slice(0, at);
}

/* The colour slot of each key, steady while the data moves. A slot goes by the
 * key's position in the data at first, but once a key has one it keeps it as
 * keys are added in front of it or come and go, so "Plan" is the same colour on
 * every read. `keys` are the keys on screen, in the order of the data; `remembered` (a Map, key -> slot) holds what
 * was given before and is added to. A key with no free slot among the
 * TREEMAP_SLOTS is the neutral 0, as the keys past the eighth always were.
 * Returns the Map of slots for these keys. */
export function stableSlots(keys, remembered) {
  const taken = new Set();
  keys.forEach((key) => { if (remembered.has(key) && remembered.get(key) > 0) taken.add(remembered.get(key)); });
  const slots = new Map();
  keys.forEach((key) => {
    if (!remembered.has(key) || remembered.get(key) === 0) {
      let free = 0;
      for (let slot = 1; slot <= TREEMAP_SLOTS && !free; slot++) if (!taken.has(slot)) free = slot;
      if (free) taken.add(free);
      if (remembered.size < REMEMBER_MAX || remembered.has(key)) remembered.set(key, free);
      slots.set(key, free);
    } else {
      slots.set(key, remembered.get(key));
    }
  });
  return slots;
}

const REMEMBER_MAX = 500;

/* The cells to draw for a sizeTree() result in a width x height box.
 *
 * Each top-level cell is { path, key, size, percent, slot, x, y, w, h, header,
 * children }. A cell tall and wide enough to hold its children reserves a
 * `header` strip for its name and lays them out below it: each child is
 * { path, key, size, percent, other, x, y, w, h } (`other` is the part not
 * shown as a child; it points at the parent). A cell that is too small, or
 * has no children, is drawn as one block (header 0, no children). `zoomable`
 * says the key has children to zoom into, whether or not they fit. The cell for
 * the keys past the limit has `rest: true` and no path. Coordinates are
 * absolute in the box. `percent` is the share of the whole payload. `slots`
 * (a Map, path -> slot, see stableSlots) fixes the colours; without it they go
 * by rank. */
export function planTreemap(tree, width, height, slots = null) {
  const items = tree.groups.map((group) => ({
    path: group.path,
    key: group.key,
    size: group.size,
    slot: slots && slots.has(group.path) ? slots.get(group.path) : (group.index < TREEMAP_SLOTS ? group.index + 1 : 0),
    parts: group,
    value: group.size
  }));
  if (tree.rest.count > 0 && tree.rest.size > 0) {
    items.push({ path: null, key: `${tree.rest.count} more`, size: tree.rest.size, slot: 0, rest: true, parts: null, value: tree.rest.size });
  }

  return treemapLayout(items, width, height).map((placed) => {
    const { parts } = placed;
    const cell = { ...placed };
    delete cell.parts;
    delete cell.value;
    const planned = {
      ...cell, percent: percentOf(cell.size, tree.total), header: 0, children: [],
      /* A click zooms into a key that has children worth showing. */
      zoomable: !!parts && parts.children.length > 0
    };
    if (!parts || !parts.children.length || cell.w < MIN_NEST_W || cell.h < MIN_NEST_H) return planned;
    const inner = { x: cell.x + INSET, y: cell.y + HEADER, w: cell.w - 2 * INSET, h: cell.h - HEADER - INSET };
    if (inner.w < 8 || inner.h < 8) return planned;
    const kids = parts.children.map((child) => ({ ...child, value: child.size }));
    if (parts.other > 0) kids.push({ path: cell.path, key: 'other', size: parts.other, other: true, value: parts.other });
    planned.header = HEADER;
    planned.children = treemapLayout(kids, inner.w, inner.h).map((placedChild) => {
      const child = {
        ...placedChild,
        other: !!placedChild.other,
        percent: percentOf(placedChild.size, tree.total),
        x: placedChild.x + inner.x,
        y: placedChild.y + inner.y
      };
      delete child.value;
      return child;
    });
    return planned;
  });
}

/* Text for a cell of `width` x `height` pixels: "key · size" when that fits,
 * else the key cut short with an ellipsis, else nothing. */
export function cellLabel(key, sizeText, width, height) {
  if (height < LABEL_H) return '';
  const room = Math.floor((width - 8) / CHAR_W);
  const full = `${key} · ${sizeText}`;
  if (full.length <= room) return full;
  if (key.length <= room) return key;
  return room >= 3 ? `${key.slice(0, room - 1)}…` : '';
}
