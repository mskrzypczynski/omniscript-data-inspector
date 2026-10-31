'use strict';

/* The watch list kept between DevTools sessions (only while Remember my
 * settings is on): what is written to extension storage, and what is accepted
 * back from it. The storage entry is
 *
 *   pins: { [scriptKey]: { paths: [...], expressions: [...], notify: [...] } }
 *
 * scriptKey is the script's Type/SubType/Language. paths are the watched tree
 * paths (names from the script and row positions, never values), expressions
 * the typed expressions' text, notify the paths and expressions (written as
 * watch-expr.js's expressionId) that have their bell on. Everything coming
 * back is checked: only text, bounded in number and length, so a stored object
 * from another version or edited by hand cannot inject anything.
 *
 * Pure: no DOM, no chrome.*. */

import { scriptIdentity } from '../shared/script-identity.js';
import { parseExpression, expressionId, MAX_EXPRESSIONS } from './watch-expr.js';
import { isGonePin } from './pin-follow.js';

export const PINS_KEY = 'pins';

/* The scripts kept (the least recently changed are dropped first) and the
 * watched paths of each. */
export const MAX_SCRIPTS = 50;
export const MAX_PATHS = 50;

const MAX_TEXT = 1000;
const MAX_KEY = 300;

/* What a script is stored under: its Type/SubType/Language, or '' when the
 * script has none to tell it apart (then nothing is kept for it). */
export function pinsKey(host) {
  const identity = scriptIdentity(host);
  const key = identity && typeof identity.key === 'string' ? identity.key.trim() : '';
  return key && key.length <= MAX_KEY ? key : '';
}

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;

/* The strings of a list, each once, in order, at most `limit` of them. */
function texts(list, limit, keep = () => true) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    if (out.length >= limit || !isText(item) || seen.has(item) || !keep(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

/* A path that cannot be a real pin: one that starts with the character an
 * expression's id starts with (it would collide with that expression's bell and
 * row), or that points at a removed row (never written, see pins-memory.js). */
const isForeignPath = (path) => path.charCodeAt(0) === 2 || isGonePin(path);

/* One script's entry made safe: { paths, expressions, notify }. An expression
 * that no longer parses is dropped, and a bell only stays on for something
 * that is kept. */
function cleanEntry(entry) {
  const empty = { paths: [], expressions: [], notify: [] };
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return empty;
  const paths = texts(entry.paths, MAX_PATHS, (path) => !isForeignPath(path));
  const expressions = texts(entry.expressions, MAX_EXPRESSIONS, (text) => !parseExpression(text).error);
  const bells = new Set([...paths, ...expressions.map(expressionId)]);
  return { paths, expressions, notify: texts(entry.notify, MAX_PATHS + MAX_EXPRESSIONS, (item) => bells.has(item)) };
}

const isEmpty = (entry) => !entry.paths.length && !entry.expressions.length;

/* The whole `pins` entry to store after the watch list of the script `key`
 * became `list` ({ paths, expressions, notify }): the others as they were
 * (only what is valid), this one last, so the oldest go first once there are
 * more than MAX_SCRIPTS. A script with nothing watched is left out; an empty
 * object means there is nothing to store at all. */
export function pinsToWrite(stored, key, list) {
  const next = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    Object.keys(stored).forEach((name) => {
      if (name === key || !name || name.length > MAX_KEY || name === '__proto__') return;
      const entry = cleanEntry(stored[name]);
      if (!isEmpty(entry)) next[name] = entry;
    });
  }
  if (key && typeof key === 'string' && key.length <= MAX_KEY && key !== '__proto__') {
    const entry = cleanEntry(list);
    if (!isEmpty(entry)) next[key] = entry;
  }
  const names = Object.keys(next);
  names.slice(0, Math.max(0, names.length - MAX_SCRIPTS)).forEach((name) => { delete next[name]; });
  return next;
}

/* The watch list to put back for the script `key`: { paths, expressions,
 * notify }, all empty when nothing valid is stored for it. */
export function pinsToRestore(stored, key) {
  const none = { paths: [], expressions: [], notify: [] };
  if (!key || !stored || typeof stored !== 'object' || Array.isArray(stored)) return none;
  if (!Object.prototype.hasOwnProperty.call(stored, key)) return none;
  return cleanEntry(stored[key]);
}
