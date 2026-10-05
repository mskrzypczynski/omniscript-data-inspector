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
 *     filter: '',             // key/value substring filter
 *     maxRows: 4000,
 *     onToggle: fn(path)      // called after a row is expanded or collapsed
 *   })  ->  { rows, matched, truncated }
 */

import { SEP, isContainer, entriesOf, summarise, collectMatches } from '../core/json-tree-model.js';

/* How long a change stays marked. The Data tab rebuilds its tree on every
 * poll, so it has to remember changed paths for this long or they vanish
 * after one render. Structure updates cells in place and needs no such
 * memory — but both fade over the same --flash-duration in the CSS. */
export const HIGHLIGHT_MS = 3000;

const LONG_TEXT = 600;

function highlight(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }

  const haystack = text.toLowerCase();
  let from = 0;
  let at = haystack.indexOf(query);
  while (at !== -1) {
    frag.appendChild(document.createTextNode(text.slice(from, at)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + query.length);
    frag.appendChild(mark);
    from = at + query.length;
    at = haystack.indexOf(query, from);
  }
  frag.appendChild(document.createTextNode(text.slice(from)));
  return frag;
}

function valueSpan(value, ctx, path) {
  const span = document.createElement('span');
  if (value === null) { span.className = 'v v-null'; span.textContent = ' null'; return span; }

  const type = typeof value;
  span.className = `v v-${type}`;
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

/* Value for the per-row copy button: the bare string (no quotes or escapes)
 * for a string, the literal for other leaves, pretty JSON for a container. */
function copyValueOf(value) {
  if (isContainer(value)) return JSON.stringify(value, null, 2);
  return value === null ? 'null' : String(value);
}

/* a.b[0]["odd key"] — usable in the Console. The root copies as its own key. */
export function pathOf(rootKey, chain) {
  let out = rootKey;
  chain.forEach((key) => {
    if (/^\d+$/.test(key)) out += `[${key}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(key)) out += `.${key}`;
    else out += `[${JSON.stringify(key)}]`;
  });
  return out;
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
    const done = () => {
      button.textContent = '✓';
      setTimeout(() => { button.textContent = label; }, 1000);
    };
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  });
  return button;
}

function renderNode(parent, keyText, value, path, depth, ctx, chain) {
  if (ctx.rows >= ctx.maxRows) return;
  if (ctx.filtering && !ctx.visible.has(path)) return;

  const container = isContainer(value);
  const open = container && (ctx.filtering || ctx.expanded.has(path));

  const row = document.createElement('div');
  row.className = 'row';
  row.style.paddingLeft = `${4 + depth * 12}px`;
  if (ctx.changed && ctx.changed.has(path)) row.classList.add('is-changed');
  ctx.rows++;

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
    row.appendChild(valueSpan(value, ctx, path));
  }

  const tools = document.createElement('span');
  tools.className = 'row-tools';
  tools.appendChild(copyButton('⧉', container ? 'Copy this branch as JSON' : 'Copy this value', () => copyValueOf(value)));
  tools.appendChild(copyButton('⌖', 'Copy the path to this value', () => pathOf(ctx.rootKey, chain)));
  row.appendChild(tools);

  parent.appendChild(row);
  if (!container || !open) return;

  entriesOf(value).forEach(([childKey, childValue]) => {
    const childPath = path ? path + SEP + childKey : childKey;
    renderNode(parent, childKey, childValue, childPath, depth + 1, ctx, chain.concat(childKey));
  });

  if (ctx.rows < ctx.maxRows) {
    const close = document.createElement('div');
    close.className = 'row';
    close.style.paddingLeft = `${4 + depth * 12}px`;
    const pad = document.createElement('span');
    pad.className = 'twisty is-leaf';
    close.appendChild(pad);
    const brace = document.createElement('span');
    brace.className = 'punc';
    brace.textContent = Array.isArray(value) ? ']' : '}';
    close.appendChild(brace);
    parent.appendChild(close);
    ctx.rows++;
  }
}

export function renderJsonTree(parent, rootKey, value, opts = {}) {
  const ctx = {
    rows: 0,
    rootKey,
    maxRows: opts.maxRows || 4000,
    expanded: opts.expanded || new Set(['']),
    expandedText: opts.expandedText || new Set(),
    changed: opts.changed || null,
    changedBranch: opts.changedBranch || null,
    onToggle: opts.onToggle || (() => {}),
    q: '',
    filtering: false,
    visible: null
  };

  const query = (opts.filter || '').trim().toLowerCase();
  if (query) {
    const visible = new Set();
    collectMatches(value, '', '', query, visible);
    if (!visible.size) return { rows: 0, matched: false, truncated: false };
    ctx.q = query;
    ctx.filtering = true;
    ctx.visible = visible;
  }

  const frag = document.createDocumentFragment();
  renderNode(frag, rootKey, value, '', 0, ctx, []);
  parent.appendChild(frag);

  return { rows: ctx.rows, matched: true, truncated: ctx.rows >= ctx.maxRows };
}

/* ------------------------------------------------------------------ *
 * Copy
 *
 * The tree lays each node out as separate <span>s in a flex row, so a raw
 * browser copy of a multi-row selection comes out as "key", newline, ":",
 * newline, "value". Rebuild the selection as clean, indented key: value text
 * instead.
 * ------------------------------------------------------------------ */

function cellText(row) {
  const keyEl = row.querySelector(':scope > .k');
  const puncEl = row.querySelector(':scope > .punc');
  const previewEl = row.querySelector(':scope > .preview');
  const valueEl = row.querySelector(':scope > .v');

  if (!keyEl && puncEl) return puncEl.textContent; // lone closing brace

  const prefix = `${keyEl ? keyEl.textContent : ''}:`;
  if (previewEl) return prefix + previewEl.textContent; // ' {'  /  ' {3 keys}'
  if (!valueEl) return prefix;

  const moreToggle = valueEl.querySelector('.v-more');
  if (moreToggle && valueEl.classList.contains('v-string')) {
    return `${prefix} ${JSON.stringify(valueEl.getAttribute('title') || '')}`;
  }
  const clone = valueEl.cloneNode(true);
  const clonedToggle = clone.querySelector('.v-more');
  if (clonedToggle) clonedToggle.remove();
  return prefix + clone.textContent.replace(/\s+$/, '');
}

document.addEventListener('copy', (ev) => {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  let anchor = selection.anchorNode;
  anchor = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentNode);
  if (!anchor || !anchor.closest) return;

  const tree = anchor.closest('.viewport, .detail-body, .log-detail');
  if (!tree || !tree.querySelector('.row')) return;

  const lines = [];
  const rows = tree.querySelectorAll('.row');
  for (const row of rows) {
    if (!selection.containsNode(row, true)) continue;
    const px = parseFloat(row.style.paddingLeft) || 4;
    const depth = Math.max(0, Math.round((px - 4) / 12));
    lines.push('  '.repeat(depth) + cellText(row));
  }
  if (!lines.length || !ev.clipboardData) return;

  ev.clipboardData.setData('text/plain', lines.join('\n'));
  ev.preventDefault();
});
