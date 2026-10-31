'use strict';

/* The Data tab's Form view: the data JSON as the rows the Structure tab's Form
 * draws (core/structure/form-rows.js, drawn by structure/value-views.js), with
 * what the Data tree has on top of them: the change marks and flash, the row
 * menu, the copy button, the filter and the keyboard. Which rows exist, where
 * each one sits in the tree and what a filter lets through is decided in
 * core/data/form-view.js; this file draws.
 *
 * Open groups are the tree's own (`expanded` while no filter is on, `filterOpen`
 * while one is), so Tree and Form show the same branches open, Expand all and
 * Collapse all work on both, and a jump from another tab opens the same way.
 *
 * Only DOM here. */

import { formRows } from '../../core/structure/form-rows.js';
import { isBranchOpen, isContainer } from '../../core/shared/json-tree-model.js';
import { valueAt, ancestorsOf } from '../../core/data/changes.js';
import { formScopeKey, rowPlaces, pathResolver, labelHits, formVisible, visibleRows } from '../../core/data/form-view.js';
import { renderForm } from '../structure/value-views.js';
import { describeBefore, copyValueOf, appendRowActions } from '../json-tree-view.js';
import { mountSticky, firstRowBelow } from '../tree-sticky.js';
import { scrollerOf } from '../tree-window.js';
import { writeClipboard } from '../clipboard.js';
import { flashDone } from '../util.js';
import { icon } from '../icons.js';
import { Mask } from '../mask-setting.js';

/* A flash option is a value, or a function read each time (see json-tree-view.js). */
const liveValue = (option) => (typeof option === 'function' ? option() : option);

const rowsOf = (wrap) => [...wrap.querySelectorAll('.form-row[data-path]')];

/* Only the focused row's own controls are in the Tab order, like the tree's:
 * Tab from a row reaches its Open and Copy buttons, and the pointer user never
 * tabs through a hundred hidden ones. */
function setStops(row, value) {
  row.querySelectorAll('.form-open, .form-tools button').forEach((button) => { button.tabIndex = value; });
}

function copyButton(title, getText) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-copy form-copy';
  button.tabIndex = -1;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(icon('copy'));
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    writeClipboard(getText()).then(() => flashDone(button), () => {});
    // a pointer click lets go at once; Enter or Space keeps the focus while the check mark shows
    if (ev.detail !== 0) button.blur();
  });
  return button;
}

/* One drawn row, given what it needs from the tree: the marks, the tooltip, the copy
 * button, the menu. `place` is the row from rowPlaces(). */
function decorate(line, place, data, o) {
  const { path } = place;
  const value = valueAt(data, path);
  line.dataset.path = path;
  line.tabIndex = -1;
  line.__form = { depth: place.depth, label: place.label, name: place.name, value, container: place.kind === 'group' };

  if (o.changed && o.changed.has(path)) {
    line.classList.add('is-changed');
    if (o.flashElapsed) line.style.animationDelay = `-${Math.round(o.flashElapsed)}ms`;
  }
  const marked = o.touched && o.touched.has(path);
  if (marked) line.classList.add('is-touched');
  const wasText = marked && o.before && o.before.has(path) ? `Was: ${describeBefore(o.before.get(path))}` : '';
  const note = o.rowNote ? o.rowNote(path) : '';
  const was = [wasText, note].filter(Boolean).join('\n');
  if (was) { line.title = was; line.setAttribute('aria-description', was); }
  const jumped = liveValue(o.jumped);
  if (jumped !== null && jumped !== undefined && jumped === path) {
    line.classList.add('is-jumped');
    const elapsed = liveValue(o.jumpElapsed);
    if (elapsed) line.style.animationDelay = `-${Math.round(elapsed)}ms`;
  }

  /* A closed group with a change inside is marked with a dot, as the tree's summary is. */
  if (place.kind === 'group' && !place.open && o.changedBranch && o.changedBranch.has(path) && o.changed && o.changed.size) {
    const dot = document.createElement('span');
    dot.className = 'form-dot';
    dot.textContent = ' •';
    dot.title = 'A value inside changed';
    line.querySelector('.form-open span').appendChild(dot);
  }

  const tools = document.createElement('span');
  tools.className = 'form-tools';
  tools.appendChild(copyButton(place.kind === 'group' ? 'Copy this branch as JSON (c)' : 'Copy this value (c)',
    () => copyValueOf(o.transform(value))));
  /* The Tree's other row buttons, drawn by the same code: %merge% field, watch,
   * Show in Structure, Open record. */
  appendRowActions(tools, { ...o, root: data }, path, value, place.kind === 'group');
  line.querySelector('.fc-value').appendChild(tools);

  line.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    o.onContext(ev, { path, value, keyText: place.key, container: place.kind === 'group', inArray: place.inArray });
  });
}

/* A copy of a selection across rows, with Mask values on: rebuilt from the data behind
 * each row, masked, as the watch strip's is, so a native copy leaks nothing. */
function maskedLine(row) {
  const { depth, label, name, value, container } = row.__form;
  const shown = container ? `${isContainer(value) ? Object.keys(value).length : 0} items` : copyValueOf(Mask.apply(value));
  return `${'  '.repeat(depth)}${label}${name ? ` (${name})` : ''}: ${shown}`;
}

function guardCopy(wrap) {
  wrap.addEventListener('copy', (ev) => {
    if (!Mask.on() || !ev.clipboardData) return;
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const lines = rowsOf(wrap).filter((row) => selection.containsNode(row, true)).map(maskedLine);
    if (!lines.length) return;
    ev.clipboardData.setData('text/plain', lines.join('\n'));
    ev.preventDefault();
    ev.stopPropagation();
  });
}

/* The arrows between rows, Enter / Space / → / ← on a group, Home / End, and the
 * menu key. Keys typed in a row's own buttons are left to the buttons. */
function wireKeys(wrap, { toggle, isOpen, openMenu }) {
  wrap.addEventListener('focusin', (ev) => {
    const row = ev.target.closest && ev.target.closest('.form-row[data-path]');
    if (!row) return;
    rowsOf(wrap).forEach((other) => {
      if (other !== row) { other.tabIndex = -1; setStops(other, -1); }
    });
    row.tabIndex = 0;
    setStops(row, 0);
  });

  wrap.addEventListener('keydown', (ev) => {
    const row = ev.target;
    if (!row.classList || !row.classList.contains('form-row') || row.dataset.path === undefined) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const rows = rowsOf(wrap);
    const at = rows.indexOf(row);
    const path = row.dataset.path;
    const group = row.classList.contains('is-group') && !row.querySelector('.form-open').disabled;
    const open = group && isOpen(path);
    const go = (target) => { if (target) { ev.preventDefault(); target.focus(); } };
    const flip = (want) => {
      ev.preventDefault();
      if (open !== want) toggle(path);
    };

    if (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) {
      ev.preventDefault();
      const box = row.getBoundingClientRect();
      openMenu({ clientX: box.left + 24, clientY: box.bottom, type: 'keydown', detail: 0, preventDefault() {} }, row);
      return;
    }
    switch (ev.key) {
      case 'ArrowDown': go(rows[at + 1]); break;
      case 'ArrowUp': go(rows[at - 1]); break;
      case 'Home': go(rows[0]); break;
      case 'End': go(rows[rows.length - 1]); break;
      case 'ArrowRight':
        if (group && !open) flip(true); else if (group) go(rows[at + 1]);
        break;
      case 'ArrowLeft':
        if (group && open) flip(false);
        else go(rows.find((candidate) => candidate.dataset.path === ancestorsOf(path).pop()));
        break;
      case 'Enter':
      case ' ':
        if (group) flip(!open); else ev.preventDefault();
        break;
      default: break;
    }
  });
}

/* Draws the form into `parent` and says what it found.
 *   data, elements       the Data JSON and the script's elements (none when the definition is unknown)
 *   query                the text the filter box holds when it is not a path / $ query
 *   only                 the paths a path, $ query or Changed only allows, or null
 *   expanded, filterOpen the tree's open branches
 *   changed, changedBranch, flashElapsed, touched, before, jumped, jumpElapsed, rowNote   as the tree's
 *   transform            what copy buttons apply to a value (Mask values)
 *   onJump, jumpLabel, pinned, onPin, mergeButton, canOpenRecord, onOpenRecord, sticky   as the tree's
 *   onContext(ev, info)  the row menu; onToggle(path) after a group opened or closed
 *   focusPath            the row that had keyboard focus before this redraw
 * Returns { matched, rows, truncated, scrollTo(path) }. */
export function renderDataForm(parent, o) {
  const { data } = o;
  /* A scroll listener left by an earlier draw into this pane (a windowed Tree) must go. */
  const scroller = scrollerOf(parent);
  if (scroller.__vwinCleanup) scroller.__vwinCleanup();
  if (scroller.__stickyCleanup) scroller.__stickyCleanup();
  const none = { matched: true, rows: 0, truncated: 0, scrollTo: () => false };
  if (!isContainer(data)) return none;

  const scopeKey = formScopeKey(o.elements, data);
  const visible = formVisible(data, { query: o.query, only: o.only, hits: labelHits(data, o.elements, scopeKey, o.query) });
  if (visible && !visible.size) return { ...none, matched: false };

  const filtering = !!visible;
  const tree = { filtering, expanded: o.expanded, filterOpen: o.filterOpen };
  const resolve = pathResolver(data);
  const isOpenPath = (path) => isBranchOpen(tree, path);
  const drawn = formRows({ key: scopeKey, category: { key: 'script' } }, data, o.elements || [], (id) => {
    const path = resolve(id);
    return path !== null && (!visible || visible.has(path)) && isOpenPath(path);
  });
  const placed = rowPlaces(drawn.rows, data);
  const shown = visibleRows(placed, visible);
  if (!shown.length && filtering) return { ...none, matched: false };

  const pathOfId = new Map(placed.map((row) => [row.id, row.path]));
  const toggle = (path) => {
    if (filtering) o.filterOpen.set(path, !isOpenPath(path));
    else if (o.expanded.has(path)) o.expanded.delete(path);
    else o.expanded.add(path);
    o.onToggle(path);
  };

  const wrap = document.createElement('div');
  wrap.className = 'data-form';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Data as a form');
  parent.appendChild(wrap);
  renderForm({ rows: shown, truncated: drawn.truncated }, wrap, (id) => toggle(pathOfId.get(id)));

  const lines = [...wrap.querySelectorAll('.form-row')];
  lines.forEach((line, index) => {
    decorate(line, shown[index], data, { ...o, transform: o.transform || ((value) => value) });
  });

  /* Rows are one stop each; the buttons are natural stops, so they are taken out until their row has focus. */
  lines.forEach((line) => setStops(line, -1));
  const stop = lines.find((line) => line.dataset.path === o.focusPath) || lines[0];
  if (stop) { stop.tabIndex = 0; setStops(stop, 0); }

  const openMenu = (ev, row) => row.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY
  }));
  wireKeys(wrap, { toggle, isOpen: isOpenPath, openMenu });
  guardCopy(wrap);

  const scrollTo = (path) => {
    const row = rowsOf(wrap).find((node) => node.dataset.path === path);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    return !!row;
  };
  /* The keyboard's row comes back after a redraw; when it is gone, the nearest group above. */
  if (o.focusPath !== undefined) {
    let wanted = o.focusPath;
    for (;;) {
      const row = rowsOf(wrap).find((node) => node.dataset.path === wanted);
      if (row) { row.focus({ preventScroll: true }); break; }
      const above = ancestorsOf(wanted);
      if (!above.length) break;
      wanted = above.pop();
    }
  }
  if (o.sticky) {
    /* The open groups the first visible row sits inside stay pinned at the top, as in the Tree.
     * Depths count from 1 there (the root is 0). */
    const descriptors = shown.map((row) => ({ path: row.path, depth: row.depth + 1, closing: false, keyText: row.label }));
    mountSticky(wrap, scroller, descriptors, () => firstRowBelow(lines, scroller.getBoundingClientRect().top), scrollTo)();
  }
  return { matched: true, rows: shown.length, truncated: drawn.truncated, scrollTo };
}
