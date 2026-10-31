'use strict';

/* How much a call sends: the size of its input, which keys carry most of it,
 * and whether it is large enough to be worth a hint. A Data Mapper or a
 * procedure usually needs a few keys of the script's data, and a call that
 * sends all of it is slow in the browser and on the server.
 *
 * Pure: no DOM, no chrome.*. */

/* From these sizes (compact JSON, options not counted) the pane hints. */
export const WARN_BYTES = 100 * 1024;
export const STRONG_BYTES = 1024 * 1024;

/* How many keys "Largest:" names. */
export const LARGEST_KEYS = 5;

/* Length of a text as UTF-8, which is what goes over the wire. */
function utf8Length(text) {
  let bytes = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && at + 1 < text.length) { bytes += 4; at++; }
    else bytes += 3;
  }
  return bytes;
}

/* The compact JSON of a value; a string is measured as the text it is, and
 * what JSON cannot write (undefined, a cycle) counts as nothing. */
function measure(value) {
  if (typeof value === 'string') return utf8Length(value);
  return measureJson(value);
}

/* The compact JSON length of a value, a string with its quotes (a key's share
 * of an object is measured the way the object is written). */
function measureJson(value) {
  if (value === undefined || value === null) return 0;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : utf8Length(text);
  } catch {
    return 0;
  }
}

const levelOf = (bytes) => (bytes >= STRONG_BYTES ? 'strong' : bytes >= WARN_BYTES ? 'warn' : null);

/* The top-level keys (or positions, for an array) by size, biggest first;
 * ties keep their order. share is of the whole input, percent that rounded
 * and never 0 for a key that holds something. */
function largestOf(input, total) {
  if (!total || input === null || typeof input !== 'object') return [];
  const pairs = Array.isArray(input)
    ? input.map((item, at) => [String(at), item])
    : Object.keys(input).map((key) => [key, input[key]]);
  return pairs
    .map(([key, value], at) => ({ key, bytes: measureJson(value), at }))
    .filter((item) => item.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes || a.at - b.at)
    .slice(0, LARGEST_KEYS)
    .map(({ key, bytes }) => {
      const share = Math.min(1, bytes / total);
      return { key, bytes, share, percent: Math.max(1, Math.round(share * 100)) };
    });
}

/* The size of a call's input.
 *   bytes    compact JSON length in UTF-8 bytes (a text input: its own length)
 *   keys     how many top-level keys or items it has (0 for a text or a scalar)
 *   kind     'object', 'array', 'text' or 'empty'
 *   largest  the biggest top-level keys: [{ key, bytes, share, percent }]
 *   level    null, 'warn' (from 100 KB) or 'strong' (from 1 MB) */
export function inputSize(entry) {
  const input = entry && entry.action ? entry.action.input : undefined;
  const bytes = measure(input);
  const isEmpty = input === undefined || input === null || input === '';
  const container = input !== null && typeof input === 'object';
  return {
    bytes,
    keys: container ? (Array.isArray(input) ? input.length : Object.keys(input).length) : 0,
    kind: isEmpty ? 'empty' : Array.isArray(input) ? 'array' : container ? 'object' : 'text',
    largest: largestOf(input, bytes),
    level: levelOf(bytes)
  };
}

/* "850 B", "9.5 KB", "12 KB", "1.2 MB": one decimal under 10, none above. */
export function sizeText(bytes) {
  const count = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (count < 1024) return `${Math.round(count)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = count / 1024;
  let unit = 0;
  while (unit < units.length - 1 && Math.round(value * 10) / 10 >= 1024) { value /= 1024; unit++; }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded < 10 ? rounded.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/* The chip in the detail head, or null when the input is no cause for a hint. */
export function sizeChip(size) {
  if (!size.level) return null;
  const text = sizeText(size.bytes);
  return {
    level: size.level,
    text: `Input ${text}`,
    title: `This call sends ${text}; a Data Mapper or procedure usually needs only a few keys. sendJSONPath / sendJSONNode on the action limit what is sent.`
  };
}

const keyCount = (count, kind) => `${count} ${kind === 'array' ? 'item' : 'key'}${count === 1 ? '' : 's'}`;

/* "12 keys · 3.4 KB" for the Input tab; empty when there is no input. */
export function sizeLine(size) {
  if (size.kind === 'empty') return '';
  const bytes = sizeText(size.bytes);
  return size.kind === 'object' || size.kind === 'array' ? `${keyCount(size.keys, size.kind)} · ${bytes}` : bytes;
}

/* The size of an input in bytes and nothing else: no key breakdown, which
 * serialises every top-level value again. */
function inputBytes(entry) {
  return measure(entry && entry.action ? entry.action.input : undefined);
}

/* A record never changes, so its size is measured once. The selection bar asks
 * on every redraw; 500 calls of 2 MB would otherwise be serialised each time. */
const bytesOfRecord = new WeakMap();

function cachedBytes(entry) {
  if (!entry || typeof entry !== 'object') return inputBytes(entry);
  if (!bytesOfRecord.has(entry)) bytesOfRecord.set(entry, inputBytes(entry));
  return bytesOfRecord.get(entry);
}

/* How many of the calls have an input at or over the warn size. */
export function oversizedCount(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => cachedBytes(entry) >= WARN_BYTES).length;
}

/* "2 calls over 100 KB of input" for the selection bar; empty at none. */
export function oversizedText(count) {
  return count ? `${count} call${count === 1 ? '' : 's'} over ${sizeText(WARN_BYTES)} of input` : '';
}
