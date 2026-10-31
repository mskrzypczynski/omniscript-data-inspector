'use strict';

/* What Ctrl/Cmd+C puts on the clipboard from the JSON views when the selection
 * is small: a few highlighted characters, or just a caret inside a value. The
 * DOM side finds the pieces (selected text, which kind of value was touched,
 * the text either side of the caret); this decides what is copied, Mask
 * values included.
 *
 * Pure: no DOM, no chrome.*. */

import { MASK_STRING, MASK_NUMBER } from './mask.js';

/* Exactly the highlighted text of one row, never widened or reformatted. The
 * one exception is Mask values: a piece of a string or number is a fragment of
 * a value and is replaced by the same placeholder a whole value gets.
 * `kind` is the kind of value the selection touched: 'string', 'number', or
 * anything else (keys, booleans, null, punctuation) for text that is kept. */
export function fragmentCopyText(text, { masked = false, kind = 'plain' } = {}) {
  if (!masked || !text.trim()) return text;
  if (kind === 'string') return MASK_STRING;
  if (kind === 'number') return MASK_NUMBER;
  return text;
}

/* A caret is "inside the quotes" when an opening quote lies before it and
 * something (at least the closing quote) still follows. `before` and `after`
 * are the displayed text of the value either side of the caret. */
export function caretInQuotes(before, after) {
  return before.trimStart().startsWith('"') && after !== '';
}

/* The text for a whole value reached with a bare caret. A string is copied as
 * raw text when the caret is inside its quotes and as JSON (quoted) when it is
 * outside them; numbers, booleans and null as they read. null means there is
 * nothing to copy (an empty string). */
export function caretValueText({ kind, raw, inQuotes = true, masked = false }) {
  if (kind === 'string') {
    if (raw === '') return null;
    const text = masked ? MASK_STRING : raw;
    return inQuotes ? text : JSON.stringify(text);
  }
  if (kind === 'number') return masked ? MASK_NUMBER : String(raw);
  if (kind === 'boolean' || kind === 'null') return String(raw);
  return null;
}

/* The same decision for a line of the Raw view, where there is no structure to
 * ask: find the value on the line (after an optional "key":) and check the
 * caret is on it. Returns the arguments of caretValueText, or null when the
 * line has no value there or the caret is on the key or the punctuation. */
const VALUE_ON_LINE = /^(\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*)?)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)(,?\s*)$/;

export function rawLineValueAt(line, offset) {
  const match = VALUE_ON_LINE.exec(line);
  if (!match) return null;
  const [, head, token] = match;
  const start = head.length;
  const end = start + token.length;
  if (offset < start || offset > end) return null;

  if (token[0] === '"') {
    let raw;
    try { raw = JSON.parse(token); } catch { return null; }
    return { kind: 'string', raw, inQuotes: offset > start && offset < end };
  }
  if (token === 'true' || token === 'false') return { kind: 'boolean', raw: token };
  if (token === 'null') return { kind: 'null', raw: token };
  return { kind: 'number', raw: token };
}
