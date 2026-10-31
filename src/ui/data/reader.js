'use strict';

/* The Data tab's read loop: ask the selected host for its payload, apply it,
 * redraw only when something on screen changed, and schedule the next read.
 * Polling runs only while the tab is live, active and visible, and never
 * while a debug bundle is loaded (the file does not change); a manual refresh
 * is always honoured. */

import { Targets } from '../targets.js';
import { applyPayload, isBlankPayload } from '../../core/data/payload-state.js';
import { createPoller } from '../util.js';
import { pollDelay } from '../../core/data/poll-backoff.js';
import { pollIntervals } from '../../core/data/poll-rate.js';
import { Settings } from '../settings.js';
import { scriptIdentity, sameScript } from '../../core/shared/script-identity.js';
import { stepStamp } from '../../core/shared/step-stamp.js';
import { Shared } from '../shared.js';
import { PayloadHistory } from '../payload-history.js';
import { Session } from '../session.js';

/* The poll period starts at the Refresh rate's fast period and stretches while
 * the payload stays unchanged, up to its slow one (core/data/poll-rate.js and
 * poll-backoff.js); manual mode turns polling off instead. The setting is read
 * at every tick, so a change in Settings takes effect on the next one. */
function nextDelay(streak) {
  const { fast, slow } = pollIntervals(Settings.get('refreshRate'));
  return pollDelay(streak, fast, slow);
}

/* deps: { render, renderStatus } — redraw callbacks owned by the tab. */
export function createReader(state, { render, renderStatus }) {
  let unchangedStreak = 0;
  let busy = false;

  /* What the tree on screen depends on. A poll that leaves it unchanged must
   * not rebuild the DOM: that drops focus and hover from the copy buttons. */
  function viewSignature() {
    return [state.rawVersion, state.changed.size, state.touched.size, state.stale, state.scanError,
      !!Targets.selected()].join('\u0000');
  }

  function refreshView(before) {
    if (viewSignature() === before) renderStatus(); else render();
  }

  /* The host went away (navigation, the script finished). Keep what was last
   * read instead of blanking the view; it is replaced as soon as a host
   * answers again. */
  function markStale() {
    if (state.raw === null) { apply(null); return; }
    state.stale = true;
  }

  function apply(raw) {
    const now = new Date();
    /* A page that navigated starts a fresh payload: nothing before it is
     * worth comparing with. */
    if (state.restart && typeof raw === 'string') PayloadHistory.clear();
    /* A changed value always flashes. Marks, "was" values and the change log
     * are what Track changes keeps, so they are collected only while it is on. */
    applyPayload(state, raw, now, state.trackChanges, () => stepStamp(Shared.step()));
    /* Every read goes into the panel-wide history, tracking or not, so a
     * comparison or a call's data changes always has something to go by. The
     * step is asked for only when the payload is new. */
    const newest = PayloadHistory.list().at(-1);
    if (!isBlankPayload(raw) && (!newest || newest.raw !== raw)) {
      PayloadHistory.record(raw, now, stepStamp(Shared.step()));
    }
  }

  let forceFull = false;

  function readOnce(done) {
    state.hasRead = true;
    busy = true;
    const before = viewSignature();
    const finish = () => {
      busy = false;
      /* Unchanged means the same raw text and the same state of the view; a
       * stale or error read counts as a change so recovery is noticed fast. */
      unchangedStreak = viewSignature() === before && !state.stale && !state.scanError ? unchangedStreak + 1 : 0;
      done();
    };

    if (!Targets.selected()) {
      markStale();
      refreshView(before);
      finish();
      return;
    }

    /* The answer arrives later. If the user picked another script or property
     * in between (or the payload was reset for any reason), it belongs to the
     * old one and must not be applied to the new. */
    const generation = state.generation || 0;
    const asked = scriptIdentity(Targets.selected());
    const prop = state.prop;
    const stale = () => (state.generation || 0) !== generation || state.prop !== prop ||
      !sameScript(asked, scriptIdentity(Targets.selected()));

    const opts = forceFull ? { full: true } : {};
    forceFull = false;
    Targets.fetch(state.prop, (value, error) => {
      if (stale()) { busy = false; done(); return; }
      if (error) {
        state.scanError = error.value || error.description || error.error || 'The page could not be read.';
        refreshView(before);
        finish();
        return;
      }
      state.scanError = null;
      if (value === null || value === undefined) {
        markStale();
      } else {
        state.stale = false;
        apply(value);
      }
      refreshView(before);
      finish();
    }, opts);
  }

  const poller = createPoller({
    ms: () => nextDelay(unchangedStreak),
    canRun: () => state.live && state.active && state.visible && !Session.active(),
    task: readOnce
  });

  /* A new Refresh rate brings the pending tick forward or back to the new
   * period; a read in flight schedules its own next one. */
  Settings.onReset((scope) => {
    if (Settings.inScope(scope, 'refreshRate') && !busy) poller.start();
  });

  /* Any touch of the panel snaps the period back to the base rate, and a
   * pending slow tick is brought forward. */
  function onInteraction() {
    if (!unchangedStreak) return;
    unchangedStreak = 0;
    if (!busy) poller.start();
  }
  ['pointerdown', 'keydown', 'wheel'].forEach((type) =>
    document.addEventListener(type, onInteraction, { capture: true, passive: true }));

  /* Background events (a rescan found something new, the tab was shown, the
   * panel came back on screen) read only when live; in manual mode only the
   * very first read happens by itself. Everything else waits for the user. */
  function readInBackground() {
    /* A hidden panel reads nothing; setVisible(true) reads again. */
    if (!state.visible) return;
    if (state.live || !state.hasRead) { poller.now(); return; }
    /* Manual mode reads nothing, but a script that is gone is still worth
     * saying: the payload on screen is now the last one read. */
    if (!Targets.selected() && state.raw !== null && !state.stale) {
      const before = viewSignature();
      state.stale = true;
      refreshView(before);
      return;
    }
    renderStatus();
  }

  /* The Refresh button: read the whole string, never an "unchanged" answer. */
  function readFull() {
    forceFull = true;
    poller.now();
  }

  return { read: poller.now, readFull, readInBackground, stop: poller.stop };
}
