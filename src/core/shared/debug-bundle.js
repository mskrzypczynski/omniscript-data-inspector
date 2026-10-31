'use strict';

/* The "Debug bundle": one JSON document that puts together what a bug report
 * about a script needs, so nobody has to copy from three tabs. Values go
 * through the same mask as every other export.
 *
 * Pure: no DOM, no chrome.*, and no clock — callers pass `now`. */

import { exportEntries } from './actions-model.js';
import { parseObj, maskDefinitionValues } from './structure-model.js';

export const MAX_BUNDLE_CALLS = 50;
export const MAX_BUNDLE_SNAPSHOTS = 12;

/* The payload as it may leave: the parsed data through `mask`, or, when it did
 * not parse, the raw text. Masking needs the structure, so unparsed text is
 * left out while masking is on rather than leaked. */
function payloadPart(payload, masked, mask) {
  const { prop = null, raw = null, data, readAt, note } = payload || {};
  /* When the payload was read from the page for this bundle, and any caveat
   * about where it came from. Left out when the caller has neither. */
  const origin = {};
  if (readAt instanceof Date) origin.readAt = readAt.toISOString();
  if (note) origin.note = note;
  if (data !== undefined) return { prop, value: mask(data), ...origin };
  if (typeof raw !== 'string') return { prop, value: null, ...origin };
  if (masked) return { prop, value: null, ...origin, note: 'Not valid JSON, so it is left out while Mask values is on.' };
  return { prop, value: raw, ...origin, note: 'Not valid JSON; the raw text is included.' };
}

/* The payload history as it may leave: each read's time, step and size, and its
 * parsed value through `mask`. A read that is not JSON gives its text, or, with
 * masking on, only its length. */
function historyPart(history, masked, mask) {
  const list = Array.isArray(history) ? history.slice(-MAX_BUNDLE_SNAPSHOTS) : [];
  return list.map((snapshot) => {
    const raw = typeof snapshot.raw === 'string' ? snapshot.raw : '';
    const time = snapshot.time instanceof Date ? snapshot.time : new Date(snapshot.time);
    const entry = { time: Number.isNaN(time.getTime()) ? null : time.toISOString(), bytes: raw.length };
    if (snapshot.step && snapshot.step.name) {
      entry.step = snapshot.step.name;
      /* When that visit began, so "Since step entry" still works in a loaded session. */
      if (Number.isFinite(snapshot.step.visitFrom)) entry.stepFrom = snapshot.step.visitFrom;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    if (parsed !== undefined) entry.value = mask(parsed);
    else if (masked) entry.note = 'Not valid JSON, so only its length is given while Mask values is on.';
    else entry.raw = raw;
    return entry;
  });
}

/* One of the definition's two texts as it may leave. As read when masking is
 * off. With masking on, the answers a loaded script keeps in `response` and
 * `defaultValue` become placeholders (keys stay), which needs the structure:
 * text that is not an object is left out rather than leaked (null). */
function definitionText(text, masked) {
  if (!masked) return text;
  const parsed = parseObj(text);
  return parsed ? JSON.stringify(maskDefinitionValues(parsed)) : null;
}

/* The script's own definition: its structure, names, rules and settings, which
 * are not org data, so they go in as read (a loaded session needs them whole to
 * show the Structure tab). Only the answers it may hold are masked, while Mask
 * values is on. `read` holds the two property texts the page gave: { raw,
 * headerRaw }. */
function definitionPart(elements, read, masked) {
  const list = Array.isArray(elements) ? elements : [];
  const part = {
    elementCount: list.length,
    steps: list.filter((element) => element.category && element.category.key === 'step').map((element) => element.name)
  };
  const { raw, headerRaw } = read || {};
  const body = typeof raw === 'string' && raw ? definitionText(raw, masked) : null;
  const header = typeof headerRaw === 'string' && headerRaw ? definitionText(headerRaw, masked) : null;
  if (body) part.raw = body;
  if (header) part.headerRaw = header;
  if (masked && ((raw && !body) || (headerRaw && !header))) {
    part.note = 'Not valid JSON, so it is left out while Mask values is on.';
  }
  return part;
}

function scriptPart(script) {
  if (!script) return null;
  return { key: script.key || '', label: script.label || '', frame: script.frame === undefined ? null : script.frame };
}

/* The newest MAX_BUNDLE_CALLS calls that count: OmniStudio's only unless
 * `onlyOmni` is false, so a busy page's other Apex calls do not fill the room
 * the script's own calls need. Chosen before the newest are taken, not after. */
export function recentCalls(calls, onlyOmni) {
  if (!Array.isArray(calls)) return [];
  const kept = onlyOmni ? calls.filter((call) => call.omni !== false) : calls;
  return kept.slice(-MAX_BUNDLE_CALLS);
}

/* input: { now: Date, version, script, step, payload: { prop, raw, data, readAt?, note? },
 * elements, definition: { raw, headerRaw } (the jsonDef and scriptHeaderDef text as read), calls,
 * onlyOmni (calls: OmniStudio's only; true unless given as false),
 * masked, settings, panel: { width, height, theme },
 * history: [{ raw, time, step? }], tabs }. Any of them may be missing. `tabs`
 * is what each tab dumped through Shared.dumps(mask), already masked by them;
 * `settings` and `panel` hold switches and sizes, never org data. */
export function buildDebugBundle(input, mask = (value) => value) {
  const { now, version, script, step, payload, elements, definition, calls, onlyOmni = true, masked, settings, panel, history, tabs } = input;
  const recent = recentCalls(calls, onlyOmni !== false);
  return {
    generatedAt: now instanceof Date ? now.toISOString() : null,
    extensionVersion: version || null,
    masked: !!masked,
    panel: panel || null,
    settings: settings ? { ...settings } : null,
    script: scriptPart(script),
    step: step || null,
    payload: payloadPart(payload, !!masked, mask),
    history: historyPart(history, !!masked, mask),
    definition: definitionPart(elements, definition, !!masked),
    calls: exportEntries(recent, mask),
    tabs: tabs || {}
  };
}

/* A file name that sorts by time and has no characters a file system rejects. */
export function bundleFileName(now) {
  return `omniscript-debug-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}
