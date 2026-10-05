'use strict';

/* What the Data tab does with each payload it reads, apart from drawing it:
 * parse it, note what changed since the last read, keep the marks and the
 * "was" values, and keep the history for comparing. The tab owns the state
 * object; these functions only change it.
 *
 * Pure: no DOM, no chrome.*, and no clock — callers pass `now`. */

import { changedPaths, branchesAbove, initialExpansion, valueAt } from './changes.js';
import { pushSnapshot } from './history.js';

/* How long a change stays flashed. Without this the amber and the dot on
 * collapsed branches lasted exactly one render — at a 500 ms poll they were
 * gone before you could look at them. */
export const HIGHLIGHT_MS = 3000;

/* Paths kept marked after the amber fades; a runaway payload must not grow it
 * without bound. */
export const MAX_TOUCHED = 5000;

/* Back to "nothing read yet" for the payload fields (not the view settings). */
export function resetPayload(state) {
  state.rawVersion = (state.rawVersion || 0) + 1;
  state.history = [];
  state.compareA = null;
  state.compareB = null;
  state.raw = null;
  state.data = undefined;
  state.parseError = null;
  state.seeded = false;
  state.stale = false;
  state.expanded = new Set(['']);
  state.expandedText = new Set();
  state.changed = new Set();
  state.changedBranch = new Set();
  state.touched = new Set();
  state.before = new Map();
  state.focus = null;
}

/* Forget what tracking collected (marks, "was" values, history, comparison
 * picks) while leaving the payload on screen. */
export function stopTracking(state) {
  state.history = [];
  state.compareA = null;
  state.compareB = null;
  state.touched = new Set();
  state.before = new Map();
  state.focus = null;
}

/* Tracking has just been switched on: what is on screen becomes the first
 * snapshot, so the next change has something to be compared with. */
export function startTracking(state, now) {
  if (state.raw !== null && state.raw !== undefined) state.history = pushSnapshot(state.history, state.raw, now);
}

/* The host answered with nothing: forget the payload, keep the marks. */
function clearPayload(state) {
  state.rawVersion = (state.rawVersion || 0) + 1;
  state.raw = null;
  state.data = undefined;
  state.parseError = null;
  state.changed.clear();
  state.changedBranch.clear();
  state.changedAt = 0;
}

/* Take one read (raw text, or null/undefined for none) into the state.
 * `track` says whether to keep what only the advanced controls use: the
 * history for comparing, the lasting marks and their "was" values. The brief
 * flash of a changed value is kept either way. */
export function applyPayload(state, raw, now, track = true) {
  if (raw === null || raw === undefined) { clearPayload(state); return; }

  if (raw === state.raw) {
    if (state.changedAt && now.getTime() - state.changedAt > HIGHLIGHT_MS) {
      state.changed.clear();
      state.changedBranch.clear();
      state.changedAt = 0;
    }
    return;
  }

  const previous = state.data;
  state.raw = raw;
  state.rawVersion = (state.rawVersion || 0) + 1; // lets callers tell "new payload" without comparing megabytes
  if (track) state.history = pushSnapshot(state.history, raw, now);

  try {
    state.data = JSON.parse(raw);
    state.parseError = null;
  } catch (e) {
    state.data = undefined;
    state.parseError = e.message;
  }

  state.changed = new Set();
  state.changedBranch = new Set();
  if (state.parseError === null && previous !== undefined) {
    state.changed = changedPaths(previous, state.data);
    state.changedBranch = branchesAbove(state.changed);
  }

  if (!state.seeded && state.data !== undefined) {
    initialExpansion(state.data).forEach((path) => state.expanded.add(path));
    state.seeded = true;
  }

  state.lastUpdate = now;
  state.changedAt = state.changed.size ? now.getTime() : 0;

  if (!track) return;
  state.changed.forEach((path) => {
    if (state.touched.size >= MAX_TOUCHED) return;
    state.touched.add(path);
    /* Keep the value from before the first change: that is what "was" means
     * for a mark, however many times it changes afterwards. */
    if (!state.before.has(path)) state.before.set(path, valueAt(previous, path));
  });
}
