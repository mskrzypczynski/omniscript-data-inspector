'use strict';

/* How long a call took and where the time went: the HAR timings of its
 * request and the figures the Took cell and its tooltip show.
 *
 * Pure: no DOM, no chrome.*. */

import { formatTime } from './time-format.js';

const known = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const part = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

/* A duration the browser could not measure comes as -1 (or 0): unknown, not
 * "-1 ms". Returns the duration, or null. */
export function knownDuration(value) {
  return known(value) ? value : null;
}

export function formatBytes(bytes) {
  if (!known(bytes)) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* The HAR timings of one request ({ blocked, dns, connect, ssl, send, wait,
 * receive }, -1 meaning not applicable) as
 *   server  wait + receive: first byte plus download, the nearest thing the
 *           browser can say about the server's share
 *   queue   blocked + dns + connect + send: spent before the request was away
 * or null when the timings say nothing about wait and receive. */
export function timingParts(timings) {
  if (!timings || typeof timings !== 'object') return null;
  const wait = part(timings.wait);
  const receive = part(timings.receive);
  if (wait === null && receive === null) return null;
  const blocked = part(timings.blocked);
  const dns = part(timings.dns);
  const connect = part(timings.connect);
  const send = part(timings.send);
  return {
    blocked, dns, connect, send, wait, receive,
    server: (wait || 0) + (receive || 0),
    queue: (blocked || 0) + (dns || 0) + (connect || 0) + (send || 0)
  };
}

/* The Took cell: the time and nothing else, one line ("1,840 ms", "1.8 s"
 * with the human Time format). That the request carried several calls is the
 * ×N tag of the row (batchTag) and the cell's tooltip. Empty when the
 * duration is unknown. */
export function tookText(entry, format) {
  if (!known(entry.duration)) return '';
  return formatTime(entry.duration, format);
}

/* The time and, for a shared request, "· shared by 3": for the detail's meta
 * line and a chain's hops, which have a whole line to say it on. */
export function tookWithBatch(entry, format) {
  const text = tookText(entry, format);
  return text && entry.batchSize > 1 ? `${text} · shared by ${entry.batchSize}` : text;
}

/* One request that carried several actions: what the row's ×N tag and the
 * Took cell's tooltip say. '' for a request of one. */
export function batchTitle(entry) {
  return entry.batchSize > 1 ? `One request shared by ${entry.batchSize} actions: the time is the whole request's` : '';
}

/* The small neutral tag a shared request's rows carry in the option tags
 * cell: { label: '×7', title }, or null for a request of one. */
export function batchTag(entry) {
  return entry.batchSize > 1 ? { label: `×${entry.batchSize}`, title: batchTitle(entry), tone: 'neutral', extra: 'tag-batch' } : null;
}

export function tookTitle(entry, format) {
  if (!known(entry.duration)) return 'Duration unavailable';
  const time = (ms) => formatTime(ms, format);
  const lines = [`Round trip: ${time(entry.duration)} from request sent to response received`];
  const t = entry.timings;
  if (t) {
    lines.push(
      `Server share: ${time(t.server)} (waiting for the first byte ${time(t.wait || 0)}, download ${time(t.receive || 0)})`,
      `Before the request was away: ${time(t.queue)} (blocked ${time(t.blocked || 0)}, DNS ${time(t.dns || 0)}, connect ${time(t.connect || 0)}, send ${time(t.send || 0)})`
    );
  }
  if (entry.batchSize > 1) {
    lines.push(`${batchTitle(entry)}; a selection adds it up once.`);
  }
  return lines.join('\n');
}

/* With no slow-call threshold set, a call is slow from 2 s (the threshold Settings shows, and the one slow: alone uses). */
export const DEFAULT_SLOW_MS = 2000;
