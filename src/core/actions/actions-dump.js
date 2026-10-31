'use strict';

/* What the Calls tab contributes to the debug bundle: its settings
 * and selection, the captured calls the way Export writes them (plus their
 * ids, so the selection can be matched), and why any call is counted as
 * failed. A plain object; the caller hands it to Shared.setDump.
 *
 * Org data goes through `mask` (identity while Mask values is off): inputs,
 * options, outputs, failure texts and the value of an in: search. The names
 * and structure of the script, ids, times and statuses are not data. The raw
 * text of an undecodable answer cannot be masked, so it is left out while
 * `masked` is true.
 *
 * Pure: no DOM, no chrome.*. */

import { exportEntries, failureReason, RAW_LIMIT } from '../shared/actions-model.js';
import { recentCalls } from '../shared/debug-bundle.js';
import { chainIndex } from './actions-chains.js';

/* in:text searches what the calls carried, so the text is a value. */
const IN_TERM = /(^|\s)(in:)("([^"]*)"|\S*)/gi;

/* The filter box text with the value of every in: term masked. */
export function filterTextForDump(text, mask) {
  return String(text || '').replace(IN_TERM, (all, lead, prefix, raw, quoted) => {
    const value = quoted !== undefined ? quoted : raw;
    if (!value) return all;
    const shown = String(mask(value));
    return `${lead}${prefix}${/\s/.test(shown) ? `"${shown}"` : shown}`;
  });
}

/* snapshot: { recording, clearOnReload, onlyOmni, errorsOnly, slowMs, filter,
 * selectedId, compareId, marked (an iterable of ids), entries, chains? (core
 * groupChains, so each call names the chain it belongs to) }. Only the newest
 * MAX_BUNDLE_CALLS calls that pass onlyOmni are dumped. */
export function actionsDump(snapshot, mask = (value) => value, masked = false) {
  // The same calls the bundle's own list keeps, so the tab's copy never holds
  // more than bundle.calls (the loader prefers this one).
  const entries = recentCalls(snapshot.entries || [], !!snapshot.onlyOmni);
  const exported = exportEntries(entries, mask);
  const chainOf = chainIndex(snapshot.chains || []);
  return {
    recording: !!snapshot.recording,
    clearOnReload: !!snapshot.clearOnReload,
    filters: {
      onlyOmni: !!snapshot.onlyOmni,
      errorsOnly: !!snapshot.errorsOnly,
      slowMs: snapshot.slowMs || 0,
      text: filterTextForDump(snapshot.filter, mask)
    },
    selectedId: snapshot.selectedId === undefined ? null : snapshot.selectedId,
    compareId: snapshot.compareId === undefined ? null : snapshot.compareId,
    marked: [...(snapshot.marked || [])],
    entries: exported.map((row, index) => {
      const entry = entries[index];
      const out = { id: entry.id, ...row };
      if (chainOf.has(entry.id)) out.chainId = chainOf.get(entry.id).id;
      if (!masked && typeof entry.rawResponse === 'string' && entry.responseProblem) {
        out.rawResponse = entry.rawResponse.slice(0, RAW_LIMIT);
      }
      return out;
    }),
    problems: entries.map((entry) => ({
      id: entry.id,
      responseProblem: entry.responseProblem || null,
      failure: failureReason(entry, true, mask)
    }))
  };
}
