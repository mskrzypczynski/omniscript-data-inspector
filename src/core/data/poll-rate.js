'use strict';

/* The Data tab's Refresh rate (Settings, Data): how often the payload is
 * read while the tab is live. `fast` is the period right after a change and
 * `slow` the longest the period stretches to while nothing changes
 * (poll-backoff.js does the stretching). Pure: the caller hands in the setting
 * and gets back milliseconds. */

import { DEFAULT_RATE } from '../shared/refresh-rate.js';

const INTERVALS = Object.freeze({
  fast: Object.freeze({ fast: 500, slow: 2000 }),
  normal: Object.freeze({ fast: 1000, slow: 4000 }),
  gentle: Object.freeze({ fast: 3000, slow: 8000 })
});

/* A value that is not one of the three (an old version's, or edited by hand)
 * reads as the default. */
export function pollIntervals(rate) {
  const found = Object.prototype.hasOwnProperty.call(INTERVALS, rate) ? INTERVALS[rate] : INTERVALS[DEFAULT_RATE];
  return { ...found };
}
