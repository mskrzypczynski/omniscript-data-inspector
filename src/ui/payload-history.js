'use strict';

/* The last payloads read, kept once for the whole panel. Every tab that reads
 * the payload (the Data tab's reader, the step tracker) records here, so a
 * comparison, "Since step entry" and a call's Data changes work from any tab,
 * not only while the Data tab is the one polling.
 *
 * Always on, bounded (fewer and smaller than the old Advanced-only history,
 * since it now runs for everyone); the bookkeeping is core/shared/history.js. */

import { pushSnapshot } from '../core/shared/history.js';

export const MAX_SHARED_SNAPSHOTS = 12;
const MAX_SHARED_CHARS = 4000000;

let history = [];
/* While a debug bundle is loaded: the live history set aside, and the
 * bundle's own held in its place. Nothing is recorded or cleared meanwhile. */
let setAside = null;
const listeners = [];

function changed() {
  listeners.forEach((fn) => { try { fn(); } catch (error) { console.warn('Payload history listener failed', error); } });
}

export const PayloadHistory = {
  /* raw: the payload text; now: Date; step: { name, visitFrom } or null.
   * A repeat of the newest snapshot is ignored. */
  record(raw, now, step = null) {
    if (setAside) return false; // a loaded session is a fixed record
    const next = pushSnapshot(history, raw, now, { maxCount: MAX_SHARED_SNAPSHOTS, maxChars: MAX_SHARED_CHARS }, step);
    if (next === history) return false;
    history = next;
    changed();
    return true;
  },
  /* Oldest first: [{ raw, time, step? }]. */
  list: () => history,
  /* A new script, property or navigation: nothing to compare across. */
  clear() { if (!setAside) history = []; },
  /* A loaded session: the bundle's reads ([{ raw, time, step? }], oldest
   * first) replace the live ones, which come back with release(). Holding a
   * second bundle replaces the first one's. */
  hold(entries) {
    if (!setAside) setAside = { live: history };
    history = entries.slice();
    changed();
  },
  release() {
    if (!setAside) return;
    history = setAside.live;
    setAside = null;
    changed();
  },
  held: () => setAside !== null,
  onChange: (fn) => listeners.push(fn)
};
