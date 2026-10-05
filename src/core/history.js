'use strict';

/* The last few payloads the Data tab has read, kept in memory so two of them
 * can be compared ("what changed when I clicked Next"). Bounded by count and
 * by total size: a script with a multi-megabyte payload must not pin twenty
 * copies of it.
 *
 * Pure: no DOM, no chrome.*. */

export const MAX_SNAPSHOTS = 20;
export const MAX_CHARS = 8000000;

/* A new array with the snapshot appended (when it differs from the newest) and
 * the oldest dropped until the limits hold. The newest is always kept. */
export function pushSnapshot(history, raw, time, limits = {}) {
  const maxCount = limits.maxCount || MAX_SNAPSHOTS;
  const maxChars = limits.maxChars || MAX_CHARS;
  if (typeof raw !== 'string') return history;
  if (history.length && history[history.length - 1].raw === raw) return history;

  const next = history.concat([{ raw, time }]);
  while (next.length > maxCount) next.shift();
  let total = next.reduce((sum, item) => sum + item.raw.length, 0);
  while (next.length > 1 && total > maxChars) total -= next.shift().raw.length;
  return next;
}
