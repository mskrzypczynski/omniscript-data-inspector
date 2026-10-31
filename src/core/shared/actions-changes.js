'use strict';

/* "Data changes" of a call: what the script's payload looked like just before
 * the call ended and what it looked like just after, taken from the snapshots
 * the panel keeps of every payload it reads.
 *
 * The snapshots are distinct reads (a read equal to the newest is not kept), so
 * "no snapshot within the window" means the payload did not change in it, or
 * was not read.
 *
 * Pure: no DOM, no chrome.*. */

import { diffValues } from './diff.js';

/* How long after a call ends a payload read still counts as its effect. */
export const CHANGE_WINDOW_MS = 5000;

/* A read this much older than the end of the call no longer says what the
 * payload looked like going in. */
export const STALE_BEFORE_MS = 30000;

const msOf = (time) => (time instanceof Date ? time.getTime() : Number(time));

/* When the call was over: its start plus its round trip. */
export function callEndMs(entry) {
  const duration = typeof entry.duration === 'number' && Number.isFinite(entry.duration) ? entry.duration : 0;
  return msOf(entry.time) + duration;
}

/* The snapshots that bracket a call that ended at endMs:
 *   before  the last one taken at or before endMs
 *   after   the first one taken after endMs and within windowMs of it
 * Either is null when there is none. History is oldest first, but nothing here
 * depends on it. */
export function snapshotsAroundCall(history, endMs, windowMs = CHANGE_WINDOW_MS) {
  let before = null;
  let after = null;
  let beforeAt = -Infinity;
  let afterAt = Infinity;
  (history || []).forEach((snapshot) => {
    const at = msOf(snapshot.time);
    if (Number.isNaN(at)) return;
    if (at <= endMs) {
      if (at >= beforeAt) { before = snapshot; beforeAt = at; }
    } else if (at <= endMs + windowMs && at < afterAt) {
      after = snapshot;
      afterAt = at;
    }
  });
  return { before, after };
}

function parse(snapshot) {
  try { return { value: JSON.parse(snapshot.raw) }; } catch { return null; }
}

/* What the Data changes tab shows for a call. status is one of
 *   'no-history'  no snapshots at all (the payload has not been read yet)
 *   'no-after'    nothing was read within the window after the call
 *   'not-polling' nothing was read within the window and the last read before
 *                 the call is older than the window too: the panel was not
 *                 reading the payload when the call finished
 *   'no-before'   the history starts after the call (or the older reads were
 *                 dropped), so there is nothing to compare against
 *   'unreadable'  one of the two reads is not valid JSON
 *   'ok'          { before, after, gapMs, beforeAgeMs, staleBefore, changes,
 *                 truncated }; staleBefore says the read before the call is
 *                 older than STALE_BEFORE_MS, so it may not be what the
 *                 payload looked like just before. */
export function dataChangesForCall(history, entry, windowMs = CHANGE_WINDOW_MS) {
  if (!history || !history.length) return { status: 'no-history' };
  const endMs = callEndMs(entry);
  const { before, after } = snapshotsAroundCall(history, endMs, windowMs);
  if (!after) {
    const idle = !before || endMs - msOf(before.time) > windowMs;
    return { status: idle ? 'not-polling' : 'no-after' };
  }
  if (!before) return { status: 'no-before' };

  const a = parse(before);
  const b = parse(after);
  if (!a || !b) return { status: 'unreadable' };
  return {
    status: 'ok',
    before,
    after,
    gapMs: msOf(after.time) - endMs,
    beforeAgeMs: endMs - msOf(before.time),
    staleBefore: endMs - msOf(before.time) > STALE_BEFORE_MS,
    ...diffValues(a.value, b.value)
  };
}
