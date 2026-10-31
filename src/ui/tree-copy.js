'use strict';

/* Copying a selection out of a tree or the raw view. The tree lays each node
 * out as inline spans, so a raw browser copy of several rows comes out as
 * "key", ":", "value" in pieces; this rebuilds the selection as clean JSON-shaped
 * text, and applies Mask values to it. Registers one document-level handler
 * when imported. */

import { MASK_STRING, MASK_NUMBER, maskJsonText } from '../core/shared/mask.js';
import { fragmentCopyText, caretInQuotes, caretValueText, rawLineValueAt } from '../core/shared/copy-rules.js';
import { watchText } from '../core/data/watch.js';
import { logLine } from '../core/shared/change-log.js';
import { diffLineText } from './diff-lines.js';
import { Mask } from './mask-setting.js';
import { toast } from './toast.js';

const TREE_SELECTOR = '.viewport, .detail-body, .log-detail';

function cellText(row, isRoot) {
  const keyEl = row.querySelector(':scope > .k');
  const puncEl = row.querySelector(':scope > .punc');
  const previewEl = row.querySelector(':scope > .preview');
  const valueEl = row.querySelector(':scope > .v');

  if (!keyEl && puncEl) return puncEl.textContent; // lone closing brace

  /* JSON syntax: object keys are quoted, array items carry no key at all, and
   * the root row is just its opening brace. */
  const keyText = keyEl ? keyEl.textContent : '';
  const isIndex = keyEl && keyEl.classList.contains('is-index');
  const prefix = isRoot || isIndex ? '' : `${JSON.stringify(keyText)}: `;

  if (previewEl) return prefix + previewEl.textContent.trim(); // '{'  /  '{3 keys}'
  if (!valueEl) return prefix.trimEnd();

  /* With Mask values on, a dragged selection must not carry the real values
   * out either: same placeholders as the copy buttons, empty strings kept. */
  if (Mask.on()) {
    if (valueEl.classList.contains('v-number')) return prefix + JSON.stringify(MASK_NUMBER);
    if (valueEl.classList.contains('v-string')) {
      return prefix + JSON.stringify(valueEl.dataset.text ? MASK_STRING : '');
    }
  }

  const moreToggle = valueEl.querySelector('.v-more');
  if (moreToggle && valueEl.classList.contains('v-string')) {
    return prefix + JSON.stringify(valueEl.dataset.text || '');
  }
  const clone = valueEl.cloneNode(true);
  const clonedToggle = clone.querySelector('.v-more');
  if (clonedToggle) clonedToggle.remove();
  return prefix + clone.textContent.trim();
}

function elementOf(node) {
  return node && (node.nodeType === 1 ? node : node.parentNode);
}

/* Copying inside a field is the browser's business. */
function inField(ev) {
  const hit = (node) => !!node && !!node.closest && !!node.closest('input, textarea, select, [contenteditable="true"]');
  return hit(elementOf(ev.target)) || hit(document.activeElement);
}

function valueKind(valueEl) {
  const match = /\bv-(string|number|boolean|null)\b/.exec(valueEl.className);
  return match ? match[1] : 'plain';
}

/* Part of one row is highlighted: copy exactly that text. The copy buttons and
 * the "show all" toggle are not part of the row's text. Returns true when it
 * took the copy. */
function copyFragment(ev, range) {
  const startRow = elementOf(range.startContainer).closest('.row');
  const endRow = elementOf(range.endContainer).closest('.row');
  if (!startRow || startRow !== endRow || !startRow.closest(TREE_SELECTOR)) return false;

  const holder = document.createElement('div');
  holder.appendChild(range.cloneContents());
  holder.querySelectorAll('.row-tools, .v-more').forEach((node) => node.remove());
  const text = holder.textContent;
  if (!text) return false;

  const valueEl = startRow.querySelector(':scope > .v');
  const kind = valueEl && range.intersectsNode(valueEl) ? valueKind(valueEl) : 'plain';
  ev.clipboardData.setData('text/plain', fragmentCopyText(text, { masked: Mask.on(), kind }));
  ev.preventDefault();
  return true;
}

/* What the caret sits in, as the arguments of caretValueText, for a value of
 * the tree or a line of the Raw view; null anywhere else. */
function valueAtCaret(range) {
  const node = elementOf(range.startContainer);
  if (!node || !node.closest || node.closest('.v-more, .row-tools')) return null;

  const valueEl = node.closest('.v');
  if (valueEl && valueEl.closest(TREE_SELECTOR)) {
    const kind = valueKind(valueEl);
    if (kind === 'plain') return null;
    const clone = valueEl.cloneNode(true);
    clone.querySelectorAll('.v-more').forEach((toggle) => toggle.remove());
    const shown = clone.textContent;
    const upToCaret = document.createRange();
    upToCaret.setStart(valueEl, 0);
    upToCaret.setEnd(range.startContainer, range.startOffset);
    const before = upToCaret.toString();
    const raw = kind === 'string' ? (valueEl.dataset.text || '') : shown.trim();
    return { kind, raw, inQuotes: caretInQuotes(before, shown.slice(before.length)) };
  }

  const raw = node.closest('.raw');
  if (!raw) return null;
  const lineEl = node.closest('.raw-line') || raw;
  const upToCaret = document.createRange();
  upToCaret.setStart(lineEl, 0);
  upToCaret.setEnd(range.startContainer, range.startOffset);
  const before = upToCaret.toString();
  /* An unnumbered view is one text with newlines: cut out the caret's line. */
  const text = lineEl.textContent;
  const lineStart = before.lastIndexOf('\n') + 1;
  const newline = text.indexOf('\n', before.length);
  const line = text.slice(lineStart, newline < 0 ? text.length : newline);
  return rawLineValueAt(line, before.length - lineStart);
}

/* No selection, only a caret (or the last click) inside a value: copy the
 * whole value. */
function copyValueAtCaret(ev, selection) {
  const found = valueAtCaret(selection.getRangeAt(0));
  const text = found && caretValueText({ ...found, masked: Mask.on() });
  if (!text) return;
  ev.clipboardData.setData('text/plain', text);
  ev.preventDefault();
  toast('Copied');
}

/* The watch strip and the lists of differences hold values too, but not as
 * tree rows. With Mask values on, a selection in them is rebuilt line by line
 * from the data behind each line, masked, so a native copy leaks nothing. A
 * partly selected line is copied whole (and masked) for the same reason. */
const PANEL_LINES = '.diff-line, .watch-item, .log-entry';

function maskedPanelLine(node) {
  if (node.__change) return diffLineText(node.__change, Mask.apply, 0);
  if (node.__entry) return logLine(node.__entry, Mask.apply);
  if (!node.__watch) return node.textContent;
  const { label, value, present } = node.__watch;
  return `${label}: ${present ? watchText(Mask.apply(value)) : '— not in the data —'}`;
}

function copyMaskedPanel(ev, selection, anchor) {
  if (!Mask.on() || !anchor.closest('.compare, .watch, .diff-line, .watch-item, .changelog')) return false;
  const lines = [...document.querySelectorAll(PANEL_LINES)]
    .filter((node) => selection.containsNode(node, true)).map(maskedPanelLine);
  if (!lines.length) return false;
  ev.clipboardData.setData('text/plain', lines.join('\n'));
  ev.preventDefault();
  return true;
}

/* A long tree is drawn a window at a time (tree-window.js), so selecting
 * everything on screen copies only the drawn rows. Say so, rather than let
 * the paste look complete. Dragging over a few rows is deliberate and says
 * nothing; the warning is for a selection that reaches all of what is drawn. */
function warnIfPartial(tree, copiedRows) {
  const wrap = tree.querySelector('.vwin');
  if (!wrap) return;
  const total = Number(wrap.dataset.rows);
  const drawnRows = tree.querySelectorAll('.row').length;
  if (!total || copiedRows < drawnRows - 1 || copiedRows >= total) return;
  toast(`Copied ${copiedRows.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows; use Copy JSON for everything`);
}

document.addEventListener('copy', (ev) => {
  if (!ev.clipboardData || inField(ev)) return;
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  if (selection.isCollapsed) { copyValueAtCaret(ev, selection); return; }
  if (copyFragment(ev, selection.getRangeAt(0))) return;

  let anchor = selection.anchorNode;
  anchor = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentNode);
  if (!anchor || !anchor.closest) return;
  if (copyMaskedPanel(ev, selection, anchor)) return;

  /* The raw view is plain text, not rows: mask the selected lines. */
  if (Mask.on() && anchor.closest('.raw') && ev.clipboardData) {
    ev.clipboardData.setData('text/plain', maskJsonText(selection.toString()));
    ev.preventDefault();
    return;
  }

  const tree = anchor.closest(TREE_SELECTOR);
  if (!tree || !tree.querySelector('.row')) return;

  const allRows = [...tree.querySelectorAll('.row')];
  const depthOf = (row) => Number(row.dataset.depth) || 0;
  const isClosing = (row) => !row.querySelector(':scope > .k');
  const isOpening = (row) => {
    const preview = row.querySelector(':scope > .preview');
    return !!preview && /[{[]\s*$/.test(preview.textContent);
  };

  const picked = allRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => selection.containsNode(row, true));

  /* Comma between siblings, as in JSON: a line gets one when another line
   * follows it in the copy and the next row of the tree is a sibling (same
   * depth, not a closing brace) and this row doesn't open a branch. */
  const lines = picked.map(({ row, index }, position) => {
    const depth = depthOf(row);
    let text = '  '.repeat(depth) + cellText(row, depth === 0);
    const next = allRows[index + 1];
    const hasSiblingNext = next && depthOf(next) === depth && !isClosing(next);
    if (position < picked.length - 1 && hasSiblingNext && !isOpening(row)) text += ',';
    return text;
  });
  if (!lines.length || !ev.clipboardData) return;

  ev.clipboardData.setData('text/plain', lines.join('\n'));
  ev.preventDefault();
  warnIfPartial(tree, picked.length);
});
