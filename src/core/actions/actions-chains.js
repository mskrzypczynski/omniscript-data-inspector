'use strict';

/* Chained Integration Procedures. A chainable procedure does not answer in one
 * round trip: the first call carries options.chainable (or queueableChainable)
 * true, the answer often says the chain goes on, and the page calls the same
 * procedure again shortly after, once per hop. This module finds those hops in
 * the list of calls and draws the line between a chain and the calls around it.
 *
 * Best effort, like the rest of the tab: the markers an answer uses to say
 * "more to come" differ between packages and versions, so a few spellings are
 * recognised and the option flag carries the rest. A file saved by Export
 * names its chains (chainId), and that is used as it is.
 *
 * Pure: no DOM, no chrome.*, no clock (callers pass `now`). */

import { failed, failureReason, verdictOf, KIND_LABEL } from '../shared/actions-model.js';
import { formatTime } from '../shared/time-format.js';

/* How long after a hop ended the next one may start and still be its
 * continuation; also how long a chain that says it goes on may stay silent
 * before it counts as stopped early. */
export const CHAIN_GAP_MS = 30000;

/* How long after a hop ended the next may start when the hop's answer said
 * nothing and only the option flag promised a chain. The flag is on every hop
 * of a chain and on plenty of independent calls, so without a marker only a
 * call that follows at once counts. */
export const SILENT_GAP_MS = 5000;

/* Hops are separate requests, so one that starts a little before the last one
 * ended is clock noise; more than this means the two overlapped and are
 * independent calls. */
export const OVERLAP_MS = 250;

const FLAG_KEYS = ['chainable', 'queueablechainable'];
const STATUS_KEYS = ['vlcstatus', 'chainstatus'];
const CONTINUATION_KEYS = ['continuation', 'continuationid', 'continuationtoken', 'chaincontinuation'];
const GOES_ON = /^(queued|in[\s_-]?progress|pending|running|continue|continued|continuing|more)$/i;
const IS_DONE = /^(complete|completed|done|finished|success|succeeded)$/i;

const startOf = (entry) => (entry.time instanceof Date ? entry.time.getTime() : Number(entry.time));
const durationOf = (entry) => (typeof entry.duration === 'number' && entry.duration > 0 ? entry.duration : 0);
const endOf = (entry) => startOf(entry) + durationOf(entry);

function lowercased(object) {
  const index = {};
  Object.keys(object).forEach((key) => { index[key.toLowerCase()] = object[key]; });
  return index;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* What the answer says about the chain: 'continues', 'done' or null. Looked
 * for at the top of the output and one level down, in an IPResult node. */
export function answerMarker(output) {
  if (!isObject(output)) return null;
  const levels = [output];
  const nested = lowercased(output).ipresult;
  if (isObject(nested)) levels.push(nested);
  for (const level of levels) {
    const fields = lowercased(level);
    for (const key of STATUS_KEYS) {
      if (typeof fields[key] !== 'string') continue;
      if (IS_DONE.test(fields[key].trim())) return 'done';
      if (GOES_ON.test(fields[key].trim())) return 'continues';
    }
    if (CONTINUATION_KEYS.some((key) => fields[key])) return 'continues';
  }
  return null;
}

/* The call asked to be chainable (option flag). */
function chainableFlag(entry) {
  const options = entry.action && entry.action.options;
  if (!isObject(options)) return false;
  const index = lowercased(options);
  return FLAG_KEYS.some((key) => index[key] === true);
}

/* Whether another hop may follow this call: its answer says so, or, when the
 * answer is silent, it asked to be chainable. An answer that says it is done
 * wins over the flag, which every hop of a chain carries. */
export function mayContinue(entry) {
  const marker = answerMarker(entry.output);
  if (marker) return marker === 'continues';
  return chainableFlag(entry);
}

const chainKey = (entry) => `${entry.name}\u0000${entry.signature}`;

/* Strings shorter than this are too common (ids of one letter, "Y") to tie a
 * call to an answer. */
const TOKEN_MIN_LENGTH = 6;

function textLeaves(value, into, depth = 0) {
  if (typeof value === 'string') {
    if (value.length >= TOKEN_MIN_LENGTH) into.push(value);
  } else if (depth < 6 && value !== null && typeof value === 'object') {
    Object.keys(value).forEach((key) => textLeaves(value[key], into, depth + 1));
  }
  return into;
}

const sameJson = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
};

/* Whether a call whose predecessor said nothing is tied to it: it was sent
 * with the same input (the page asking again), or its input carries a piece of
 * text taken from the predecessor's answer (a token handed on). Two chainable
 * calls a second apart with unrelated inputs are two calls. */
function tiedTo(last, entry) {
  const sent = last.action && last.action.input;
  const next = entry.action && entry.action.input;
  if (sameJson(sent, next)) return true;
  let nextText = '';
  try { nextText = JSON.stringify(next) || ''; } catch { return false; }
  return textLeaves(last.output, []).some((token) => nextText.includes(JSON.stringify(token).slice(1, -1)));
}

/* Whether `entry` continues `last` (calls to one procedure already): the
 * answer of `last` says the chain goes on and the next hop comes within
 * CHAIN_GAP_MS, or the answer is silent and the flag stands in for it, the
 * next hop comes within SILENT_GAP_MS and is tied to it (tiedTo). A hop never
 * overlaps the one before. */
function follows(last, entry) {
  const marker = answerMarker(last.output);
  if (marker === 'done') return false;
  if (!marker && !chainableFlag(last)) return false;
  if (last.requestId !== undefined && last.requestId !== null && last.requestId === entry.requestId) return false;
  const gap = startOf(entry) - endOf(last);
  if (gap < -OVERLAP_MS) return false;
  if (marker) return gap <= CHAIN_GAP_MS;
  return gap <= SILENT_GAP_MS && tiedTo(last, entry);
}

/* Runs of calls: consecutive calls to one Integration Procedure that continue
 * each other, or the calls a file names as one chain. Other calls in between
 * (to anything else) do not break a chain. */
function runsOf(entries) {
  const runs = [];
  const open = new Map(); // procedure key -> the run still open
  const named = new Map(); // chainId -> its run
  entries.forEach((entry) => {
    if (typeof entry.chainId === 'string' && entry.chainId) {
      if (!named.has(entry.chainId)) {
        const run = [];
        named.set(entry.chainId, run);
        runs.push(run);
      }
      named.get(entry.chainId).push(entry);
      return;
    }
    if (entry.type !== 'IP') return;
    const key = chainKey(entry);
    const run = open.get(key);
    if (run && follows(run[run.length - 1], entry)) {
      run.push(entry);
      return;
    }
    const fresh = [entry];
    open.set(key, fresh);
    runs.push(fresh);
  });
  return runs;
}

/* The chains in the list, in the order they began:
 *   { id, name, key, hops: [call ids], durationMs, spanMs, failed, stoppedEarly }
 * durationMs adds up the hops' round trips, spanMs is the clock time from the
 * first start to the last end. stoppedEarly: the last hop's answer says the
 * chain goes on, yet nothing followed within CHAIN_GAP_MS (measured to `now`,
 * or to the end of the latest call when no clock is given). One call is never
 * a chain. `entries` must be in the order the calls started. */
export function groupChains(entries, { now } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const reference = typeof now === 'number' ? now : list.reduce((latest, entry) => Math.max(latest, endOf(entry)), -Infinity);
  return runsOf(list).filter((run) => run.length > 1).map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    return {
      id: `chain-${first.id}`,
      name: first.name,
      key: first.signature,
      hops: run.map((entry) => entry.id),
      durationMs: run.reduce((sum, entry) => sum + durationOf(entry), 0),
      spanMs: Math.max(...run.map(endOf)) - startOf(first),
      failed: run.some(failed),
      stoppedEarly: answerMarker(last.output) === 'continues' && reference - endOf(last) > CHAIN_GAP_MS
    };
  });
}

/* How long from `now` until a chain that is still going on counts as stopped
 * early, or null when no chain waits for that. stoppedEarly is judged against
 * the clock, so a screen that only redraws when a call arrives would keep
 * saying nothing for as long as the page stays quiet: callers redraw after
 * this many milliseconds. `groups` as groupChains made them from `entries`. */
export function nextStopCheck(groups, entries, now) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let soonest = null;
  groups.forEach((group) => {
    if (group.stoppedEarly) return;
    const last = byId.get(group.hops[group.hops.length - 1]);
    if (!last || answerMarker(last.output) !== 'continues') return;
    const wait = endOf(last) + CHAIN_GAP_MS - now + 1;
    if (soonest === null || wait < soonest) soonest = wait;
  });
  return soonest === null ? null : Math.max(1, soonest);
}

/* Call id -> the chain it is a hop of. */
export function chainIndex(groups) {
  const index = new Map();
  groups.forEach((group) => group.hops.forEach((id) => index.set(id, group)));
  return index;
}

export const isChainId = (id) => typeof id === 'string' && id.startsWith('chain-');

/* What the list draws, top to bottom, from the calls the filters let through:
 *   { kind: 'call', entry }
 *   { kind: 'chain', group, hops: [entries that pass the filters], total }
 *   { kind: 'hop', entry, group, number }   (number: 1-based place in the chain)
 * A chain stands where its first visible hop stood and shows when any hop
 * passes; its hops follow it while its id is in `expanded`. */
export function chainRows(visible, groups, expanded) {
  const index = chainIndex(groups);
  const rows = [];
  const placed = new Set();
  visible.forEach((entry) => {
    const group = index.get(entry.id);
    if (!group) { rows.push({ kind: 'call', entry }); return; }
    if (placed.has(group.id)) return;
    placed.add(group.id);
    const hops = visible.filter((other) => group.hops.includes(other.id));
    rows.push({ kind: 'chain', group, hops, total: group.hops.length });
    if (expanded.has(group.id)) {
      hops.forEach((hop) => rows.push({ kind: 'hop', entry: hop, group, number: group.hops.indexOf(hop.id) + 1 }));
    }
  });
  return rows;
}

/* "3 calls · 2,100 ms". What the code calls a hop is, for the person using the
 * panel, one of the calls a chain ran as: nobody reads "hop". */
export function chainSummary(group, format) {
  return `${group.hops.length} calls · ${formatTime(group.durationMs, format)}`;
}

/* The tag on a chain's own row (its children carry none): { label, title, tone }. */
export function chainTag(group) {
  const count = group.hops.length;
  return {
    label: `chain · ${count} calls`,
    title: `One chainable procedure that ran as ${count} calls; the time is the sum`,
    tone: 'neutral',
    extra: 'tag-chain'
  };
}

/* A child row's place in its chain: "call 2 of 3". */
export function callPlace(number, total) {
  return `call ${number} of ${total}`;
}

/* Said in a call's detail head when the call is one of a chain's: "call 2 of
 * 3 in a chain", or '' for a call that is not in the group. */
export function chainPlaceText(group, id) {
  const at = group && Array.isArray(group.hops) ? group.hops.indexOf(id) : -1;
  return at < 0 ? '' : `${callPlace(at + 1, group.hops.length)} in a chain`;
}

/* The sentence on a chain's Calls tab: how many calls it ran as and, only as
 * far as the calls show it, why they count as one. Chains are found two ways,
 * by the answers saying "continue" and by the chainable option together with
 * a repeated input or a token handed on, so "the server answered 'continue'"
 * is said only when every call but the last did. `hopEntries` are the chain's
 * calls in order; `stoppedEarly` is the group's flag. */
export function chainSentence(hopEntries, stoppedEarly = false) {
  const calls = Array.isArray(hopEntries) ? hopEntries : [];
  const count = calls.length;
  const base = `This procedure ran as ${count} calls in a chain`;
  const earlier = calls.slice(0, -1);
  const answered = earlier.length > 0 && earlier.every((entry) => answerMarker(entry.output) === 'continues');
  const stopped = 'no further call followed within 30 seconds';
  if (answered) {
    return stoppedEarly
      ? `${base}; the server answered 'continue' after each, including the last, but ${stopped}.`
      : `${base}; the server answered 'continue' after each but the last.`;
  }
  const flagged = earlier.some(chainableFlag);
  const joined = flagged
    ? `${base}; they were joined by the chainable option and a shared input or token, not by an answer saying 'continue'.`
    : `${base}.`;
  return stoppedEarly ? `${joined} The last answer says the chain goes on, but ${stopped}.` : joined;
}

/* The pieces of the line under a chain's name in the detail pane. */
export function chainMetaParts(group, hopEntries, { clock, format }) {
  const bits = [KIND_LABEL.IP, `${group.hops.length} calls`, `total ${formatTime(group.durationMs, format)}`];
  if (group.spanMs > group.durationMs) bits.push(`span ${formatTime(group.spanMs, format)}`);
  bits.push(clock(hopEntries[0].time));
  const failedCount = hopEntries.filter(failed).length;
  if (failedCount) bits.push(failedCount === 1 ? '1 call failed' : `${failedCount} calls failed`);
  if (group.stoppedEarly) bits.push('stopped early');
  return bits;
}

/* Why the chain counts as failed: the first failing hop's reason, with its
 * place. `mask` as in failureReason. Null when no hop failed. */
export function chainFailure(hopEntries, mask) {
  const at = hopEntries.findIndex(failed);
  if (at < 0) return null;
  return `Call ${at + 1} of ${hopEntries.length}: ${failureReason(hopEntries[at], false, mask)}`;
}

/* The result of a chain: the last call's verdict, red when any call failed. */
export function chainVerdict(group, hopEntries) {
  if (group.failed) return { text: 'Failed', tone: 'bad' };
  return verdictOf(hopEntries[hopEntries.length - 1]);
}

/* The chain as one call the detail pane can show: the first hop's input and
 * options, the last hop's answer. `chain` carries the group, `hopEntries` the
 * hops. */
export function chainView(group, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const hopEntries = group.hops.map((id) => byId.get(id)).filter(Boolean);
  if (!hopEntries.length) return null;
  const first = hopEntries[0];
  const last = hopEntries[hopEntries.length - 1];
  return {
    id: group.id,
    chain: group,
    hopEntries,
    kind: first.kind,
    url: first.url,
    time: first.time,
    duration: group.durationMs || null,
    httpStatus: last.httpStatus,
    size: last.size,
    omni: first.omni,
    type: 'IP',
    flags: first.flags,
    name: first.name,
    nameFrom: first.nameFrom,
    signature: first.signature,
    action: first.action,
    state: last.state,
    output: last.output,
    error: last.error,
    responseProblem: last.responseProblem,
    responseNote: last.responseNote,
    rawResponse: last.rawResponse,
    failure: chainFailure(hopEntries)
  };
}

/* Rows of an export with the chain each call belongs to named, so a reader of
 * the file (or the panel, loading it) sees the same chains. `entries` are the
 * calls the rows were made from, in the same order. */
export function withChainIds(rows, entries, groups) {
  const index = chainIndex(groups);
  return rows.map((row, at) => {
    const group = index.get(entries[at].id);
    return group ? { ...row, chainId: group.id } : row;
  });
}
