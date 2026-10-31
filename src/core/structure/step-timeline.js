'use strict';

/* How long the script spent on each step. A visit is { key, name, from, to }
 * with millisecond timestamps; `to` is null while the visit is still going on.
 * There is no clock here: callers pass `now`, so the same input always gives
 * the same answer.
 *
 * Pure: no DOM, no chrome.*. */

import { formatTime } from '../shared/time-format.js';

/* Old visits are dropped beyond this, so a panel left open for a day stays small. */
export const MAX_VISITS = 1000;

/* The visits after the script is seen on `current` ({ key, name }, or null when
 * it is on no step) at time `now`. Returns the same array when nothing changed,
 * so callers can tell a change by identity. */
export function recordStep(visits, current, now) {
  const last = visits[visits.length - 1];
  const open = last && last.to === null ? last : null;

  if (open && current && open.key === current.key) return visits;
  if (!open && !current) return visits;

  const next = open
    ? visits.slice(0, -1).concat({ ...open, to: now })
    : visits.slice();
  if (current) next.push({ key: current.key, name: current.name, from: now, to: null });
  return next.length > MAX_VISITS ? next.slice(next.length - MAX_VISITS) : next;
}

/* The visits of a loaded file, frozen: a visit still open when the file was
 * saved (`to` null) ended then, at `endAt` (ms), not at the clock, or its
 * length would keep growing for as long as the file is open. An `endAt` that is
 * missing, or earlier than the visit began, leaves it with no length. Returns
 * new objects; the input is not changed. */
export function closedVisits(visits, endAt) {
  const list = Array.isArray(visits) ? visits : [];
  return list.map((visit) => {
    if (visit.to !== null) return { ...visit };
    const end = Number.isFinite(endAt) && endAt >= visit.from ? endAt : visit.from;
    return { ...visit, to: end };
  });
}

/* Time and number of visits for one step; a visit in progress counts up to now. */
export function stepTotals(visits, key, now) {
  let ms = 0;
  let count = 0;
  visits.forEach((visit) => {
    if (visit.key !== key) return;
    count++;
    ms += Math.max(0, (visit.to === null ? now : visit.to) - visit.from);
  });
  return { ms, visits: count };
}

/* Per step key, in the order the steps were first seen. */
export function allTotals(visits, now) {
  const out = {};
  visits.forEach((visit) => {
    if (!out[visit.key]) out[visit.key] = { key: visit.key, name: visit.name, ...stepTotals(visits, visit.key, now) };
  });
  return Object.values(out);
}

/* The calls that started while the script was on this step. `calls` are the
 * captured entries ({ time: Date, ... }); a call started at the very moment a
 * visit ended belongs to the next one. */
export function callsDuring(visits, key, calls, now) {
  const mine = visits.filter((visit) => visit.key === key);
  if (!mine.length) return [];
  return calls.filter((call) => {
    const started = call.time instanceof Date ? call.time.getTime() : Number(call.time);
    if (!Number.isFinite(started)) return false;
    return mine.some((visit) => started >= visit.from && started < (visit.to === null ? now : visit.to));
  });
}

/* The two lines the detail pane shows for a step, and the calls behind the
 * second one. The time is written the way the Time format setting says
 * ('ms' or 'human', see time-format.js). */
export function describeStep(visits, key, calls, now, format = 'ms') {
  const totals = stepTotals(visits, key, now);
  const during = callsDuring(visits, key, calls, now);
  const time = totals.visits
    ? `Time on this step: ${formatTime(totals.ms, format)} (${totals.visits} ${totals.visits === 1 ? 'visit' : 'visits'})`
    : 'Time on this step: not seen yet';
  return {
    time, calls: `Calls during this step: ${during.length}`, callList: during, visits: totals.visits,
    /* What a head shows only while it is above zero. */
    callCount: during.length, timeMs: totals.ms
  };
}

/* ------------------------------------------------------------ the timeline */

/* The newest visits the timeline lists; older ones are only counted. */
export const TIMELINE_VISITS = 40;

const msOf = (time) => (time instanceof Date ? time.getTime() : Number(time));

/* The rows of the Timeline: one per visit, oldest first.
 *   visits  — [{ key, name, from, to }] as recordStep keeps them
 *   calls   — captured calls ({ id, name, time }) from Calls
 *   history — payload snapshots ({ raw, time }), oldest first
 *   now     — the clock, in ms; an open visit runs up to it
 * Each row: { index, key, name, from, to, open, ms, share, ticks, callCount, bytes }
 *   share  — the visit's length as a fraction of the longest one shown (0..1)
 *   ticks  — [{ at, id, name }] the calls that started during the visit, `at`
 *            their place along it (0..1)
 *   bytes  — the length of the last payload read during the visit, null when
 *            none was read then
 * and `hidden` counts the older visits left out. */
export function timelineModel(visits, calls, history, now, limit = TIMELINE_VISITS) {
  const all = Array.isArray(visits) ? visits : [];
  const shown = all.slice(Math.max(0, all.length - limit));
  const captured = (Array.isArray(calls) ? calls : []).map((call) => ({ call, at: msOf(call.time) }))
    .filter((entry) => Number.isFinite(entry.at));
  const snapshots = (Array.isArray(history) ? history : []).map((snapshot) => ({ size: snapshot.raw.length, at: msOf(snapshot.time) }))
    .filter((entry) => Number.isFinite(entry.at));

  const rows = shown.map((visit, i) => {
    const end = visit.to === null ? now : visit.to;
    const ms = Math.max(0, end - visit.from);
    const ticks = captured
      .filter((entry) => entry.at >= visit.from && (entry.at < end || (visit.to === null && entry.at <= end)))
      .map((entry) => ({
        at: ms > 0 ? Math.min(1, (entry.at - visit.from) / ms) : 0,
        id: entry.call.id,
        name: entry.call.name || ''
      }));
    const read = snapshots.filter((entry) => entry.at >= visit.from && entry.at <= end);
    return {
      index: all.length - shown.length + i,
      key: visit.key,
      name: visit.name,
      from: visit.from,
      to: end,
      open: visit.to === null,
      ms,
      share: 0,
      ticks,
      callCount: ticks.length,
      bytes: read.length ? read[read.length - 1].size : null
    };
  });

  const longest = rows.reduce((max, row) => Math.max(max, row.ms), 0);
  rows.forEach((row) => { row.share = longest > 0 ? row.ms / longest : 0; });
  return { rows, hidden: all.length - shown.length };
}

/* A string that is equal while the drawn rows keep their structure: names,
 * starts, which visits are closed, the calls and the payload sizes. The length
 * of the visit still going on is left out - it grows every pulse and is painted
 * in place instead of rebuilding the pane. */
export function timelineSignature(model) {
  return JSON.stringify([
    model.hidden,
    model.rows.map((row) => [row.index, row.name, row.from, row.open ? 0 : row.to, row.callCount, row.bytes])
  ]);
}
