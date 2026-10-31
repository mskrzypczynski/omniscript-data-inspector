'use strict';

/* Repeated calls: the same procedure or method called again with the same
 * input and options within a few seconds. A double-fired action or a
 * re-render loop in a script usually looks like this, and it is easy to miss
 * in a long list.
 *
 * Pure: no DOM, no chrome.*. */

import { verdictOf } from '../shared/actions-model.js';

export const REPEAT_WINDOW_MS = 5000;

/* The input as written, key order included: two calls that differ only in the
 * order of keys are repeats, but not byte-identical. */
function exact(value) {
  try {
    return JSON.stringify(value) || '';
  } catch {
    return '';
  }
}

/* JSON with the keys of every object in order, so two values that differ only
 * in key order read the same. undefined and unserialisable values read as ''. */
function canonical(value) {
  try {
    return JSON.stringify(value, (key, inner) => {
      if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return inner;
      return Object.keys(inner).sort().reduce((sorted, name) => { sorted[name] = inner[name]; return sorted; }, {});
    }) || '';
  } catch {
    return '';
  }
}

const startOf = (entry) => (entry.time instanceof Date ? entry.time.getTime() : Number(entry.time));

/* The calls that repeat an earlier one: Map of call id -> { ofId, count,
 * prevId, sameInput }.
 * A call repeats when an earlier call with the same name and signature and
 * deep-equal input and options started at most `windowMs` before it. ofId is
 * the first call of the run, count the call's place in it (2 for the second).
 * prevId is the call of the run just before this one, and sameInput says its
 * input is byte-identical to this one's (same keys in the same order).
 * The window is measured from the previous call of the run, so a steady
 * re-render loop is one run. The hops of one chain are never repeats of each
 * other (`chains`, from groupChains: they call the same procedure by design).
 * `entries` must be in the order the calls started. */
export function findRepeats(entries, windowMs = REPEAT_WINDOW_MS, chains = []) {
  const chainOf = new Map();
  chains.forEach((chain) => chain.hops.forEach((id) => chainOf.set(id, chain.id)));
  const repeats = new Map();
  const last = new Map(); // call key -> { id, at, firstId, count, exact } of the run's latest call
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const action = entry.action || {};
    const key = [entry.name, entry.signature, canonical(action.input), canonical(action.options)].join('\u0000');
    const at = startOf(entry);
    const written = exact(action.input);
    const before = last.get(key);
    const sameChain = before && chainOf.has(entry.id) && chainOf.get(entry.id) === chainOf.get(before.id);
    if (before && !sameChain && at - before.at <= windowMs) {
      const count = before.count + 1;
      repeats.set(entry.id, { ofId: before.firstId, count, prevId: before.id, sameInput: before.exact === written });
      last.set(key, { id: entry.id, at, firstId: before.firstId, count, exact: written });
    } else {
      last.set(key, { id: entry.id, at, firstId: entry.id, count: 1, exact: written });
    }
  });
  return repeats;
}

/* The ids a `repeat:` filter keeps: the repeated calls and the ones they repeat. */
export function repeatIds(repeats) {
  const ids = new Set();
  repeats.forEach((repeat, id) => { ids.add(id); ids.add(repeat.ofId); });
  return ids;
}

/* The text on a repeated call's tag. */
export function repeatLabel(repeat) {
  return `repeat ×${repeat.count}`;
}

export function repeatTitle(clockText) {
  return `Same procedure and input as the call at ${clockText}; a double-fired action or a re-render loop usually causes this`;
}

/* The muted line in the detail head of a call that repeats an earlier one with
 * byte-identical input, when that earlier call succeeded: { id, text } where
 * text is "Same input as the call at 10:42:03 (Succeeded)", or null. `previous`
 * is the call repeat.prevId names, `clock` writes its start time. Said only
 * for a success: after a failure, sending the same input again is a retry. */
export function sameInputHint(repeat, previous, clock) {
  if (!repeat || !repeat.sameInput || !previous) return null;
  const verdict = verdictOf(previous);
  if (verdict.tone !== 'good') return null;
  return { id: previous.id, text: `Same input as the call at ${clock(previous.time)} (${verdict.text})` };
}
