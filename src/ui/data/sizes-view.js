'use strict';

/* The Data tab's Sizes view: where the bytes of the payload are, as a table of
 * the largest paths (path, bar, size, share in aligned columns) or as a
 * treemap of the top-level keys with one level of children inside each.
 * Clicking a path or a cell finds it in the tree; clicking a top-level cell
 * that has children zooms into it (Shift+click finds it in the tree instead),
 * with a trail above to go back (a crumb, or Esc). The table is also the text
 * alternative of the treemap. */

import { formatBytes } from '../../core/shared/targets-model.js';
import { omniPath } from '../../core/shared/path-links.js';
import { SIZES_STEP, SIZES_ALL_MAX, listPaging, sizesHeading, pathPieces, zoomWithUnused } from '../../core/data/sizes.js';
import { planTreemap, stableSlots, cellLabel, treemapCrumbs, treemapParent } from '../../core/data/treemap.js';
import { SEP } from '../../core/shared/json-tree-model.js';
import { icon } from '../icons.js';
import { UNUSED_LIST_MAX } from '../../core/data/unused.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FALLBACK_SIZE = { w: 640, h: 320 }; // where the page has no layout (hidden, or a test)

const CHARTS = [['list', 'List', 'The top-level keys as a table by size; click a row to drill in.'], ['treemap', 'Treemap', 'The top-level keys as areas; click a key to zoom in.']];

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

function textSpan(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/* ---------------------------------------------------------------- list */

function headerRow() {
  const row = document.createElement('div');
  row.className = 'size-head';
  row.setAttribute('role', 'row');
  ['#', 'Path', '', 'Size', 'Share'].forEach((label) => {
    const cell = textSpan('size-col', label);
    cell.setAttribute('role', 'columnheader');
    if (!label) cell.setAttribute('aria-label', 'Share of the largest');
    row.appendChild(cell);
  });
  return row;
}

function cellOf(node) {
  node.setAttribute('role', 'gridcell');
  return node;
}

/* The path cell: a chevron that drills into the row when it has values under
 * it (else a gap of the same width, so the names line up), and the name, which
 * wraps after a colon and never in the middle of a key. The chevron is for the
 * pointer: the row is the one tab stop, and Enter or the right arrow on it
 * does the same (see sizeRow). */
function pathCell(item, label, on) {
  const cell = document.createElement('span');
  cell.className = 'size-path';
  cell.setAttribute('role', 'gridcell');
  if (item.kids > 0 && on.drill) {
    /* Not a button: the row is the control and Enter does the same. */
    const drill = document.createElement('span');
    drill.className = 'size-drill';
    drill.dataset.path = item.path;
    drill.title = `Drill into ${label}: its ${item.kids} value${item.kids === 1 ? '' : 's'} ranked by size`;
    /* For the pointer. Hidden from assistive technology: the row is the
     * control, and its description says what Enter does. */
    drill.setAttribute('aria-hidden', 'true');
    drill.setAttribute('data-help', 'Sizes');
    drill.appendChild(icon('chevron-right'));
    drill.addEventListener('click', (ev) => { ev.stopPropagation(); on.drill(item.path); });
    cell.appendChild(drill);
  } else {
    const gap = document.createElement('span');
    gap.className = 'size-drill is-gap';
    gap.setAttribute('aria-hidden', 'true');
    cell.appendChild(gap);
  }
  const name = document.createElement('span');
  name.className = 'size-name';
  pathPieces(label).forEach((piece) => {
    name.appendChild(document.createTextNode(piece));
    name.appendChild(document.createElement('wbr'));
  });
  cell.appendChild(name);
  if (on.reveal) cell.appendChild(revealButton(item, label, on));
  return cell;
}

/* Show in tree: shown on hover and keyboard focus like the Tree's row buttons,
 * and one tab stop with the row (only the focused row's button is in the Tab
 * order: see the focusin handler in buildList). It takes no room of its own,
 * so showing it never moves the path. It does what a click on the row does, so
 * a pointer user can tell the button from the row that drills with its chevron. */
function revealButton(item, label, on) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-copy size-reveal';
  button.tabIndex = -1;
  button.title = 'Show this value in the tree (Shift+Enter on the row does the same)';
  button.setAttribute('aria-label', `Show ${label} in the tree`);
  button.setAttribute('data-help', 'Sizes');
  /* The row's focus restore finds a button by its row, like the chevron. */
  button.dataset.path = item.path;
  button.appendChild(icon('tree'));
  button.addEventListener('click', (ev) => { ev.stopPropagation(); on.reveal(item.path); });
  return button;
}

/* The keys of a row, as in the tree: Enter drills into a value that has values
 * under it (else it shows the value in the tree), Shift+Enter or Space shows it
 * in the tree, the right arrow drills and the left arrow goes up. The arrows up
 * and down, Home and End move between rows. */
function rowKeys(row, item, on) {
  row.addEventListener('keydown', (ev) => {
    if (ev.target !== row || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const rows = [...row.parentNode.children].filter((node) => node.classList.contains('size-row'));
    const at = rows.indexOf(row);
    const canDrill = item.kids > 0 && !!on.drill;
    const go = (target) => { if (target) { ev.preventDefault(); target.focus(); } };
    switch (ev.key) {
      case 'ArrowDown': go(rows[at + 1]); break;
      case 'ArrowUp': go(rows[at - 1]); break;
      case 'Home': go(rows[0]); break;
      case 'End': go(rows[rows.length - 1]); break;
      case 'ArrowRight': if (canDrill) { ev.preventDefault(); on.drill(item.path); } break;
      case 'ArrowLeft': if (on.up && on.up()) ev.preventDefault(); break;
      case 'Enter':
        ev.preventDefault();
        if (canDrill && !ev.shiftKey) on.drill(item.path); else on.reveal(item.path);
        break;
      case ' ': ev.preventDefault(); on.reveal(item.path); break;
      default: break;
    }
  });
}

function sizeRow(item, index, largest, data, on) {
  const row = document.createElement('div');
  row.className = 'size-row';
  row.dataset.path = item.path;
  const label = omniPath(data, item.path) || item.path;
  const canDrill = item.kids > 0 && !!on.drill;
  row.title = `${label}\n${formatBytes(item.size)} as compact JSON, ${item.percent}% of the data. `
    + (canDrill ? 'Click or press Enter to drill into its values; Shift+Enter shows it in the tree.' : 'Click to show it in the tree.');
  /* One tab stop for the whole list (the list makes the first row it): the
   * arrows move between rows. */
  row.tabIndex = -1;
  /* A row of cells, not a listbox option: the Show in tree button is a control
   * inside the path cell, and a control may not sit inside an option. */
  row.setAttribute('role', 'row');
  if (canDrill) row.setAttribute('aria-description', `${item.kids} value${item.kids === 1 ? '' : 's'} inside. Enter drills into it, Shift+Enter shows it in the tree.`);

  row.appendChild(cellOf(textSpan('size-rank', String(index + 1))));
  row.appendChild(pathCell(item, label, on));

  /* Left-anchored in a column of one width, so every bar starts at the same x
   * and its length is comparable down the list: the share of the largest. */
  const bar = document.createElement('span');
  bar.className = 'size-bar';
  bar.setAttribute('aria-hidden', 'true');
  cellOf(bar);
  const fill = document.createElement('span');
  fill.className = 'size-fill';
  fill.style.width = `${largest ? Math.max(1, Math.min(100, (item.size / largest) * 100)) : 0}%`;
  bar.appendChild(fill);
  row.appendChild(bar);

  row.appendChild(cellOf(textSpan('size-size', formatBytes(item.size))));
  row.appendChild(cellOf(textSpan('size-share', `${item.percent}%`)));
  /* A click does what Enter does: drill where there is something under the
   * row, else show the value in the tree (the hover button always does the latter). */
  row.addEventListener('click', () => { if (item.kids > 0 && on.drill) on.drill(item.path); else on.reveal(item.path); });
  rowKeys(row, item, on);
  return row;
}

/* The end of the list when it holds only the largest of more: ask for 20 more
 * rows, or for all of them (up to SIZES_ALL_MAX); and, once more than the
 * first 20 are listed, Show fewer goes back to 20. */
function moreBar(shown, count, on) {
  const paging = listPaging(shown, count);
  if (!paging.more && !paging.fewer) return null;
  const bar = document.createElement('div');
  bar.className = 'size-more-bar';
  const button = (className, text, title, action) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `icon-btn tiny ${className}`;
    node.textContent = text;
    node.title = title;
    node.setAttribute('data-help', 'Sizes');
    node.addEventListener('click', action);
    bar.appendChild(node);
  };
  if (paging.more) {
    button('size-show-more', `Show ${paging.more} more`, `Add the next ${paging.more} to the list, by size`, () => on.showMore(shown + paging.more));
  }
  if (paging.all) {
    button('size-show-all', paging.capped ? `Show the largest ${SIZES_ALL_MAX} of ${count}` : `Show all (${count})`,
      paging.capped ? `List the ${SIZES_ALL_MAX} largest; a longer list would be slow to draw` : `List all ${count} by size`,
      () => on.showMore(paging.reachable));
  }
  if (paging.fewer) {
    button('size-show-fewer', 'Show fewer', `Back to the first ${SIZES_STEP}`, () => on.showFewer());
  }
  return bar;
}

/* The list is a grid of its rows with one tab stop, like the tree: the row
 * last focused (the first, to begin with) is the one Tab reaches. The header
 * is its first row; the Show more bar sits beside the grid. */
function buildList(result, data, on, name = 'Top-level keys by size') {
  const list = document.createElement('div');
  list.className = 'sizes-list';
  const rows = document.createElement('div');
  rows.className = 'size-rows'; // display: contents, so the rows are still cells of the list's grid
  rows.setAttribute('role', 'grid');
  rows.setAttribute('aria-label', name);
  rows.appendChild(headerRow());
  list.appendChild(rows);
  const largest = result.items.length ? result.items[0].size : 0;
  result.items.forEach((item, index) => rows.appendChild(sizeRow(item, index, largest, data, on)));
  /* The one row Tab reaches, and with it its Show in tree button. */
  const stopAt = (row, value) => {
    row.tabIndex = value;
    const button = row.querySelector('.size-reveal');
    if (button) button.tabIndex = value;
  };
  const first = rows.querySelector('.size-row');
  if (first) stopAt(first, 0);
  rows.addEventListener('focusin', (ev) => {
    const row = ev.target.closest && ev.target.closest('.size-row');
    if (!row || row.tabIndex === 0) return;
    rows.querySelectorAll('.size-row[tabindex="0"]').forEach((node) => stopAt(node, -1));
    stopAt(row, 0);
  });
  const bar = on.showMore ? moreBar(result.items.length, result.count, on) : null;
  if (bar) list.appendChild(bar);
  return list;
}

/* The same table for the keys no element reads: the largest UNUSED_LIST_MAX,
 * each with its size and share of the payload. */
function buildUnusedList(unused, data, on) {
  const items = unused.keys.slice(0, UNUSED_LIST_MAX).map((key) => ({ path: key.path, size: key.size, percent: key.share }));
  const list = buildList({ items }, data, on, 'Keys no element reads, by size');
  list.classList.add('is-unused');
  if (unused.keys.length > items.length) {
    const more = textSpan('size-more', `+ ${unused.keys.length - items.length} smaller keys, not listed`);
    list.appendChild(more);
  }
  return list;
}

/* ------------------------------------------------------------- treemap */

/* One clickable, focusable cell. The <title> is its tooltip and its name for
 * a screen reader: path · bytes · share. */
function cellGroup(className, tip, onActivate) {
  const group = svg('g', { class: className, role: 'button', tabindex: 0, 'aria-label': tip });
  group.appendChild(svg('title')).textContent = tip;
  group.addEventListener('click', onActivate);
  group.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    onActivate(ev);
  });
  return group;
}

function label(text, x, y, className) {
  const node = svg('text', { x, y, class: className });
  node.textContent = text;
  return node;
}

const inset = (cell, by = 1) => ({ x: cell.x + by, y: cell.y + by, w: Math.max(0, cell.w - 2 * by), h: Math.max(0, cell.h - 2 * by) });

function tipOf(data, path, key, size, percent, extra = '') {
  const where = path ? (omniPath(data, path) || path) : key;
  return `${where}${extra} · ${formatBytes(size)} · ${percent}%`;
}

function drawCell(cell, data, on) {
  const slot = cell.slot;
  const base = `tm-s${slot}`;
  const box = inset(cell);
  const tip = cell.rest
    ? `${cell.key} (smaller keys) · ${formatBytes(cell.size)} · ${cell.percent}%`
    : tipOf(data, cell.path, cell.key, cell.size, cell.percent, '')
      + (cell.zoomable ? ' · Click to zoom in, Shift+click to show it in the tree' : '');
  const nested = cell.children.length > 0;
  const group = cellGroup(`tm-cell tm-top ${base}${nested ? ' is-nested' : ' is-leaf'}${cell.rest ? ' is-rest' : ''}${cell.zoomable ? ' is-zoomable' : ''}`, tip,
    (ev) => {
      if (!cell.path) return;
      if (cell.zoomable && !(ev && ev.shiftKey)) on.zoomTo(cell.path);
      else on.reveal(cell.path);
    });
  group.dataset.path = cell.path || '';
  group.appendChild(svg('rect', { class: 'tm-rect', x: box.x, y: box.y, width: box.w, height: box.h, rx: 2 }));
  const text = cellLabel(cell.key, formatBytes(cell.size), box.w, nested ? cell.header : box.h);
  if (text) group.appendChild(label(text, box.x + 4, nested ? box.y + 11 : box.y + 12, 'tm-label'));
  return group;
}

function drawChild(child, parent, data, on) {
  const box = inset(child);
  const tip = child.other
    ? `${tipOf(data, parent.path, parent.key, child.size, child.percent)} (other: smaller values, keys and brackets)`
    : tipOf(data, child.path, child.key, child.size, child.percent);
  const group = cellGroup(`tm-cell tm-child tm-s${parent.slot}${child.other ? ' is-other' : ''}`, tip, () => on.reveal(child.path));
  group.dataset.path = child.path;
  group.appendChild(svg('rect', { class: 'tm-rect', x: box.x, y: box.y, width: box.w, height: box.h, rx: 2 }));
  const text = cellLabel(child.key, formatBytes(child.size), box.w, box.h);
  if (text) group.appendChild(label(text, box.x + 4, box.y + 12, 'tm-label'));
  return group;
}

/* Draw the treemap for `tree` into `holder`, sized to it. Called again when
 * the holder's size changes; a draw for the same size is skipped. */
function drawTreemap(holder, tree, data, on) {
  const w = Math.floor(holder.clientWidth) || FALLBACK_SIZE.w;
  const h = Math.floor(holder.clientHeight) || FALLBACK_SIZE.h;
  const sig = `${w}x${h}`;
  if (holder.__sig === sig) return;
  holder.__sig = sig;

  const root = svg('svg', {
    class: 'tm', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'group',
    'aria-label': 'Treemap of the data by key. The List view has the same figures as a table.'
  });
  /* A key keeps its colour as the data moves (on.slots remembers them). */
  const slots = on.slots ? stableSlots([...tree.groups].sort((a, b) => a.index - b.index).map((group) => group.path), on.slots) : null;
  planTreemap(tree, w, h, slots).forEach((cell) => {
    root.appendChild(drawCell(cell, data, on));
    cell.children.forEach((child) => root.appendChild(drawChild(child, cell, data, on)));
  });
  holder.textContent = '';
  holder.appendChild(root);
}

function buildTreemap(tree, data, on) {
  const holder = document.createElement('div');
  holder.className = 'sizes-map';
  holder.__draw = () => drawTreemap(holder, tree, data, on);
  if (typeof ResizeObserver === 'function') {
    const watcher = new ResizeObserver(() => {
      if (!holder.isConnected) { watcher.disconnect(); return; }
      if (!holder.closest('[hidden]')) holder.__draw();
    });
    watcher.observe(holder);
  }
  return holder;
}

/* The trail above the list and the treemap when drilled into a key: Data › Plan › Items. Every step but the
 * last goes back to it; the last is where you are, and shows it in the tree. */
function buildCrumbs(path, data, on) {
  const nav = document.createElement('nav');
  nav.className = 'sizes-crumbs';
  nav.setAttribute('aria-label', 'Sizes location');
  const crumbs = treemapCrumbs(path, SEP, 'Data', data);
  crumbs.forEach((crumb, at) => {
    const last = at === crumbs.length - 1;
    if (at) {
      const gap = document.createElement('span');
      gap.className = 'sizes-crumb-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '›';
      nav.appendChild(gap);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sizes-crumb${last ? ' is-here' : ''}`;
    button.dataset.path = crumb.path;
    button.textContent = crumb.label;
    if (last) {
      button.setAttribute('aria-current', 'location');
      button.title = `${omniPath(data, crumb.path) || crumb.label}: show it in the tree`;
      button.addEventListener('click', () => on.reveal(crumb.path));
    } else {
      button.title = crumb.path ? `Back to ${crumb.label}` : 'Back to the whole data';
      button.addEventListener('click', () => on.zoomTo(crumb.path));
    }
    nav.appendChild(button);
  });
  return nav;
}

/* ---------------------------------------------------------------- view */

function switcher(current, onPick) {
  const seg = document.createElement('div');
  seg.className = 'seg sizes-chart';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Chart');
  CHARTS.forEach(([name, text, title]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seg-btn';
    button.dataset.chart = name;
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', () => onPick(name));
    seg.appendChild(button);
  });
  const mark = (name) => seg.querySelectorAll('.seg-btn').forEach((button) => {
    const on = button.dataset.chart === name;
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
  });
  mark(current);
  return { seg, mark };
}

const UNUSED_TITLE = 'Only values no element of this script reads';
const UNUSED_WAIT_TITLE = 'Load the Structure tab first';

/* The Unused switch: pressed shows only the keys no element reads. Until the
 * script's elements are known it is dimmed (aria-disabled, so a press can still
 * ask for them) and says why. */
function unusedSwitch() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn tiny sizes-unused';
  button.textContent = 'Unused';
  button.setAttribute('data-help', 'Sizes');
  return button;
}

/* result: topSizes() of the payload; data: the payload (for readable paths);
 * on: { reveal(treePath), ranking(path, count) -> the rows of the list at a
 * place (rankSizes(); null when that is gone), shown: how many rows the list
 * shows, setShown(count), tree(zoomPath?) -> sizeTree() of the payload or of
 * the part at zoomPath (null when that is gone), chart: 'list' | 'treemap',
 * setChart(name), zoom: the tree path the list and the treemap are drilled into
 * ('' for the whole payload), setZoom(path), slots: a Map that remembers each
 * key's treemap colour (optional) } */
export function buildSizesView(result, data, on) {
  const box = document.createElement('div');
  box.className = 'sizes';

  const head = document.createElement('div');
  head.className = 'sizes-head';
  const note = document.createElement('span');
  note.className = 'bar-note sizes-note';
  note.textContent = result.items.length ? '' : 'Nothing to measure.';
  head.appendChild(note);
  box.appendChild(head);
  if (!result.items.length) return box;

  let list = null;
  let ranked = null;
  let unusedList = null;
  let map = null;
  let crumbs = null;
  let chart = on.chart;
  let shown = on.shown || SIZES_STEP;

  const unusedNow = () => !!(on.unused && on.unused.get() && on.unused.ready());
  let zoom = zoomWithUnused(on.zoom, unusedNow());
  if (zoom !== (on.zoom || '')) on.setZoom(zoom);
  const unusedButton = on.unused ? unusedSwitch() : null;

  /* The rows of the list for the place we are at. A place that is gone (the
   * payload changed) goes back to the whole payload. */
  const rankNow = () => {
    let found = on.ranking(zoom, shown);
    if (!found) {
      zoom = '';
      on.setZoom('');
      found = on.ranking('', shown);
    }
    return found;
  };

  /* The list is drawn again when the place or the number of rows changes. */
  const drawList = () => {
    ranked = rankNow();
    const fresh = buildList(ranked, data, {
      ...on,
      drill: (path) => zoomTo(path),
      up: () => goUp(),
      showMore: (count) => {
        const before = list.querySelectorAll('.size-row').length;
        shown = count;
        on.setShown(count);
        drawList();
        show(chart);
        const rows = list.querySelectorAll('.size-row');
        if (rows[before]) rows[before].focus();
      },
      /* Back to the first 20: the drill stays, and focus goes to the first row
       * because the button that had it is gone. */
      showFewer: () => {
        shown = SIZES_STEP;
        on.setShown(SIZES_STEP);
        drawList();
        show(chart);
        const first = list.querySelector('.size-row');
        if (first) first.focus();
      }
    });
    if (list) list.replaceWith(fresh);
    else head.after(fresh);
    list = fresh;
  };

  /* The figures to draw: the whole payload, or the part zoomed into. A zoom
   * whose place is gone (the payload changed) goes back to the whole. */
  const treeToDraw = () => {
    const tree = zoom ? on.tree(zoom) : on.tree();
    if (tree) return tree;
    zoom = '';
    on.setZoom('');
    return on.tree();
  };

  const where = () => (zoom ? omniPath(data, zoom) || zoom : '');

  /* The heading says what the list below it is. */
  const paintHead = (unusedOn) => {
    if (!unusedOn && chart === 'treemap') {
      const part = zoom ? on.tree(zoom) : null;
      note.textContent = sizesHeading({ label: where(), size: part ? part.size : result.total, total: result.total });
      return;
    }
    if (!unusedOn) {
      note.textContent = sizesHeading({ label: where(), shown: ranked.items.length, count: ranked.count, size: ranked.size, total: ranked.total, array: ranked.array });
      return;
    }
    const found = on.unused.compute();
    note.textContent = `Unused: ${found.keys.length} key${found.keys.length === 1 ? '' : 's'}, ${formatBytes(found.total)} (${found.share}% of the data)`;
  };

  const paintUnused = () => {
    if (!unusedButton) return;
    const ready = on.unused.ready();
    const pressed = unusedNow();
    unusedButton.setAttribute('aria-pressed', String(pressed));
    unusedButton.setAttribute('aria-disabled', String(!ready));
    /* A filter, not a view: pressed it shows a check mark and an outline, never
     * the filled fill of the List / Treemap segment beside it. */
    const tick = unusedButton.querySelector(':scope > .ui-icon');
    if (pressed && !tick) unusedButton.prepend(icon('check'));
    else if (!pressed && tick) tick.remove();
    unusedButton.title = ready ? UNUSED_TITLE : UNUSED_WAIT_TITLE;
  };

  const show = (name) => {
    const treemap = name === 'treemap';
    const unusedOn = !treemap && unusedNow();
    if (unusedOn && !unusedList) {
      unusedList = buildUnusedList(on.unused.compute(), data, on);
      list.after(unusedList);
    }
    list.hidden = treemap || unusedOn;
    if (unusedList) unusedList.hidden = treemap || !unusedOn;
    if (unusedButton) unusedButton.hidden = treemap;
    /* The trail is shared by the list and the treemap: drilled into a place,
     * both are at it. The unused list is of the whole data, so it has none. */
    if (!crumbs && zoom) {
      crumbs = buildCrumbs(zoom, data, { ...on, zoomTo });
      head.after(crumbs);
    }
    if (crumbs) crumbs.hidden = unusedOn;
    paintHead(unusedOn);
    paintUnused();
    if (treemap) {
      if (!map) {
        map = buildTreemap(treeToDraw(), data, { ...on, zoomTo });
        box.appendChild(map);
      }
      map.hidden = false;
      map.__draw();
    } else if (map) {
      map.hidden = true;
    }
  };

  /* Where focus goes after a zoom: when zooming out, the key just left; when
   * zooming in, the first row if the keyboard was on a row, else the trail's
   * step back. */
  const focusAfterZoom = (from, path, fromRow) => {
    const out = from !== path && (path === '' || from.startsWith(`${path}${SEP}`));
    if (out) {
      const left = from.slice(path ? path.length + 1 : 0).split(SEP)[0];
      const leftPath = path ? `${path}${SEP}${left}` : left;
      if (chart === 'treemap' && map) {
        const cell = [...map.querySelectorAll('.tm-top')].find((node) => node.dataset.path === leftPath);
        if (cell) return cell;
      }
      if (chart === 'list') {
        const row = [...list.querySelectorAll('.size-row')].find((node) => node.dataset.path === leftPath);
        if (row) return row;
      }
    }
    if (!out && fromRow && chart === 'list') return list.querySelector('.size-row');
    if (!out && crumbs) {
      const steps = crumbs.querySelectorAll('.sizes-crumb');
      if (steps.length > 1) return steps[steps.length - 2];
    }
    if (chart === 'list') return list.querySelector('.size-row');
    return (map && map.querySelector('.tm-top')) || null;
  };

  /* Drill to `path` ('' for the whole payload): the list, the map and the trail
   * are built again, and focus goes where it can carry on from: the key just
   * left when going out, else the trail's step back. */
  function zoomTo(path) {
    const from = zoom;
    /* Drilled from a row with the keyboard: carry on in the new list. */
    const fromRow = !!list && document.activeElement && document.activeElement.classList.contains('size-row') && list.contains(document.activeElement);
    zoom = path;
    on.setZoom(path);
    if (map) { map.remove(); map = null; }
    if (crumbs) { crumbs.remove(); crumbs = null; }
    drawList();
    show(chart);
    const focus = focusAfterZoom(from, path, fromRow);
    if (focus && focus.focus) focus.focus();
  }

  /* Unused on or off. Turning it on leaves the drill (see zoomWithUnused). */
  function switchUnused(want) {
    on.unused.set(want);
    if (zoomWithUnused(zoom, want) !== zoom) {
      zoom = '';
      on.setZoom('');
      if (crumbs) { crumbs.remove(); crumbs = null; }
      if (map) { map.remove(); map = null; }
      drawList();
    }
    show(chart);
  }

  /* Up one level while drilled in (not in the unused list, which is of the
   * whole data). Says whether it went, so a caller can take the key. */
  function goUp() {
    if (!zoom || (chart === 'list' && unusedNow())) return false;
    zoomTo(treemapParent(zoom, SEP));
    return true;
  }
  box.goUp = goUp;

  /* Esc goes back one step while drilled in. The Data tab also listens for it
   * on the document (data-tab.js): a changed read builds this box again and
   * focus can end up outside it. */
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !goUp()) return;
    ev.preventDefault();
    ev.stopPropagation();
  });

  const { seg, mark } = switcher(chart, (name) => {
    chart = name;
    on.setChart(name);
    mark(name);
    show(name);
  });
  const tools = document.createElement('span');
  tools.className = 'sizes-tools';
  if (unusedButton) {
    unusedButton.addEventListener('click', () => {
      if (!on.unused.ready()) {
        /* The elements are fetched in the background; once they are there the
         * press the user made is carried out. */
        on.unused.ask(() => {
          if (!box.isConnected || !on.unused.ready()) return;
          switchUnused(true);
        });
        return;
      }
      switchUnused(!on.unused.get());
    });
    tools.appendChild(unusedButton);
  }
  tools.appendChild(seg);
  head.appendChild(tools);
  drawList();
  show(chart);
  return box;
}
