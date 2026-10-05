'use strict';

/* Collapsible JSON tree view, shared by the Data tab and the Remote actions
 * tab. The decisions about which rows exist — containers vs leaves, what a
 * filter matches, what a collapsed branch summarises to — live in
 * src/core/json-tree-model.js; this file only ever writes the DOM for them.
 *
 *   renderJsonTree(parent, rootKey, value, {
 *     expanded: Set,          // paths currently open, mutated by the caller
 *     changed: Set|null,      // paths to flash
 *     changedBranch: Set|null,// collapsed parents that contain a change
 *     touched: Set|null,      // paths that changed at some point; kept marked
 *     before: Map|null,       // marked path -> value before its first change (tooltip)
 *     focus: path|null,       // the row being pointed at (jump / next change)
 *     only: Set|null,         // show just these paths (changed-only view)
 *     filter: '',             // key/value substring filter
 *     transform: fn(value),   // applied to what the copy buttons put on the clipboard
 *     onJump: fn(path)|null,  // adds an "in structure" button to the rows jumpLabel accepts
 *     jumpLabel: fn(path)|null, // tooltip for that row's button, or null to leave the row without one
 *     pinned: Set|null,       // paths on the watch list (labels the pin button)
 *     onPin: fn(path)|null,   // adds a watch / unwatch button to each row
 *     onContext: fn(ev, { path, value, keyText, container })|null, // right-click
 *     maxRows: 4000,          // more rows than this are drawn a window at a time
 *     onToggle: fn(path)      // called after a row is expanded or collapsed
 *   })  ->  { rows, matched, truncated, scrollTo(path), windowed }
 */

import { SEP, isContainer, entriesOf, summarise, collectMatches } from '../core/json-tree-model.js';
import { caseInsensitive } from '../core/text-search.js';
import { writeClipboard } from './clipboard.js';
import { numberLines, scrollerOf, renderWindowed } from './tree-window.js';
import './tree-copy.js'; // registers the copy handler that goes with the tree rows

const LONG_TEXT = 600;

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
    span.title = type === 'string' ? value : text;
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

  span.title = type === 'string' ? value : text;
  return span;
}

/* What the per-row copy button puts on the clipboard: the value as JSON, so a
 * string keeps its quotes and escapes and a branch is pretty-printed. */
export function copyValueOf(value) {
  const json = JSON.stringify(value, null, 2);
  return json === undefined ? String(value) : json;
}

function copyButton(label, title, getText) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-copy';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const text = getText();
    writeClipboard(text).then(() => {
      button.textContent = '✓';
      setTimeout(() => { button.textContent = label; }, 1000);
    }, () => {});
  });
  return button;
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
function collectRows(value, keyText, path, depth, ctx, out) {
  if (out.length >= ctx.hardCap) { ctx.capped = true; return; }
  if (ctx.filtering && !ctx.visible.has(path)) return;

  const container = isContainer(value);
  const open = container && (ctx.filtering || ctx.expanded.has(path));
  out.push({ keyText, value, path, depth, container, open, closing: false });
  if (!container || !open) return;

  entriesOf(value).forEach(([childKey, childValue]) => {
    collectRows(childValue, childKey, path ? path + SEP + childKey : childKey, depth + 1, ctx, out);
  });
  out.push({ keyText: '', value, path, depth, container, open, closing: true });
}

function buildRow(desc, ctx) {
  const { keyText, value, path, depth, container, open } = desc;
  const row = document.createElement('div');
  row.className = 'row';
  indentRow(row, depth);

  if (desc.closing) {
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
  if (ctx.changed && ctx.changed.has(path)) row.classList.add('is-changed');
  const marked = ctx.touched && ctx.touched.has(path);
  if (marked) row.classList.add('is-touched');
  const was = marked && ctx.before && ctx.before.has(path) ? `Was: ${describeBefore(ctx.before.get(path))}` : '';
  if (was) row.title = was;
  if (ctx.focus !== null && ctx.focus === path) row.classList.add('is-focus');

  const twisty = document.createElement('span');
  twisty.className = `twisty${container ? '' : ' is-leaf'}`;
  twisty.textContent = container ? (open ? '▾' : '▸') : '';
  row.appendChild(twisty);

  const key = document.createElement('span');
  key.className = `k${/^\d+$/.test(keyText) && depth > 0 ? ' is-index' : ''}`;
  key.appendChild(highlight(keyText, ctx.q));
  row.appendChild(key);

  const colon = document.createElement('span');
  colon.className = 'punc';
  colon.textContent = ':';
  row.appendChild(colon);

  if (container) {
    const head = document.createElement('span');
    head.className = 'preview';
    head.textContent = open ? (Array.isArray(value) ? ' [' : ' {') : summarise(value, path, ctx.changedBranch, ctx.changed);
    row.appendChild(head);

    row.addEventListener('click', () => {
      if (ctx.filtering) return;
      if (ctx.expanded.has(path)) ctx.expanded.delete(path); else ctx.expanded.add(path);
      ctx.onToggle(path);
    });
  } else {
    const span = valueSpan(value, ctx, path);
    if (was) span.title = `${span.title}\n${was}`;
    row.appendChild(span);
  }

  const tools = document.createElement('span');
  tools.className = 'row-tools';
  tools.appendChild(copyButton('copy value', container ? 'Copy this branch as JSON' : 'Copy this value',
    () => copyValueOf(ctx.transform(value))));
  if (ctx.onPin) {
    const pinned = ctx.pinned && ctx.pinned.has(path);
    tools.appendChild(plainButton(pinned ? 'unwatch' : 'watch',
      pinned ? 'Remove this path from the watch list' : 'Keep this value in view in the watch list',
      () => ctx.onPin(path)));
  }
  const jumpTitle = ctx.onJump ? (ctx.jumpLabel ? ctx.jumpLabel(path) : 'Select the element that owns this value in the Structure tab') : null;
  if (jumpTitle) tools.appendChild(plainButton('in structure', jumpTitle, () => ctx.onJump(path)));
  row.appendChild(tools);

  if (ctx.onContext) {
    row.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ctx.onContext(ev, { path, value, keyText, container });
    });
  }

  return row;
}

function plainButton(label, title, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-copy';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', (ev) => { ev.stopPropagation(); action(); });
  return button;
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
    changed: opts.changed || null,
    changedBranch: opts.changedBranch || null,
    touched: opts.touched || null,
    before: opts.before || null,
    focus: opts.focus === undefined ? null : opts.focus,
    pinned: opts.pinned || null,
    transform: opts.transform || ((v) => v),
    onJump: opts.onJump || null,
    jumpLabel: opts.jumpLabel || null,
    onPin: opts.onPin || null,
    onContext: opts.onContext || null,
    onToggle: opts.onToggle || (() => {}),
    q: '',
    filtering: false,
    visible: null
  };

  /* A previous windowed draw into this scroller left a scroll listener behind;
   * whatever is drawn now, it must go. */
  const previousScroller = scrollerOf(parent, opts.scroller);
  if (previousScroller.__vwinCleanup) previousScroller.__vwinCleanup();

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
  collectRows(value, rootKey, '', 0, ctx, rows);

  if (rows.length > (opts.maxRows || 4000)) {
    const scrollTo = renderWindowed(parent, rows, (desc) => buildRow(desc, ctx), opts.scroller);
    return { rows: rows.length, matched: true, truncated: ctx.capped, scrollTo, windowed: true };
  }

  numberLines(parent, rows.length);
  const frag = document.createDocumentFragment();
  rows.forEach((desc) => frag.appendChild(buildRow(desc, ctx)));
  parent.appendChild(frag);

  const scrollTo = (path) => {
    const row = [...parent.querySelectorAll('.row')].find((node) => node.dataset.path === path);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    return !!row;
  };
  return { rows: rows.length, matched: true, truncated: ctx.capped, scrollTo, windowed: false };
}
