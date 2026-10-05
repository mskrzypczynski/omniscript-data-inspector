'use strict';

/* Copying a selection out of a tree or the raw view. The tree lays each node
 * out as inline spans, so a raw browser copy of several rows comes out as
 * "key", ":", "value" in pieces; this rebuilds the selection as clean JSON-shaped
 * text, and applies Mask values to it. Registers one document-level handler
 * when imported. */

import { MASK_STRING, MASK_NUMBER, maskJsonText } from '../core/mask.js';
import { Mask } from './mask-setting.js';

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

document.addEventListener('copy', (ev) => {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  let anchor = selection.anchorNode;
  anchor = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentNode);
  if (!anchor || !anchor.closest) return;

  /* The raw view is plain text, not rows: mask the selected lines. */
  if (Mask.on() && anchor.closest('.raw') && ev.clipboardData) {
    ev.clipboardData.setData('text/plain', maskJsonText(selection.toString()));
    ev.preventDefault();
    return;
  }

  const tree = anchor.closest('.viewport, .detail-body, .log-detail');
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
});
