'use strict';

/* Where a slow call's time went, in a sentence: the breakdown the Took
 * tooltip lists, said plainly in the detail head of a call that is slow.
 *
 * Pure: no DOM, no chrome.*. */

import { formatTime } from '../shared/time-format.js';
import { DEFAULT_SLOW_MS } from '../shared/actions-timing.js';

export { DEFAULT_SLOW_MS };

const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/* The threshold in force: the slow-call threshold setting, or the default at 0. */
export function slowThreshold(slowMs) {
  return typeof slowMs === 'number' && slowMs > 0 ? slowMs : DEFAULT_SLOW_MS;
}

/* Slower than the threshold the way the list marks it: at least that long. */
export function isSlow(entry, slowMs) {
  return !!entry && typeof entry.duration === 'number' && entry.duration >= slowThreshold(slowMs);
}

/* "Waited 1,840 ms for the server, received in 20 ms" for a slow call whose
 * timings say how long it waited and received; null otherwise (a fast call, no
 * duration, no timings, as in a call loaded from a file). format is the Time
 * format setting. */
export function timingWords(entry, { slowMs, format } = {}) {
  if (!isSlow(entry, slowMs) || !entry.timings) return null;
  const { wait, receive } = entry.timings;
  const time = (ms) => formatTime(ms, format);
  if (known(wait) && known(receive)) return `Waited ${time(wait)} for the server, received in ${time(receive)}`;
  if (known(wait)) return `Waited ${time(wait)} for the server`;
  if (known(receive)) return `Received in ${time(receive)}`;
  return null;
}
