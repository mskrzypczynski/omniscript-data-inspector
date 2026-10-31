'use strict';

/* A loaded session, seen from Calls: a debug bundle's calls take the
 * list's place while the file is open, and the live list is put back, as it
 * was, when it is closed. The holder of the bundle is ../session.js; the shell
 * locks the page-reading controls (../session-mode.js). */

import { Session } from '../session.js';
import { bundleCallRows, recordsFromExport } from '../../core/actions/actions-import.js';
import { sessionVisits } from '../../core/shared/session-bundle.js';

/* What belongs to the list of calls on screen, and so is set aside while a
 * loaded session takes its place and put back when it goes. */
export function blankView() {
  return {
    recording: true,
    compareId: null, // the baseline call the selected one is compared against
    compareHow: 'picked', // how it was chosen: 'previous', 'success' or 'picked'
    entries: [],
    selectedId: null, // a call's id, or a chain's (a string)
    openErrors: new Set(), // ids of calls whose failure message is shown in full
    debugOpen: new Map(), // call id -> what its Debug tab has open (core debug-run blankOpen)
    marked: new Set(), // ids of the calls ticked for the summary and Export
    markAnchor: null, // the call last ticked, where a Shift-click range starts
    detailTab: 'input',
    detailTabPicked: false, // the user chose a tab, so a failed call does not open on Output
    detailFilter: '',
    expanded: { input: new Set(['']), output: new Set(['']), options: new Set(['']) },
    expandedText: { input: new Set(), output: new Set(), options: new Set() },
    filterOpen: {}, // while the detail filter is on: tab -> Map(path -> open), the user's own toggles
    expandedChains: new Set(), // ids of the chains whose hops are showing
    dropped: false, // calls were dropped to stay within the caps (core actions-capture.js)
    droppedOmni: false, // ...and some of them were OmniStudio's
    testDraft: null, // the open Test call form (src/ui/actions/test-pane.js), or null
    rawFor: null, // the id of the call whose Raw view takes the detail pane, or null
    testDrafts: new Map(), // the edits of closed re-run forms, by the call they re-run (kept for the life of the tab)
    hiddenSent: null // id of a call the panel sent that a filter keeps out of the list, for the line that says so
  };
}

function pickView(state) {
  const view = {};
  Object.keys(blankView()).forEach((key) => { view[key] = state[key]; });
  return view;
}

/* state: the tab's state. repaint(): everything that shows the swapped list
 * (the record and clear buttons, the selection bar, the detail pane, the list). */
export function createSessionView({ state, repaint }) {
  /* The live list while a loaded session is shown; null otherwise. */
  let setAside = null;

  /* A debug bundle was loaded or cleared (the top bar's Open bundle and Back
   * to live). The bundle's calls take the list's place, with nothing captured
   * meanwhile; clearing it brings the live list back as it was, the selection,
   * ticks, open chains and recording switch included. */
  function onSession(bundle) {
    if (bundle) {
      // Opening a second file replaces the first one; the live list stays set aside.
      if (!state.session) setAside = pickView(state);
      Object.assign(state, blankView(), { recording: false });
      state.entries = recordsFromExport(bundleCallRows(bundle));
      // The steps the file's calls were made on come from the file, not the live script.
      state.session = { name: Session.name(), visits: sessionVisits(bundle) };
    } else {
      if (!state.session) return;
      Object.assign(state, setAside);
      setAside = null;
      state.session = null;
    }
    repaint();
  }

  /* The page navigated and the log is not preserved: the file stays; the live
   * list behind it starts over, as it would have. */
  function restartAside() {
    setAside = { ...blankView(), recording: setAside.recording };
  }

  return { onSession, restartAside };
}
