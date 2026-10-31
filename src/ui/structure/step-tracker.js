'use strict';

/* The step tracker: a poller that runs while the DevTools panel is on screen,
 * whichever tab is open. It reads the payload and, riding on the same round
 * trip, the definition's asIndex, so the Data tab's reads are reused when they
 * are moments old. That keeps the visits behind "Time on this step" right even
 * when the user is on Data or Calls: a step change is dated when it
 * happens, not when the Structure tab is next opened.
 *
 * Limitation: it only sees what happens while the panel is open and visible.
 * With the panel closed, or another DevTools panel in front, nothing is
 * polled, and a move made then is dated from the next look. */

import { Targets } from '../targets.js';
import { Shared } from '../shared.js';
import { PayloadHistory } from '../payload-history.js';
import { createPoller } from '../util.js';

const TRACK_MS = 2000;
/* A read this young is reused instead of asking the page again. */
const SHARED_READ_MS = 1500;

/* state: the tab's state (visible, active, dataProp, defProp, dataRaw, activeIndex, elements).
 * deps: applyData(raw) takes new payload text (called only while the Structure
 * tab is on screen), moved(index) the new asIndex, stamp() the step the script
 * is on ({ name, visitFrom }, or null), tick(done, read) is told after every
 * read ({ raw, error } as the page answered) and calls done when it is
 * finished with the tick.
 *
 * Every payload it reads also goes into the panel-wide PayloadHistory, so a
 * comparison works from any tab and not only while the Data tab polls. */
export function createStepTracker({ state, applyData, moved, stamp = () => null, tick }) {
  let ensured = false;

  function task(done) {
    if (!Targets.selected()) { done(); return; }

    /* The tracker needs the elements to know which step an index means. */
    if (!ensured && !state.elements.length) {
      ensured = true;
      Shared.ensureElements(() => {});
    }

    Targets.fetch(state.dataProp, (raw, error, index) => {
      if (state.active && !error && raw !== state.dataRaw) applyData(raw);
      /* A failed read keeps the last known position instead of wiping the marks. */
      if (typeof index === 'number' && index !== state.activeIndex) moved(index);
      /* After the move, so a payload read as the script changes step is stamped with the new one. */
      if (!error && typeof raw === 'string' && raw) PayloadHistory.record(raw, new Date(), stamp());
      tick(done, { raw, error });
    }, { maxAge: SHARED_READ_MS, peek: { prop: state.defProp, field: 'asIndex' } });
  }

  return createPoller({ ms: TRACK_MS, canRun: () => state.visible, task });
}
