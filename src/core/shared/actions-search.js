'use strict';

/* The Calls filter box. Plain words narrow by the call's name; three
 * prefixes narrow by something else, so the box stays one box:
 *
 *   in:Order        the input, options or output holds the text (keys too)
 *   url:aura        the request URL holds the text
 *   step:Review     the call was made while the script was on a step whose
 *                   name or key holds the text; step:"Order Review" for spaces
 *   repeat:         only repeated calls and the ones they repeat (also
 *                   "repeats"); it takes no text
 *   slow:800        calls that took at least 800 ms; slow: alone uses the
 *                   slow-call threshold from Settings (2000 ms when it is 0)
 *
 * Prefixes combine with each other and with plain words (all must hold). A
 * prefix with nothing after it is ignored while it is being typed.
 *
 * Pure: no DOM, no chrome.*. */

import { maskValues } from './mask.js';
import { DEFAULT_SLOW_MS } from './actions-timing.js';

const TOKEN = /(^|\s)(in|url|step):("([^"]*)"|\S*)/gi;
const REPEAT = /(^|\s)(?:repeat:|repeats:?)(?=\s|$)/gi;
const SLOW = /(^|\s)slow:(?:(\d+)(?:ms)?)?(?=\s|$)/gi;

/* The text typed, as { text, inPayload, url, step, repeats, slow }, all lower
 * case and empty (false for repeats, null for slow) when absent. slow is 0 for
 * slow: alone (the threshold from Settings) or the milliseconds typed. */
export function parseQuery(query) {
  const found = { text: '', inPayload: '', url: '', step: '', repeats: false, slow: null };
  const withoutSlow = String(query || '').replace(SLOW, (all, lead, ms) => {
    found.slow = ms ? Number(ms) : 0;
    return lead;
  });
  const withoutRepeat = withoutSlow.replace(REPEAT, (all, lead) => {
    found.repeats = true;
    return lead;
  });
  const rest = withoutRepeat.replace(TOKEN, (all, lead, prefix, raw, quoted) => {
    const value = (quoted !== undefined ? quoted : raw).trim().toLowerCase();
    const name = prefix.toLowerCase();
    if (value) found[name === 'in' ? 'inPayload' : name] = value;
    return lead;
  });
  found.text = rest.trim().toLowerCase();
  return found;
}

export function hasQuery(parsed) {
  return !!(parsed.text || parsed.inPayload || parsed.url || parsed.step || parsed.repeats || parsed.slow !== null);
}

/* The OmniScript step a call was made on, from Structure's step timeline
 * ([{ key, name, from, to }], `to` null while the visit is open): the visit
 * that was running at timeMs, or null. */
export function stepAt(visits, timeMs) {
  let hit = null;
  (visits || []).forEach((visit) => {
    const ends = visit.to === null || visit.to === undefined || timeMs < visit.to;
    if (visit.from <= timeMs && ends) hit = visit;
  });
  return hit;
}

/* Everything a call carried, as one string, worked out once per call. Masked
 * and unmasked are kept apart: while Mask values is on only keys and
 * structure may be searched, or the search would give the values away. */
const cache = { plain: new WeakMap(), masked: new WeakMap() };

export function payloadText(entry, masked = false) {
  const store = masked ? cache.masked : cache.plain;
  let hit = store.get(entry);
  if (!hit) {
    const data = { input: entry.action && entry.action.input, options: entry.action && entry.action.options, output: entry.output };
    let text = '';
    try { text = JSON.stringify(masked ? maskValues(data) : data) || ''; } catch { /* unserialisable: nothing to search */ }
    hit = { text, lower: text.toLowerCase() };
    store.set(entry, hit);
  }
  return hit;
}

/* The filter text without its slow: term, for the status bar, which names that
 * filter on its own. */
export function withoutSlow(query) {
  return String(query || '').replace(SLOW, (all, lead) => lead).replace(/\s+/g, ' ').trim();
}

/* The milliseconds slow: stands for: what was typed, else the threshold from
 * Settings, else the default. null when the filter has no slow:. */
export function slowFilterMs(parsed, settingMs) {
  if (parsed.slow === null || parsed.slow === undefined) return null;
  if (parsed.slow > 0) return parsed.slow;
  return typeof settingMs === 'number' && settingMs > 0 ? settingMs : DEFAULT_SLOW_MS;
}

/* opts: { masked, visits, repeatIds, slowMs } (repeatIds: the Set the repeat: prefix keeps;
 * slowMs: the slow-call threshold setting, for a bare slow:) */
export function matchesQuery(entry, parsed, opts = {}) {
  if (parsed.repeats && !(opts.repeatIds && opts.repeatIds.has(entry.id))) return false;
  const slow = slowFilterMs(parsed, opts.slowMs);
  if (slow !== null && !(entry.duration >= slow)) return false;
  if (parsed.text && !`${entry.name} ${entry.signature}`.toLowerCase().includes(parsed.text)) return false;
  if (parsed.url && !String(entry.url || '').toLowerCase().includes(parsed.url)) return false;
  if (parsed.inPayload && !payloadText(entry, opts.masked).lower.includes(parsed.inPayload)) return false;
  if (parsed.step) {
    const visit = stepAt(opts.visits, entry.time instanceof Date ? entry.time.getTime() : NaN);
    if (!visit || !`${visit.name} ${visit.key}`.toLowerCase().includes(parsed.step)) return false;
  }
  return true;
}

/* A short stretch of the call's payload around the first hit, as
 * …"OrderId":"801…  — empty when there is none. */
export function payloadSnippet(entry, needle, masked = false) {
  const wanted = String(needle || '').toLowerCase();
  if (!wanted) return '';
  const { text, lower } = payloadText(entry, masked);
  const at = lower.indexOf(wanted);
  if (at < 0) return '';
  const start = Math.max(0, at - 18);
  const end = Math.min(text.length, at + wanted.length + 28);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
