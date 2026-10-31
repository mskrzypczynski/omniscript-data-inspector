'use strict';

/* How long to wait before the next background read. A payload that keeps
 * coming back unchanged is read less and less often; any change, or the user
 * touching the panel, drops the streak and with it the delay.
 *
 * Pure: the caller keeps the streak. */

export const BASE_MS = 1000;
export const MAX_MS = 4000;
const GRACE_POLLS = 5; // stay at the base rate this many unchanged reads
const STEP_MS = 500;

export function pollDelay(unchangedStreak, base = BASE_MS, max = MAX_MS) {
  const over = Math.max(0, unchangedStreak - GRACE_POLLS + 1);
  return Math.min(max, base + over * STEP_MS);
}
