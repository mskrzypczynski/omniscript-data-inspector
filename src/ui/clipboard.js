'use strict';

/* Putting text on the clipboard: the async API first, then the execCommand
 * route where that is refused (it needs the panel to have focus). Every copy in
 * the panel goes through here, so a refusal is handled the same way
 * everywhere. */

import { toast } from './toast.js';

/* Resolves once the text is on the clipboard, rejects when neither route
 * worked. */
export function writeClipboard(text) {
  const fallback = () => new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* refused */ }
    area.remove();
    if (ok) resolve(); else reject(new Error('clipboard unavailable'));
  });
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(fallback);
  }
  return fallback();
}

/* Copy and say so in a toast, for actions with no button to change. */
export function copyWithToast(text, what = 'Copied') {
  if (!text) return;
  writeClipboard(text).then(() => toast(what), () => toast('Could not copy'));
}

/* Copy and flash the button's label for a moment. */
export function copyWithButton(text, button, restore, message = 'Copied') {
  if (!text) return;
  writeClipboard(text).then(() => {
    button.textContent = message;
    setTimeout(() => { button.textContent = restore; }, 1200);
  }, () => toast('Could not copy'));
}
