'use strict';

/* A cheap fingerprint of a payload string, so the panel can ask the page "has
 * it changed?" without pulling megabytes across the devtools bridge.
 *
 * The page computes the same thing with its own copy of this function inside
 * hostFetch (src/ui/targets.js), which must stay self-contained. A test runs
 * the page function and checks both agree; change them together.
 *
 * Pure: FNV-1a over UTF-16 code units, 32-bit, plus the length. */

export function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/* "length:hash" in hex, e.g. "1a:4f2b9c11". */
export function payloadSignature(text) {
  return `${text.length.toString(16)}:${fnv1a32(text).toString(16)}`;
}
