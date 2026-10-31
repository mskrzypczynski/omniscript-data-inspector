'use strict';

/* The panel's own chords: the ones that need Ctrl (or Cmd on a Mac). Pure:
 * the UI hands in the few fields of a keydown it needs and gets back what the
 * chord means, so what counts as the shortcut is tested without a DOM. The
 * single keys (/, h, 1-3, c, n ...) are in panel-shell.js. */

const hasCommand = (ev) => !!ev && (ev.ctrlKey === true || ev.metaKey === true);

/* Ctrl/Cmd+\ : hide or show the list pane of the tab on screen. Shift and Alt
 * make it a different chord, so they are not ours. `code` is the fallback for
 * keyboard layouts where the backslash is not what `key` reports. */
export function isFocusModeKey(ev) {
  if (!hasCommand(ev) || ev.altKey || ev.shiftKey) return false;
  return ev.key === '\\' || ev.code === 'Backslash';
}

/* Ctrl/Cmd + = (or +), - and 0: larger, smaller, back to the default size.
 * Shift is allowed for + because that is how most layouts type it. */
export function textSizeKey(ev) {
  if (!hasCommand(ev) || ev.altKey) return null;
  if (ev.key === '=' || ev.key === '+') return 'larger';
  if (ev.shiftKey) return null;
  if (ev.key === '-') return 'smaller';
  if (ev.key === '0') return 'reset';
  return null;
}

/* Ctrl/Cmd+Shift+L : open Compare JSON from anywhere in the panel. L because
 * the obvious J is DevTools' own (Ctrl+Shift+J opens the Console, and
 * Cmd+Shift+J is the browser's Downloads), and I, C, P, M, D, F and K are
 * taken as well. Alt makes it another chord. `code` is the fallback for
 * layouts where `key` is not the Latin letter. */
export function isCompareJsonKey(ev) {
  if (!hasCommand(ev) || ev.altKey || !ev.shiftKey) return false;
  return (typeof ev.key === 'string' && ev.key.toLowerCase() === 'l') || ev.code === 'KeyL';
}
