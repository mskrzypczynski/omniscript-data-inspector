'use strict';

/* Whether a menu was opened with the mouse. A menu opened from the keyboard
 * puts its first item under focus (so Tab and Enter work at once); one opened
 * with the mouse leaves every item plain, or the first one looks picked before
 * anyone chose. Anything that does not say it was a mouse click counts as the
 * keyboard: a caller that hands over only a position gets the old behaviour.
 *
 * `ev` is an event, or { clientX, clientY, type, detail, button } copied from
 * one. A click from the keyboard has detail 0; a right-click has button 2.
 *
 * Pure: no DOM, no chrome.*. */
export function openedWithMouse(ev) {
  if (!ev || typeof ev !== 'object') return false;
  if (ev.type === 'click') return typeof ev.detail === 'number' && ev.detail > 0;
  if (ev.type === 'contextmenu') return ev.button === 2;
  return ev.type === 'mousedown' || ev.type === 'mouseup';
}
