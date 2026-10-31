'use strict';

/* How long a toast stays: long enough to read it. A short "Copied" is gone in
 * about a second and a half; a sentence of 100 characters stays for five.
 *
 * Pure: no DOM, no chrome.*. */

const BASE_MS = 1400;
const PER_CHARACTER_MS = 40;
const MAX_MS = 6000;

export function toastDuration(text) {
  const length = typeof text === 'string' ? text.length : 0;
  return Math.min(MAX_MS, BASE_MS + length * PER_CHARACTER_MS);
}
