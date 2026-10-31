'use strict';

/* Collapsible JSON tree view, shared by the Data tab and the Calls
 * tab. The decisions about which rows exist — containers vs leaves, what a
 * filter matches, what a collapsed branch summarises to — live in
 * src/core/shared/json-tree-model.js; this file only ever writes the DOM for them.
 *
 *   renderJsonTree(parent, rootKey, value, {
 *     expanded: Set,          // paths currently open, mutated by the caller
 *     filterOpen: Map|null,   // while filtering: path -> open, the user's toggles (default open), mutated by the view
 *     changed: Set|null,      // paths to flash
 *     flashElapsed: number,   // ms the flash has already run (redraw mid-flash)
 *     changedBranch: Set|null,// collapsed parents that contain a change
 *     touched: Set|null,      // paths that changed at some point; kept marked
 *     before: Map|null,       // marked path -> value before its first change (tooltip)
 *     jumped: path|null|() => path|null,  // the row just jumped to: flashed, with no lasting outline;
 *                                         // a function is read per row built (a windowed tree rebuilds on scroll)
 *     jumpElapsed: number|() => number,   // ms that flash has already run (redraw mid-flash)
 *     only: Set|null,         // show just these paths (changed-only view)
 *     filter: '',             // key/value substring filter
 *     transform: fn(value),   // applied to what the copy buttons put on the clipboard
 *     onJump: fn(path)|null,  // adds a "show in Structure" button to the rows jumpLabel accepts
 *     jumpLabel: fn(path)|null, // tooltip for that row's button, or null to leave the row without one
 *     pinned: Set|null,       // paths on the watch list (labels the pin button)
 *     onPin: fn(path)|null,   // adds a watch / unwatch button to each row
 *     mergeButton: false,     // adds a button after the copy button that copies the row's place as a %merge% field (tree root = the data the path is read in)
 *     canOpenRecord: fn(value)|null, // with onOpenRecord: which leaf values get an "open record" button (a record Id)
 *     onOpenRecord: fn(path, value)|null, // adds that button, after the other row buttons
 *     sticky: false,          // pin the open branches the first visible row is inside at the top (at most three lines)
 *     rootTitle: '',          // the tooltip of the root row (its label is rootKey)
 *     rowNote: fn(path)|null, // an extra tooltip line for a row ('' for none), such as when it last changed
 *     onContext: fn(ev, { path, value, keyText, container, inArray })|null, // right-click
 *     maxRows: MAX_ROWS (1500),          // more rows than this are drawn a window at a time
 *     onToggle: fn(path)      // called after a row is expanded or collapsed (Alt+click or the row's expand button: with everything inside it)
 *     focusPath: path|undefined // the row that had keyboard focus before this redraw; it gets it back
 *   })  ->  { rows, matched, truncated, scrollTo(path), windowed }
 */

import { SEP, MAX_ROWS, joinPath, isBranchOpen, setSubtreeOpen, isContainer, entriesOf, summarise, collectMatches, lineSize, childLines, closingLine } from '../core/shared/json-tree-model.js';
import { caseInsensitive } from '../core/shared/text-search.js';
import { writeClipboard } from './clipboard.js';
import { flashDone } from './util.js';
import { icon } from './icons.js';
import { mergeField } from '../core/shared/filter-query.js';
import { numberLines, scrollerOf, renderWindowed } from './tree-window.js';
import { mountSticky, firstRowBelow } from './tree-sticky.js';
import './tree-copy.js'; // registers the copy handler that goes with the tree rows

const LONG_TEXT = 600;

/* A tooltip is for a glance: the whole of a megabyte string would be copied
 * into the DOM on every redraw. */
const TITLE_MAX = 1024;
const tooltipOf = (text) => (text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text);

function highlight(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }

  const finder = caseInsensitive(query);
  let from = 0;
  let found = finder.exec(text);
  while (found) {
    frag.appendChild(document.createTextNode(text.slice(from, found.index)));
    const mark = document.createElement('mark');
    mark.textContent = found[0];
    frag.appendChild(mark);
    from = found.index + found[0].length;
    found = finder.exec(text);
  }
  frag.appendChild(document.createTextNode(text.slice(from)));
  return frag;
}

function valueSpan(value, ctx, path) {
  const span = document.createElement('span');
  if (value === null) { span.className = 'v v-null'; span.textContent = ' null'; return span; }

  const type = typeof value;
  span.className = `v v-${type}`;
  /* The real text of a string, kept apart from the tooltip (which can carry a
   * "Was: …" line) so copying a selection never picks the tooltip up. */
  if (type === 'string') span.dataset.text = value;
  const text = type === 'string' ? JSON.stringify(value) : String(value);

  span.appendChild(document.createTextNode(' '));

  if (text.length <= LONG_TEXT) {
    span.appendChild(highlight(text, ctx.q));
    span.title = tooltipOf(type === 'string' ? value : text);
    return span;
  }

  /* Long value: show a slice with an inline toggle rather than a dead
   * "… (N chars)". The open paths live in ctx.expandedText, owned by the
   * caller exactly like ctx.expanded, so the state survives a re-render. */
  const open = ctx.expandedText.has(path);
  span.appendChild(highlight(open ? text : text.slice(0, LONG_TEXT) + '…', ctx.q));

  const toggle = document.createElement('span');
  toggle.className = 'v-more';
  toggle.textContent = open ? ' show less' : ` show all ${text.length} chars`;
  toggle.title = open ? 'Collapse this value' : 'Show the full value';
  toggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (open) ctx.expandedText.delete(path); else ctx.expandedText.add(path);
    ctx.onToggle(path);
  });
  span.appendChild(toggle);

  span.title = tooltipOf(type === 'string' ? value : text);
  return span;
}

/* A flash option is a value, or a function read each time a row is built: a
 * windowed tree builds rows again on scroll, long after the render that passed
 * the option, and must not start a flash that is over. */
function liveValue(option) {
  return typeof option === 'function' ? option() : option;
}

/* What the per-row copy button puts on the clipboard: the value as JSON, so a
 * string keeps its quotes and escapes and a branch is pretty-printed. */
export function copyValueOf(value) {
  const json = JSON.stringify(value, null, 2);
  return json === undefined ? String(value) : json;
}

/* Row buttons carry an icon and nothing else: no text node, so nothing leaks
 * into a copied selection. The title is the help text; aria-label repeats it
 * for screen readers. */
export function rowButton(iconName, title, action, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `row-copy${extraClass}`;
  /* Roving, like the rows: only the focused row's buttons are in the Tab order
   * (see syncToolsTab), so the pointer user never tabs through hidden ones. */
  button.tabIndex = -1;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.appendChild(icon(iconName));
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    action(button);
    /* A pointer click lets go at once (the buttons stay shown by the hover).
     * Enter or Space (detail 0) keeps focus on the button while its check mark
     * shows: the tools are shown only for the keyboard's focus, so letting go
     * at once would hide the confirmation. */
    if (ev.detail === 0) setTimeout(() => releaseFocus(button), CONFIRM_HOLD_MS); else releaseFocus(button);
  });
  return button;
}

/* A little longer than the check mark's 1.2 s (flashDone). */
const CONFIRM_HOLD_MS = 1300;

/* A row button keeps focus after its click. Hand it back to the scroller, so
 * the keyboard stays in the tree and a redraw is not held up by the button.
 * Does nothing when focus has moved on already (Tab, an arrow, the pointer). */
function releaseFocus(button) {
  if (document.activeElement !== button) return;
  const scroller = button.closest && button.closest('.viewport, .detail-body, .log-detail');
  if (scroller && scroller.tabIndex >= 0) scroller.focus({ preventScroll: true }); else button.blur();
}

function copyButton(title, getText) {
  return rowButton('copy', title, (button) => {
    writeClipboard(getText()).then(() => flashDone(button), () => {});
  });
}

/* Indent by depth with a hanging indent of one twisty width, so a value that
 * wraps continues under the key rather than under the twisty. */
const TWISTY_PX = 15;

function indentRow(row, depth) {
  row.dataset.depth = String(depth);
  row.style.paddingLeft = `calc(var(--gutter, 0px) + ${4 + TWISTY_PX + depth * 12}px)`;
  row.style.textIndent = `-${TWISTY_PX}px`;
}

/* The old value of a marked row, for its tooltip. */
const BEFORE_MAX = 300;

export function describeBefore(value) {
  if (value === undefined) return 'not set';
  let text;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  if (text === undefined) text = String(value);
  return text.length > BEFORE_MAX ? `${text.slice(0, BEFORE_MAX)}…` : text;
}

/* The rows a tree shows, as plain descriptors, before any DOM exists: what is
 * open, what the filter lets through, and where each closing brace goes. Kept
 * apart from drawing so a big payload can be drawn a window at a time. */
function collectRows(value, keyText, path, depth, line, ctx, out, inArray = false) {
  if (out.length >= ctx.hardCap) { ctx.capped = true; return; }
  if (ctx.filtering && !ctx.visible.has(path)) return;

  const container = isContainer(value);
  const empty = container && lineSize(value) === 1; // {} and [] are one line, with nothing to open
  const open = container && !empty && isBranchOpen(ctx, path);
  out.push({ keyText, value, path, depth, container, empty, open, closing: false, line, inArray });
  if (!container || !open) return;

  const starts = childLines(value, line);
  entriesOf(value).forEach(([childKey, childValue], i) => {
    collectRows(childValue, childKey, joinPath(path, childKey, depth), depth + 1, starts[i], ctx, out, Array.isArray(value));
  });
  out.push({ keyText: '', value, path, depth, container, empty, open, closing: true, line: closingLine(value, line) });
}

function buildRow(desc, ctx) {
  const { keyText, value, path, depth, container, open } = desc;
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.line = String(desc.line);
  indentRow(row, depth);

  if (desc.closing) {
    row.setAttribute('aria-hidden', 'true'); // a closing brace is not an item
    const pad = document.createElement('span');
    pad.className = 'twisty is-leaf';
    row.appendChild(pad);
    const brace = document.createElement('span');
    brace.className = 'punc';
    brace.textContent = Array.isArray(value) ? ']' : '}';
    row.appendChild(brace);
    return row;
  }

  row.dataset.path = path;
  /* A tree for the keyboard and screen readers: one row is in the tab order
   * (roving), the arrows move between rows. */
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-level', String(depth + 1));
  row.tabIndex = path === ctx.tabPath ? 0 : -1;
  if (ctx.changed && ctx.changed.has(path)) {
    row.classList.add('is-changed');
    /* A row drawn mid-flash is new DOM, so its animation would start over;
     * start it that far in instead. */
    if (ctx.flashElapsed) row.style.animationDelay = `-${Math.round(ctx.flashElapsed)}ms`;
  }
  const marked = ctx.touched && ctx.touched.has(path);
  if (marked) row.classList.add('is-touched');
  const wasText = marked && ctx.before && ctx.before.has(path) ? `Was: ${describeBefore(ctx.before.get(path))}` : '';
  const note = ctx.rowNote ? ctx.rowNote(path) : '';
  const was = [wasText, note].filter(Boolean).join('\n');
  if (was) { row.title = was; row.setAttribute('aria-description', was); }
  /* A jump scrolls to its row and flashes it; nothing stays outlined, so a row
   * arrived at from another tab looks like any other once the flash is over. */
  const jumped = liveValue(ctx.jumped);
  if (jumped !== null && jumped === path) {
    row.classList.add('is-jumped');
    const elapsed = liveValue(ctx.jumpElapsed);
    if (elapsed) row.style.animationDelay = `-${Math.round(elapsed)}ms`;
  }

  const twisty = document.createElement('span');
  const toggles = container && !desc.empty;
  twisty.className = `twisty${toggles ? '' : ' is-leaf'}`;
  twisty.textContent = toggles ? (open ? '▾' : '▸') : '';
  if (toggles) row.setAttribute('aria-expanded', String(open));
  row.appendChild(twisty);

  const key = document.createElement('span');
  /* An item of an array, not an object key that happens to be a number. */
  key.className = `k${desc.inArray ? ' is-index' : ''}`;
  if (depth === 0 && ctx.rootTitle) key.title = ctx.rootTitle;
  key.appendChild(desc.inArray ? document.createTextNode(keyText) : highlight(keyText, ctx.q)); // an index is not text the filter looks at
  row.appendChild(key);

  const colon = document.createElement('span');
  colon.className = 'punc';
  colon.textContent = ':';
  row.appendChild(colon);

  if (container) {
    const head = document.createElement('span');
    head.className = 'preview';
    if (desc.empty) head.textContent = Array.isArray(value) ? ' []' : ' {}';
    else head.textContent = open ? (Array.isArray(value) ? ' [' : ' {') : summarise(value, path, ctx.changedBranch, ctx.changed);
    row.appendChild(head);

    if (toggles) row.addEventListener('click', (ev) => toggleRow(ctx, path, open, ev.altKey ? value : undefined));
  } else {
    const span = valueSpan(value, ctx, path);
    if (was) span.title = `${span.title}\n${was}`;
    row.appendChild(span);
  }

  const tools = document.createElement('span');
  tools.className = 'row-tools';
  if (toggles) {
    tools.appendChild(rowButton(open ? 'collapse' : 'expand',
      open ? 'Collapse everything inside (Alt+click on the row does the same)'
        : 'Expand everything inside (Alt+click on the row does the same)',
      () => toggleRow(ctx, path, open, value), ' row-fold'));
  }
  tools.appendChild(copyButton(container ? 'Copy this branch as JSON (c)' : 'Copy this value (c)',
    () => copyValueOf(ctx.transform(value))));
  appendRowActions(tools, ctx, path, value, container);
  if (path === ctx.toolsPath) setToolsTab(tools, 0);
  row.appendChild(tools);

  if (ctx.onContext) {
    row.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ctx.onContext(ev, { path, value, keyText, container, inArray: desc.inArray });
    });
  }

  return row;
}

/* The buttons after the copy button on a row: Copy as %merge% field, watch,
 * Show in Structure and Open record, each only when the options ask for it.
 * Shared with the Data tab's Form view, so both draw the same buttons.
 * ctx: { root, mergeButton, onPin, pinned, onJump, jumpLabel, onOpenRecord,
 * canOpenRecord } as the tree's options name them. */
export function appendRowActions(tools, ctx, path, value, container) {
  /* The same text as the row menu's "Copy as %merge% field". A path, not a
   * value, so Mask values has nothing to hide. The root has no path. */
  const merge = ctx.mergeButton && path ? mergeField(ctx.root, path) : '';
  if (merge) {
    const button = rowButton('percent', `Copy as %merge% field: ${merge}`, (btn) => {
      writeClipboard(merge).then(() => flashDone(btn), () => {});
    });
    button.setAttribute('data-help', 'Buttons on a row');
    tools.appendChild(button);
  }
  if (ctx.onPin && path) { // the whole payload cannot be watched: it has no path
    const pinned = ctx.pinned && ctx.pinned.has(path);
    tools.appendChild(rowButton(pinned ? 'eye-off' : 'eye',
      pinned ? 'Stop watching this value' : 'Watch this value: keep it in view in the watch list',
      () => ctx.onPin(path)));
  }
  const jumpTitle = ctx.onJump ? (ctx.jumpLabel ? ctx.jumpLabel(path) : 'Select the element that owns this value in the Structure tab') : null;
  if (jumpTitle) tools.appendChild(rowButton('structure', jumpTitle, () => ctx.onJump(path)));
  if (!container && ctx.onOpenRecord && ctx.canOpenRecord && ctx.canOpenRecord(value)) {
    const open = rowButton('external', 'Open this record in a new tab', () => ctx.onOpenRecord(path, value));
    open.setAttribute('data-help', 'Buttons on a row');
    tools.appendChild(open);
  }
}

/* `whole` is the branch's value when the toggle covers everything inside it
 * (Alt+click, the row button); otherwise only this one level changes. */
function toggleRow(ctx, path, open, whole) {
  if (whole !== undefined) {
    if (!setSubtreeOpen(ctx, whole, path, !open)) return;
  } else if (ctx.filtering) {
    if (!ctx.filterOpen) return;
    ctx.filterOpen.set(path, !open);
  } else if (open) {
    ctx.expanded.delete(path);
  } else {
    ctx.expanded.add(path);
  }
  ctx.onToggle(path);
}

/* ---------------------------------------------------------- keyboard */

/* The row buttons are shown by hover or by the keyboard's focus and are never
 * display:none or hidden, so a focus order made of all of them would take Tab
 * through buttons nobody sees. Only the row that has focus has its buttons in
 * the Tab order: Tab from a focused row reaches its first button at once. */
function setToolsTab(tools, value) {
  tools.querySelectorAll('button').forEach((button) => { button.tabIndex = value; });
}

function syncToolsTab(ev) {
  const parent = ev.currentTarget;
  const ctx = parent.__treeCtx;
  const row = ev.target.closest && ev.target.closest('.row[data-path]');
  if (!ctx || !row || !parent.contains(row) || row.dataset.path === ctx.toolsPath) return;
  parent.querySelectorAll('.row[data-path]').forEach((node) => {
    if (node !== row && node.dataset.path === ctx.toolsPath) {
      const old = node.querySelector(':scope > .row-tools');
      if (old) setToolsTab(old, -1);
    }
  });
  ctx.toolsPath = row.dataset.path;
  const tools = row.querySelector(':scope > .row-tools');
  if (tools) setToolsTab(tools, 0);
}

const treeRows = (parent) => [...parent.querySelectorAll('.row[data-path]')];

function focusRow(row) {
  if (!row) return;
  row.focus();
}

/* Arrow keys, Home / End and Enter on a focused row. ←/→ fold and unfold
 * (→ on an open branch goes to its first child, ← on a closed row to its
 * parent); a toggle redraws the tree, which hands focus back to the same row
 * by path. Keys typed in a row's buttons are left to the buttons. */
function onTreeKey(ev) {
  const parent = ev.currentTarget;
  const ctx = parent.__treeCtx;
  if (!ctx || ev.ctrlKey || ev.metaKey || ev.altKey) return;

  if (ev.target === parent) {
    if (ev.key === 'ArrowDown' || ev.key === 'Home') {
      const first = treeRows(parent)[0];
      if (first) { ev.preventDefault(); focusRow(first); }
    }
    return;
  }

  const row = ev.target;
  if (!row.classList || !row.classList.contains('row') || row.dataset.path === undefined) return;
  const rows = treeRows(parent);
  const at = rows.indexOf(row);
  const path = row.dataset.path;
  const expandable = row.hasAttribute('aria-expanded');
  const open = row.getAttribute('aria-expanded') === 'true';

  const go = (target) => { if (target) { ev.preventDefault(); focusRow(target); } };
  const toggle = (want) => {
    ev.preventDefault();
    if (open === want) return;
    parent.__refocus = path;
    toggleRow(ctx, path, open);
  };

  switch (ev.key) {
    case 'ArrowDown': go(rows[at + 1]); break;
    case 'ArrowUp': go(rows[at - 1]); break;
    case 'Home': go(rows[0]); break;
    case 'End': go(rows[rows.length - 1]); break;
    case 'ArrowRight':
      if (expandable && !open) toggle(true);
      else if (expandable) go(rows[at + 1]);
      break;
    case 'ArrowLeft':
      if (expandable && open) toggle(false);
      else if (path) {
        const cut = path.lastIndexOf(SEP);
        const parentPath = cut < 0 ? '' : path.slice(0, cut);
        go(rows.find((candidate) => candidate.dataset.path === parentPath));
      }
      break;
    case 'Enter':
    case ' ':
      if (expandable) toggle(!open); else ev.preventDefault();
      break;
    default: break;
  }
}

/* Give focus back to a row after a redraw; when it is gone, to the nearest
 * ancestor that is still there. */
function restoreFocus(parent, path, scrollTo) {
  let wanted = path;
  for (;;) {
    scrollTo(wanted);
    const row = treeRows(parent).find((candidate) => candidate.dataset.path === wanted);
    if (row) { row.focus({ preventScroll: true }); return; }
    if (!wanted) return;
    const cut = wanted.lastIndexOf(SEP);
    wanted = cut < 0 ? '' : wanted.slice(0, cut);
  }
}

/* Past this many rows nothing more is drawn or listed: a tree that big is
 * better filtered. Far beyond what windowing needs to cope. */
const HARD_CAP = 250000;

export function renderJsonTree(parent, rootKey, value, opts = {}) {
  const ctx = {
    capped: false,
    hardCap: HARD_CAP,
    expanded: opts.expanded || new Set(['']),
    expandedText: opts.expandedText || new Set(),
    filterOpen: opts.filterOpen || null,
    changed: opts.changed || null,
    flashElapsed: opts.flashElapsed || 0,
    changedBranch: opts.changedBranch || null,
    touched: opts.touched || null,
    before: opts.before || null,
    jumped: opts.jumped === undefined ? null : opts.jumped,
    jumpElapsed: opts.jumpElapsed || 0,
    pinned: opts.pinned || null,
    transform: opts.transform || ((v) => v),
    onJump: opts.onJump || null,
    jumpLabel: opts.jumpLabel || null,
    onPin: opts.onPin || null,
    mergeButton: !!opts.mergeButton,
    root: value,
    canOpenRecord: opts.canOpenRecord || null,
    onOpenRecord: opts.onOpenRecord || null,
    onContext: opts.onContext || null,
    rowNote: opts.rowNote || null,
    rootTitle: opts.rootTitle || '',
    onToggle: opts.onToggle || (() => {}),
    q: '',
    filtering: false,
    visible: null,
    tabPath: null,
    toolsPath: null // the row whose buttons are in the Tab order
  };

  /* One keydown listener per container, reading the latest context. */
  parent.__treeCtx = ctx;
  if (!parent.__treeKeys) {
    parent.__treeKeys = true;
    parent.addEventListener('keydown', onTreeKey);
    parent.addEventListener('focusin', syncToolsTab);
  }
  parent.setAttribute('role', 'tree');
  const wantFocus = opts.focusPath !== undefined ? opts.focusPath : parent.__refocus;
  parent.__refocus = undefined;

  /* A previous windowed draw into this scroller left a scroll listener behind;
   * whatever is drawn now, it must go. */
  const previousScroller = scrollerOf(parent, opts.scroller);
  if (previousScroller.__vwinCleanup) previousScroller.__vwinCleanup();
  if (previousScroller.__stickyCleanup) previousScroller.__stickyCleanup();

  const query = (opts.filter || '').trim().toLowerCase();
  let visible = null;
  if (query) {
    visible = new Set();
    collectMatches(value, '', '', query, visible);
    ctx.q = query;
  }
  if (opts.only) {
    visible = visible ? new Set([...visible].filter((path) => opts.only.has(path))) : opts.only;
  }
  if (visible) {
    if (!visible.size) return { rows: 0, matched: false, truncated: false, scrollTo: () => false };
    ctx.filtering = true;
    ctx.visible = visible;
  }

  const rows = [];
  collectRows(value, rootKey, '', 0, 1, ctx, rows);
  const drawn = rows.filter((desc) => !desc.closing);
  ctx.tabPath = wantFocus !== undefined && drawn.some((desc) => desc.path === wantFocus) ? wantFocus : (drawn[0] ? drawn[0].path : null);
  ctx.toolsPath = ctx.tabPath;

  if (rows.length > (opts.maxRows || MAX_ROWS)) {
    const scrollTo = renderWindowed(parent, rows, (desc) => buildRow(desc, ctx), opts.scroller, lineSize(value));
    if (wantFocus !== undefined) restoreFocus(parent, wantFocus, scrollTo);
    if (opts.sticky) {
      mountSticky(parent, scrollerOf(parent, opts.scroller), rows, scrollTo.topIndex, scrollTo)();
    }
    return { rows: rows.length, matched: true, truncated: ctx.capped, scrollTo, windowed: true };
  }

  numberLines(parent, lineSize(value));
  const frag = document.createDocumentFragment();
  rows.forEach((desc) => frag.appendChild(buildRow(desc, ctx)));
  parent.appendChild(frag);

  const scrollTo = (path) => {
    const row = [...parent.querySelectorAll('.row')].find((node) => node.dataset.path === path);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    return !!row;
  };
  if (wantFocus !== undefined) restoreFocus(parent, wantFocus, () => false);
  if (opts.sticky) {
    const scroller = scrollerOf(parent, opts.scroller);
    const drawnRows = [...parent.children].filter((node) => node.classList && node.classList.contains('row'));
    mountSticky(parent, scroller, rows, () => firstRowBelow(drawnRows, scroller.getBoundingClientRect().top), scrollTo)();
  }
  return { rows: rows.length, matched: true, truncated: ctx.capped, scrollTo, windowed: false };
}
