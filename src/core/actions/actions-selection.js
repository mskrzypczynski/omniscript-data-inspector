'use strict';

/* Marking several calls and adding up their run time: what the summary bar
 * says and draws, which calls a Shift-click covers, and what the header
 * checkbox shows.
 *
 * Pure: no DOM, no chrome.*. */

import { KIND_LABEL, maskedName } from '../shared/actions-model.js';
import { formatTime } from '../shared/time-format.js';
import { oversizedCount, oversizedText } from './input-size.js';

// Kept importable from here, where they first lived.
export { formatMs, formatDuration, formatTime } from '../shared/time-format.js';

const known = (duration) => typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
const startOf = (entry) => (entry.time instanceof Date ? entry.time.getTime() : NaN);

/* Calls that travelled in one request share its duration, so time is added up
 * per request: the first call of each requestId stands for the request. A call
 * with no requestId is a request of its own. */
function requestsOf(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (entry.requestId === undefined || entry.requestId === null) return true;
    if (seen.has(entry.requestId)) return false;
    seen.add(entry.requestId);
    return true;
  });
}

/* Totals over the given calls.
 *   total       sum of the known durations, each request once
 *   span        wall-clock from the first start to the last end — calls
 *               overlap, so this is what the user waited, where total is what
 *               was spent
 *   avg         total over the requests that have a duration
 *   slowest     the longest single duration, slowestId / slowestName the call
 *               (the first of its request) it belongs to
 *   requests    how many network requests the calls travelled in
 * A request with no duration (0, missing, not a number) adds nothing to total,
 * avg and slowest; it still counts as selected and, with a start time, still
 * moves the span's edges. Fields are null when nothing backs them. */
export function selectionSummary(entries) {
  const requests = requestsOf(entries);
  const timed = requests.filter((entry) => known(entry.duration));
  const total = timed.reduce((sum, entry) => sum + entry.duration, 0);
  const slowest = timed.reduce((best, entry) => (best && best.duration >= entry.duration ? best : entry), null);

  let first = Infinity;
  let last = -Infinity;
  requests.forEach((entry) => {
    const start = startOf(entry);
    if (Number.isNaN(start)) return;
    first = Math.min(first, start);
    last = Math.max(last, start + (known(entry.duration) ? entry.duration : 0));
  });

  return {
    count: entries.length,
    requests: requests.length,
    failed: entries.filter((entry) => entry.failure !== undefined && entry.failure !== null).length,
    oversized: oversizedCount(entries),
    timed: timed.length,
    total: timed.length ? total : null,
    span: first <= last ? last - first : null,
    avg: timed.length ? Math.round(total / timed.length) : null,
    slowest: slowest ? slowest.duration : null,
    slowestId: slowest ? slowest.id : null,
    slowestName: slowest && typeof slowest.name === 'string' ? slowest.name : '',
    slowestFrom: slowest && slowest.nameFrom ? slowest.nameFrom : ''
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/* The bar's sentence as pieces, so the slowest call's name can be drawn as a
 * button: [{ text }, { text, callId }, ...]. Joined, it is summaryText.
 *   "3 calls · total 1,835 ms · span 36,240 ms · avg 612 ms · slowest Name_Here 1,240 ms · 1 failed"
 * A trailing "2 calls over 100 KB of input" says how many sent a large input.
 * "total" is what the requests added up to; "span" is the clock
 * time from the first start to the last end (calls overlap). One request needs
 * neither, nor an average or a slowest. format is the Time format setting.
 * `mask`, for text that leaves the panel, applies to a name read from the
 * call's input (see maskedName); the bar on screen draws the name as it is. */
export function summaryParts(summary, format, mask) {
  if (!summary.count) return [];
  const time = (ms) => formatTime(ms, format);
  const slowestName = mask
    ? maskedName({ name: summary.slowestName, nameFrom: summary.slowestFrom }, mask)
    : summary.slowestName;
  const batched = summary.requests !== undefined && summary.requests < summary.count;
  const lead = plural(summary.count, 'call') + (batched ? ` in ${plural(summary.requests, 'request')}` : '');
  const segments = [[{ text: lead }]];
  if (summary.total === null) {
    segments.push([{ text: 'no durations' }]);
  } else if (summary.timed === 1 && summary.requests === 1) {
    segments.push([{ text: time(summary.total) }]);
  } else {
    segments.push([{ text: `total ${time(summary.total)}` }]);
    if (summary.span !== null && summary.requests > 1) segments.push([{ text: `span ${time(summary.span)}` }]);
    segments.push([{ text: `avg ${time(summary.avg)}` }]);
    segments.push(slowestName
      ? [{ text: 'slowest ' }, { text: slowestName, callId: summary.slowestId }, { text: ` ${time(summary.slowest)}` }]
      : [{ text: `slowest ${time(summary.slowest)}` }]);
  }
  if (summary.failed) segments.push([{ text: `${summary.failed} failed` }]);
  if (summary.oversized) segments.push([{ text: oversizedText(summary.oversized) }]);
  return segments.flatMap((segment, index) => (index ? [{ text: ' · ' }, ...segment] : segment));
}

export function summaryText(summary, format, mask) {
  return summaryParts(summary, format, mask).map((part) => part.text).join('');
}

/* One segment per request that has a duration, for the proportional bar under
 * the sentence: { id, name, type, kind, duration, percent, calls, failed }.
 * id is the first call of the request (what a click selects); percent is the
 * share of the added-up time, never 0 for a request that took some. */
export function requestSegments(entries) {
  const timed = requestsOf(entries).filter((entry) => known(entry.duration));
  const total = timed.reduce((sum, entry) => sum + entry.duration, 0);
  return timed.map((entry) => {
    const together = entry.requestId === undefined || entry.requestId === null
      ? [entry]
      : entries.filter((other) => other.requestId === entry.requestId);
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      kind: KIND_LABEL[entry.type] || '',
      duration: entry.duration,
      percent: Math.max(1, Math.round((entry.duration / total) * 100)),
      calls: together.length,
      failed: together.some((call) => call.failure !== undefined && call.failure !== null)
    };
  });
}

/* "Name_Here · 380 ms · 21%": the tooltip of a segment (and its accessible
 * name, with the kind of call in front). */
export function segmentTitle(segment, format) {
  const more = segment.calls > 1 ? ` +${segment.calls - 1} more in this request` : '';
  return `${segment.name}${more} · ${formatTime(segment.duration, format)} · ${segment.percent}%${segment.failed ? ' · failed' : ''}`;
}

/* What a screen reader says for a segment, in full sentence order. */
export function segmentLabel(segment, format) {
  const parts = [segment.name];
  if (segment.calls > 1) parts.push(`${segment.calls} calls in this request`);
  if (segment.kind) parts.push(segment.kind);
  parts.push(formatTime(segment.duration, format), `${segment.percent}% of the selected time`);
  if (segment.failed) parts.push('failed');
  return parts.join(', ');
}

/* The call types the segments are drawn in, in a fixed order, for the key
 * under the bar. Empty with fewer than two, where a key says nothing. */
export function segmentTypes(segments) {
  const present = new Set(segments.map((segment) => segment.type));
  const ordered = ['DR', 'IP', 'RA', 'APEX'].filter((type) => present.has(type));
  return ordered.length > 1 ? ordered : [];
}

/* The ids from `fromId` to `toId` inclusive, in list order, whichever of the
 * two comes first. When the anchor is not in the list (filtered away since),
 * only the clicked id. */
export function idsInRange(ids, fromId, toId) {
  const to = ids.indexOf(toId);
  const from = ids.indexOf(fromId);
  if (to < 0) return [];
  if (from < 0) return [toId];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/* Header checkbox: 'none', 'some' or 'all' of the visible ids are marked. */
export function markState(visibleIds, marked) {
  const hits = visibleIds.filter((id) => marked.has(id)).length;
  if (!hits) return 'none';
  return hits === visibleIds.length ? 'all' : 'some';
}

/* The marks that still point at a call that exists. */
export function pruneMarks(marked, entries) {
  const alive = new Set(entries.map((entry) => entry.id));
  return new Set([...marked].filter((id) => alive.has(id)));
}
