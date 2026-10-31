'use strict';

/* The names of the Refresh rate setting (Settings, Data): how often the
 * Data tab reads the payload while Auto-refresh is on. What each name means in
 * milliseconds is core/data/poll-rate.js. */

export const REFRESH_RATES = Object.freeze(['fast', 'normal', 'gentle']);
export const DEFAULT_RATE = 'normal';

export const REFRESH_LABELS = Object.freeze({ fast: 'Fast', normal: 'Normal', gentle: 'Gentle' });
