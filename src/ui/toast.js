'use strict';

/* A brief message in the corner, for feedback on actions with no button to
 * change (keyboard shortcuts, the right-click menu). It stays longer the
 * longer the text is, so a sentence can be read. */

import { toastDuration } from '../core/shared/toast-timing.js';

let node = null;
let timer = null;

export function toast(text) {
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('role', 'status');
  }
  node.textContent = text;
  document.body.appendChild(node);
  clearTimeout(timer);
  timer = setTimeout(() => { node.remove(); }, toastDuration(text));
}
