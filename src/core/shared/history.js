'use strict';

/* The last few payloads the Data tab has read, kept in memory so two of them
 * can be compared ("what changed when I clicked Next"). Bounded by count and
 * by total size: a script with a multi-megabyte payload must not pin twenty
 * copies of it.
 *
 * Pure: no DOM, no chrome.*. */

const MAX_SNAPSHOTS = 20;
export const MAX_CHARS = 8000000;

/* A new array with the snapshot appended (when it differs from the newest) and
 * the oldest dropped until the limits hold. The newest is always kept. `step`
 * ({ name, visitFrom }, see step-stamp.js) records which step the script was on
 * when it was read; the caller passes it in so this stays pure. */
export function pushSnapshot(history, raw, time, limits = {}, step = null) {
  const maxCount = limits.maxCount || MAX_SNAPSHOTS;
  const maxChars = limits.maxChars || MAX_CHARS;
  if (typeof raw !== 'string') return history;
  if (history.length && history[history.length - 1].raw === raw) return history;

  const next = history.concat([step ? { raw, time, step } : { raw, time }]);
  while (next.length > maxCount) next.shift();
  let total = next.reduce((sum, item) => sum + item.raw.length, 0);
  while (next.length > 1 && total > maxChars) total -= next.shift().raw.length;
  return next;
}

/* ------------------------------------------------ snapshots from files */

/* Files the user loads to compare against. They live beside the history, not
 * in it, so the live reads (and the 20-entry cap) can never push one out. */
const MAX_IMPORTED = 5;

/* True when the text parses as JSON. */
export function isJsonText(text) {
  if (typeof text !== 'string') return false;
  try { JSON.parse(text); return true; } catch { return false; }
}

/* A new array with the file appended as a snapshot labelled `file: <name>`;
 * the oldest file goes when there are more than the limit. Text that is not a
 * string, not valid JSON or larger than the size limit adds nothing. */
export function addImported(imported, name, raw, time, limits = {}) {
  const maxCount = limits.maxCount || MAX_IMPORTED;
  const maxChars = limits.maxChars || MAX_CHARS;
  if (!isJsonText(raw) || raw.length > maxChars) return imported;
  const next = imported.concat([{ raw, time, label: `file: ${name || 'untitled.json'}` }]);
  while (next.length > maxCount) next.shift();
  return next;
}

/* What the pickers offer: the live reads, then the loaded files. */
export function snapshotChoices(history, imported) {
  return history.concat(imported);
}

/* The default From and To: the last two live reads; with fewer, the newest
 * loaded file stands in for the missing one. */
export function defaultPair(history, imported) {
  const newest = history[history.length - 1];
  if (history.length >= 2) return [history[history.length - 2], newest];
  if (newest && imported.length) return [imported[imported.length - 1], newest];
  if (imported.length >= 2) return [imported[imported.length - 2], imported[imported.length - 1]];
  return [undefined, newest];
}
