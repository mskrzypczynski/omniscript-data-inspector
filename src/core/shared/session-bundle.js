'use strict';

/* Reading a debug bundle back as a loaded session: checking that a file is
 * one, and turning it into what the top bar answers the tabs with (the
 * payload text, the definition text, the step, the history) and the one
 * picker entry that stands for it.
 *
 * The bundle is the shape core/shared/debug-bundle.js writes. Everything here is
 * best effort: a part that is missing gives nothing, not an error, because a
 * bundle may come from an older version or have been masked.
 *
 * Pure: no DOM, no chrome.*. */

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* The text of a file, as a bundle or the reason it is not one. */
export function parseBundle(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  const looksLikeOne = isObject(parsed) &&
    (isObject(parsed.payload) || isObject(parsed.script) || isObject(parsed.tabs) || Array.isArray(parsed.calls));
  if (!looksLikeOne) return { ok: false, error: 'That file is not a debug bundle. Open one saved with "Save a debug bundle".' };
  return { ok: true, bundle: parsed };
}

/* When the bundle was saved, or null. */
export function savedAt(bundle) {
  const time = new Date(isObject(bundle) ? bundle.generatedAt : NaN);
  return Number.isNaN(time.getTime()) ? null : time;
}

function scriptOf(bundle) {
  const script = isObject(bundle) && isObject(bundle.script) ? bundle.script : {};
  return {
    key: typeof script.key === 'string' ? script.key : '',
    label: typeof script.label === 'string' ? script.label : ''
  };
}

/* The one entry the picker shows while a session is loaded. */
export function sessionCaption(bundle, fileName) {
  const { key, label } = scriptOf(bundle);
  const name = key || label || 'Bundle';
  return fileName ? `${name} (loaded from ${fileName})` : name;
}

/* The unparsed text a payload carries when the page's value was not JSON and
 * Mask values was off (the bundle says so in `note`). */
function rawPayload(payload) {
  return typeof payload.value === 'string' && /^Not valid JSON/.test(String(payload.note || ''));
}

/* What a bundle's history holds, as the entries the panel's history keeps:
 * { raw, time, step? }, oldest first. A parsed value is written out again as
 * compact JSON (the text the page would hold); a read that could not be kept
 * (masked and not JSON) is left out. */
export function sessionHistory(bundle) {
  const list = isObject(bundle) && Array.isArray(bundle.history) ? bundle.history : [];
  const out = [];
  list.forEach((entry) => {
    if (!isObject(entry)) return;
    let raw = null;
    if (entry.value !== undefined) raw = JSON.stringify(entry.value);
    else if (typeof entry.raw === 'string') raw = entry.raw;
    if (typeof raw !== 'string') return;
    if (out.length && out[out.length - 1].raw === raw) return;
    const time = new Date(entry.time);
    const snapshot = { raw, time: Number.isNaN(time.getTime()) ? new Date(0) : time };
    if (typeof entry.step === 'string' && entry.step) {
      snapshot.step = { name: entry.step, visitFrom: Number.isFinite(entry.stepFrom) ? entry.stepFrom : null };
    }
    out.push(snapshot);
  });
  return out;
}

/* The step visits the bundle was saved with, as Structure keeps them
 * ([{ key, name, from, to }], oldest first, `to` null for the step still open):
 * what says which step each call was made on. A visit without a start time
 * cannot place a call and is left out; a bundle without visits gives none, so
 * a loaded session never borrows the live script's. */
export function sessionVisits(bundle) {
  const step = isObject(bundle) && isObject(bundle.step) ? bundle.step : null;
  const list = step && Array.isArray(step.visits) ? step.visits : [];
  return list.filter((visit) => isObject(visit) && Number.isFinite(visit.from)).map((visit) => ({
    key: typeof visit.key === 'string' ? visit.key : '',
    name: typeof visit.name === 'string' ? visit.name : '',
    from: visit.from,
    to: Number.isFinite(visit.to) ? visit.to : null
  }));
}

/* The data property's text: the payload the bundle holds, else the newest read
 * of its history. null when the bundle has neither. */
export function payloadText(bundle) {
  const payload = isObject(bundle) && isObject(bundle.payload) ? bundle.payload : null;
  if (payload && payload.value !== undefined && payload.value !== null) {
    return rawPayload(payload) ? payload.value : JSON.stringify(payload.value);
  }
  const newest = sessionHistory(bundle).at(-1);
  return newest ? newest.raw : null;
}

/* The definition and header text the bundle holds, each a string or null. */
export function definitionTexts(bundle) {
  const definition = isObject(bundle) && isObject(bundle.definition) ? bundle.definition : {};
  return {
    raw: typeof definition.raw === 'string' && definition.raw ? definition.raw : null,
    headerRaw: typeof definition.headerRaw === 'string' && definition.headerRaw ? definition.headerRaw : null
  };
}

/* The step the script was on, as the definition's asIndex, or null. */
export function sessionAsIndex(bundle) {
  const step = isObject(bundle) && isObject(bundle.step) ? bundle.step : null;
  return step && Number.isInteger(step.asIndex) ? step.asIndex : null;
}

/* What the page would have answered for one property, from the bundle.
 * `props` are the top bar's property names: { data, def }. The data property
 * (or the one the bundle was saved with) gets the payload, the definition
 * property the definition, scriptHeaderDef the header; anything else nothing. */
export function sessionAnswer(bundle, which, props) {
  const { raw, headerRaw } = definitionTexts(bundle);
  if (which === 'scriptHeaderDef') return headerRaw;
  if (which === props.def) return raw;
  const saved = isObject(bundle) && isObject(bundle.payload) ? bundle.payload.prop : null;
  if (which === props.data || (saved && which === saved)) return payloadText(bundle);
  return null;
}

/* The picker's host for a loaded bundle, in the shape a scanned host has. */
export function sessionHost(bundle, fileName) {
  const { key, label } = scriptOf(bundle);
  const data = payloadText(bundle);
  const { raw } = definitionTexts(bundle);
  return {
    index: 0,
    label: label || key || 'bundle',
    key,
    frame: '',
    local: 0,
    dataLen: data ? data.length : 0,
    defLen: raw ? raw.length : 0,
    top: true,
    session: true,
    caption: sessionCaption(bundle, fileName)
  };
}
