'use strict';

/* A brief message in the corner, for feedback on actions with no button to
 * change (keyboard shortcuts, the right-click menu). */

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
  timer = setTimeout(() => { node.remove(); }, 1400);
}
