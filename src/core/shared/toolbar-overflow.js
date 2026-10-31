'use strict';

/* Narrow toolbars: below this width the deeper-dive controls of every toolbar
 * (the ones marked data-overflow) move into one "…" menu, so the first screen
 * stays one row. This file decides when the panel counts as narrow and how a
 * moved control reads in the menu; the DOM work is in ui/toolbar-overflow.js.
 *
 * Pure: no DOM, no chrome.*. */

/* CSS pixels; the same figure as the narrow rules in panel.css. */
export const NARROW_BELOW = 600;

/* True for a measured width under the limit. 0, a negative or a missing width
 * means the panel has not been measured (not laid out yet, or a test), which
 * is not narrow. */
export function isNarrow(width) {
  return typeof width === 'number' && Number.isFinite(width) && width > 0 && width < NARROW_BELOW;
}

/* One line of the menu: a button is just its name; a switch or toggle also
 * says its state, since the control itself is out of sight. `state` is
 * undefined for a plain button, else true / false. */
export function overflowItemLabel(name, state) {
  const text = String(name || '').replace(/\s+/g, ' ').trim();
  if (state === undefined) return text;
  return `${text}: ${state ? 'on' : 'off'}`;
}
