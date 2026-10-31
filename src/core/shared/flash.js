'use strict';

/* How long a changed value stays flashed, and how far into the flash a redraw is.
 * Data's tree and Structure's value cells share one fade (see --flash-duration in
 * panel.css).
 *
 * Pure: no DOM, no chrome.*, and no clock — callers pass `now`. */

/* How long a change stays flashed. Without this the amber and the dot on
 * collapsed branches lasted exactly one render — at a 500 ms poll they were
 * gone before you could look at them. */
export const HIGHLIGHT_MS = 3000;

/* How long the row of a jump (Show in Data, a watched value, Prev / Next
 * change) stays flashed. The CSS animation of .row.is-jumped runs as long. */
export const JUMP_FLASH_MS = 1800;

/* How far into the flash a redraw at `now` is: milliseconds elapsed while it
 * is still running, or null once it is over (or there was none). The flash is
 * an event of the read that changed the value, so a redraw must continue it
 * (negative animation-delay) or leave it out, never start it again. */
export function flashProgress(changedAt, now, duration = HIGHLIGHT_MS) {
  if (!changedAt) return null;
  const elapsed = now - changedAt;
  if (elapsed < 0) return 0;
  return elapsed < duration ? elapsed : null;
}
