'use strict';

/* The Data tab's change log: the last values that changed while the panel was
 * watching, newest last, with the step the script was on at the time.
 *
 * Pure: no DOM, no chrome.*, and no clock — callers pass `time`. */

import { maskIdentity } from './diff.js';

export const MAX_LOG = 200;

const pad = (n) => String(n).padStart(2, '0');

/* 14:03:09, local time. */
export function clockText(time) {
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

/* New log entries for the differences found in one read. `found` is
 * detectChanges().entries; `step` the stamp of the read ({ name } or null);
 * `firstId` the id of the first new entry. Only the last MAX_LOG can matter. */
export function logEntries(found, time, step, firstId) {
  return found.slice(-MAX_LOG).map((entry, i) => ({
    id: firstId + i,
    time,
    step: step ? step.name : '',
    path: entry.path,
    text: entry.text,
    kind: entry.kind,
    before: entry.before,
    after: entry.after,
    ...(entry.identity === undefined ? {} : { identity: entry.identity })
  }));
}

/* The log with `added` appended, keeping the last MAX_LOG. Returns the same
 * array when there is nothing to add. */
export function appendLog(log, added) {
  if (!added.length) return log;
  const next = log.concat(added);
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
}

const SHOW_MAX = 80;

/* A value on one line, cut short. `transform` is Mask.apply for a copy. */
export function describeValue(value, transform = (v) => v) {
  if (value === undefined) return '—';
  let text;
  try { text = JSON.stringify(transform(value)); } catch { text = String(value); }
  if (text === undefined) text = String(value);
  return text.length > SHOW_MAX ? `${text.slice(0, SHOW_MAX)}…` : text;
}

/* The two sides of "was → now" for an entry, each one line of text: { before,
 * after }. A row added has no "was" and a row removed no "now". */
export function changeParts(entry, transform) {
  if (entry.kind === 'row-added') return { before: 'row added', after: describeValue(entry.after, transform) };
  if (entry.kind === 'row-removed') return { before: describeValue(entry.before, transform), after: 'row removed' };
  return { before: describeValue(entry.before, transform), after: describeValue(entry.after, transform) };
}

/* "was → now" for an entry. */
export function changeText(entry, transform) {
  const { before, after } = changeParts(entry, transform);
  return `${before} → ${after}`;
}

/* The line the log shows and copies:
 * 14:03:09 · Step2 · Step2.Rows[1].Code · "A" → "B" */
export function logLine(entry, transform) {
  const where = entry.identity ? `${entry.text} (${maskIdentity(entry.identity, transform)})` : entry.text;
  return [clockText(entry.time), entry.step || '–', where, changeText(entry, transform)].join(' · ');
}

export function logText(log, transform) {
  return log.map((entry) => logLine(entry, transform)).join('\n');
}
