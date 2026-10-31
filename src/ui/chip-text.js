'use strict';

/* Draws a text that names controls as [[Rescan]] with the names as small
 * button-like chips (see core/shared/chips.js for the mark). A chip is only
 * a drawing of the name: it is not a control and cannot be focused, and a
 * screen reader reads it as the plain word. */

import { chipSegments } from '../core/shared/chips.js';

export function chipNode(label) {
  const node = document.createElement('span');
  node.className = 'ctl-chip';
  node.textContent = label;
  return node;
}

/* Adds `text` to `parent`, the marks as chips and the rest as text. */
export function appendMarked(parent, text) {
  chipSegments(text).forEach((piece) => {
    parent.appendChild(piece.chip !== undefined ? chipNode(piece.chip) : document.createTextNode(piece.text));
  });
  return parent;
}

/* Replaces what `parent` holds with `text`. */
export function setMarked(parent, text) {
  parent.textContent = '';
  return appendMarked(parent, text);
}
