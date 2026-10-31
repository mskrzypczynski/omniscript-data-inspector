'use strict';

/* Which row the c key copies. A row with keyboard focus is the one meant;
 * otherwise the one under the pointer; otherwise the row just jumped to, but
 * only while its flash shows: once the flash is over nothing marks that row, so
 * a copy must not quietly name it.
 *
 * Pure: no DOM, no chrome.*, and no clock (callers pass `now`).
 * focused, hovered, jumped: tree paths, or undefined / null when there is none;
 * jumpedAt: when the jump was made (ms). Returns { path, from } or null. */

import { flashProgress, JUMP_FLASH_MS } from '../shared/flash.js';

const given = (path) => path !== undefined && path !== null;

export function copyTarget({ focused, hovered, jumped, jumpedAt, now }) {
  if (given(focused)) return { path: focused, from: 'focus' };
  if (given(hovered)) return { path: hovered, from: 'pointer' };
  if (given(jumped) && flashProgress(jumpedAt, now, JUMP_FLASH_MS) !== null) return { path: jumped, from: 'jump' };
  return null;
}
