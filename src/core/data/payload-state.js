'use strict';

/* What the Data tab does with each payload it reads, apart from drawing it:
 * parse it, note what changed since the last read, and keep the marks and the
 * "was" values. The tab owns the state object; these functions only change it.
 * The history for comparing is not here: it is panel-wide (ui/payload-history.js).
 *
 * Pure: no DOM, no chrome.*, and no clock — callers pass `now`. */

import { detectChanges, branchesAbove, initialExpansion } from './changes.js';
import { logEntries, appendLog } from '../shared/change-log.js';
import { followPins } from './pin-follow.js';
import { HIGHLIGHT_MS, flashProgress } from '../shared/flash.js';

/* Drop the transient flash once it has run out, without needing another read.
 * The lasting marks (touched, before) are not touched. True when it cleared. */
export function expireFlash(state, now, duration = HIGHLIGHT_MS) {
  if (!state.changedAt || flashProgress(state.changedAt, now, duration) !== null) return false;
  state.changed.clear();
  state.changedBranch.clear();
  state.changeInfo = null;
  state.changedAt = 0;
  return true;
}

/* Paths kept marked after the amber fades; a runaway payload must not grow it
 * without bound. */
const MAX_TOUCHED = 5000;

/* Back to "nothing read yet" for the payload fields (not the view settings). */
export function resetPayload(state) {
  state.rawVersion = (state.rawVersion || 0) + 1;
  /* Answers to reads sent before this point belong to another script or
   * property; the reader compares generations and drops them. */
  state.generation = (state.generation || 0) + 1;
  state.restart = false;
  state.lastUpdate = null;
  state.changedAt = 0;
  state.compareA = null;
  state.compareB = null;
  state.raw = null;
  state.data = undefined;
  state.lastData = undefined;
  state.parseError = null;
  state.seeded = false;
  state.stale = false;
  state.expanded = new Set(['']);
  state.expandedText = new Set();
  state.changed = new Set();
  state.changedBranch = new Set();
  state.changeInfo = null;
  state.touched = new Set();
  state.before = new Map();
  state.log = [];
  state.focus = null;
}

/* Forget what Track changes collected (the lasting marks, their "was" values
 * and the change log) while leaving the payload and the brief flash of a
 * changed value on screen: the flash is not tracking, it is always on. The
 * payload history is kept: it is shared and never depends on tracking. */
export function dropMarks(state) {
  state.touched = new Set();
  state.before = new Map();
  state.log = [];
  state.focus = null;
}

/* `step` may be the stamp itself or a function that makes it, so a caller can
 * skip the work on reads that change nothing. */
const resolve = (step) => (typeof step === 'function' ? step() : step) || null;

/* The page navigated: what is on screen stays (marked stale) but the next
 * payload read is a fresh start, never diffed against this one. */
export function markRestart(state) {
  state.restart = true;
}

/* A property that holds nothing, or only blanks, is "nothing there", not text
 * that failed to parse. */
export const isBlankPayload = (raw) => raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '');

/* The host answered with nothing: forget the payload, keep the marks. */
function clearPayload(state) {
  /* Already empty and drawn so: a poll that finds nothing again changes nothing.
   * The first answer still counts as a change, so the empty state gets drawn. */
  if (state.rawVersion && state.raw === null && state.data === undefined && state.parseError === null) return;
  state.rawVersion = (state.rawVersion || 0) + 1;
  state.raw = null;
  state.data = undefined;
  state.lastData = undefined;
  state.parseError = null;
  state.changed.clear();
  state.changedBranch.clear();
  state.changeInfo = null;
  state.changedAt = 0;
}

/* Take one read (raw text, or null/undefined for none) into the state.
 * `track` says whether to keep what only Track changes uses: the lasting marks
 * and their "was" values and the change log. The brief flash of a changed
 * value is kept either way (it is what makes a live script readable); only
 * `detect` false skips comparing the reads at all. `step` is the stamp of the
 * step the script is on ({ name, visitFrom }, step-stamp.js), or a function
 * that makes it; it is asked for only when the payload changed and a log entry
 * needs it. */
export function applyPayload(state, raw, now, track = true, step = null, detect = true) {
  if (isBlankPayload(raw)) { clearPayload(state); return; }

  const restart = !!state.restart;
  if (restart) {
    state.restart = false;
    state.compareA = null;
    state.compareB = null;
    state.touched = new Set();
    state.before = new Map();
    state.log = [];
    state.focus = null;
  } else if (raw === state.raw) {
    expireFlash(state, now.getTime());
    return;
  }

  /* A read that does not parse leaves no data, but the last good one is still
   * what the next good read changed from. */
  const previous = restart ? undefined : (state.data !== undefined ? state.data : state.lastData);
  state.lastData = restart ? undefined : state.lastData;
  state.raw = raw;
  state.rawVersion = (state.rawVersion || 0) + 1; // lets callers tell "new payload" without comparing megabytes

  try {
    state.data = JSON.parse(raw);
    state.lastData = state.data;
    state.parseError = null;
  } catch (e) {
    state.data = undefined;
    state.parseError = e.message;
  }

  state.changed = new Set();
  state.changedBranch = new Set();
  state.changeInfo = null;
  let found = null;
  if (state.parseError === null && previous !== undefined) {
    if (detect) {
      found = detectChanges(previous, state.data);
      state.changed = found.paths;
      state.changedBranch = branchesAbove(state.changed);
      state.changeInfo = { ...found.counts, truncated: found.truncated };
    }
    followWatched(state, previous);
  }

  if (!state.seeded && state.data !== undefined) {
    initialExpansion(state.data).forEach((path) => state.expanded.add(path));
    state.seeded = true;
  }

  state.lastUpdate = now;
  const anything = found && (state.changed.size || found.counts.rowsRemoved);
  state.changedAt = anything ? now.getTime() : 0;

  if (!track || !found) return;
  state.changed.forEach((path) => {
    if (state.touched.size >= MAX_TOUCHED) return;
    state.touched.add(path);
    /* Keep the value from before the first change: that is what "was" means
     * for a mark, however many times it changes afterwards. */
    if (!state.before.has(path)) state.before.set(path, found.before.get(path));
  });

  const stamp = resolve(step);
  const added = logEntries(found.entries, now, stamp, (state.logSeq || 0) + 1);
  state.logSeq = (state.logSeq || 0) + added.length;
  state.log = appendLog(state.log || [], added);
}

/* The watch list moves with its rows (pin-follow.js); the notify flags and the
 * remembered values go with the pins. */
function followWatched(state, previous) {
  if (!state.pins || !state.pins.length) return;
  const { pins, moved } = followPins(previous, state.data, state.pins);
  if (!moved.size) return;
  const rekey = (path) => (moved.has(path) ? moved.get(path) : path);
  state.pins = pins;
  if (state.notify) state.notify = new Set([...state.notify].map(rekey));
  if (state.watchPrev) {
    state.watchPrev = Object.fromEntries(Object.entries(state.watchPrev).map(([path, text]) => [rekey(path), text]));
  }
  state.watchStale = true; // the strip draws again on its next render
}
