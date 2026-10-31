'use strict';

/* The Calls status bar as plain text, so the wording can be tested
 * without a DOM. Pure: the caller adds the loaded file's name and draws it.
 *
 * snapshot: {
 *   shown, total (calls in the list / captured), chains, failed (of the shown calls), session (a file is loaded),
 *   recording, dropped, droppedOmni, maxEntries,
 *   filters: { onlyOmni (All Apex calls is off), errorsOnly, query, slowMs, clearOnReload }
 * }
 * Returns { left, right }:
 *   left   "5 calls of 8 captured · 1 failed · 2 chains" (failed only when there is one);
 *   right  "Recording" or "Paused" (a file: "Not capturing"), then only what differs from the
 *          defaults: "all Apex calls", "clears on reload", "failed only", "slow: 800 ms", "text: foo". */

import { activeFilterLabels, countText } from '../shared/actions-model.js';

export function actionsStatus(s) {
  const calls = countText(s.shown, 'call') +
    (s.total !== s.shown ? ` of ${s.total} ${s.session ? 'in the file' : 'captured'}` : '');
  const left = [calls];
  if (s.failed) left.push(`${s.failed} failed`);
  if (s.chains) left.push(countText(s.chains, 'chain'));

  /* A file captures nothing, so whether the log clears on reload says nothing there. */
  const labels = activeFilterLabels({ ...s.filters, clearOnReload: !s.session && !!s.filters.clearOnReload });
  const right = [s.session ? 'Not capturing' : (s.recording ? 'Recording' : 'Paused'), ...labels];
  if (!s.session && s.dropped && (s.droppedOmni || !s.filters.onlyOmni)) {
    right.push(`oldest calls dropped (the last ${s.maxEntries} are kept)`);
  }
  return { left: left.join(' · '), right: right.join(' · ') };
}
