'use strict';

/* Which browser the toolbar popup is running in, so it can name the DevTools
 * tab the way that browser does (Elements next to the panel in Chrome, Edge and
 * the other Chromium browsers; Inspector in Firefox). The popup page starts as
 * the Chromium text, so a browser this does not recognise still gets steps
 * that are right for most people.
 *
 * Pure: the caller reads navigator and location and passes them in. */

export const BROWSERS = Object.freeze(['chromium', 'firefox']);

/* An extension page in Firefox lives at moz-extension://, which is the surest
 * sign; the user agent says Firefox in the browsers built on it too (Zen,
 * LibreWolf, Floorp). */
export function detectBrowser({ userAgent = '', protocol = '' } = {}) {
  if (protocol === 'moz-extension:') return 'firefox';
  return /\bFirefox\/\d/i.test(String(userAgent)) ? 'firefox' : 'chromium';
}
