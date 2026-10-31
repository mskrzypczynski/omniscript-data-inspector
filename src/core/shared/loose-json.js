'use strict';

/* Reading text that is nearly JSON: what people paste from a debug log or a
 * script. On top of JSON it accepts single-quoted strings and keys, unquoted
 * keys, trailing commas, // and block comments, = in place of : and bare words
 * as strings (Apex's map notation, {Name=Ada, Age=36}), and (a, b) as a list
 * (how Apex prints a List). Nothing else: a key without a value, two values
 * with nothing between them, or plain prose is still refused, so a typo is not
 * read as data.
 *
 *   parseLoose(text) -> { ok: true, value, loose: [what was accepted] }
 *                    or { ok: false, error, line, column }
 *
 * `loose` is empty for text that is JSON already. Never throws.
 *
 * Pure: no DOM, no chrome.*. */

const MAX_DEPTH = 200;

/* What `loose` can hold, in the order it is reported. */
export const LOOSE_WORDS = [
  'single quotes', 'unquoted keys', 'trailing commas', 'comments', '= separators', 'bare words', 'parenthesised lists'
];

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const KEY_CHARS = /[^\s:=,{}[\]()"']/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"', "'": "'" };

/* Where an index is: a line and column of the text, counted as the strict
 * parser counts them. */
function placeOf(text, position) {
  const before = text.slice(0, Math.min(position, text.length));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/* A key named __proto__ is data here, not the prototype. */
function put(object, key, value) {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
}

/* What an unquoted word means: true, false, null and numbers as they read,
 * anything else is text. */
function meaning(word) {
  if (word === 'true') return { value: true };
  if (word === 'false') return { value: false };
  if (word === 'null') return { value: null };
  if (NUMBER.test(word)) return { value: Number(word) };
  return { value: word, text: true };
}

export function parseLoose(text) {
  const source = String(text === undefined || text === null ? '' : text);
  const found = new Set();
  let at = 0;

  const fail = (index = at) => { throw index; };

  /* Whitespace and comments. */
  function skip() {
    for (;;) {
      while (at < source.length && ' \t\r\n'.includes(source[at])) at += 1;
      if (source[at] === '/' && source[at + 1] === '/') {
        found.add('comments');
        while (at < source.length && source[at] !== '\n') at += 1;
      } else if (source[at] === '/' && source[at + 1] === '*') {
        found.add('comments');
        const end = source.indexOf('*/', at + 2);
        if (end < 0) fail(source.length);
        at = end + 2;
      } else return;
    }
  }

  function string(quote) {
    if (quote === "'") found.add('single quotes');
    at += 1;
    let out = '';
    while (at < source.length && source[at] !== quote) {
      const ch = source[at];
      if (ch === '\\') {
        at += 1;
        if (source[at] === 'u') {
          const hex = source.slice(at + 1, at + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(at);
          out += String.fromCharCode(parseInt(hex, 16));
          at += 5;
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(ESCAPES, source[at] || '')) fail(at);
        out += ESCAPES[source[at]];
        at += 1;
        continue;
      }
      if (ch < ' ') fail(at);
      out += ch;
      at += 1;
    }
    if (source[at] !== quote) fail(source.length);
    at += 1;
    return out;
  }

  /* A word with no quotes: up to a comma or the closer, and (where text may
   * hold spaces, as in an Apex map) trimmed; otherwise up to the next space. */
  function bare(closer, spaces) {
    const start = at;
    const stops = spaces ? [',', closer] : [',', '}', ']', ')'];
    while (at < source.length && !stops.includes(source[at]) && (spaces || !/\s/.test(source[at]))) {
      if (!spaces && (source[at] === ':' || source[at] === '=')) break;
      if (spaces && source[at] === '\n') break;
      at += 1;
    }
    const word = source.slice(start, at).trim();
    if (!word && !spaces) fail(start);
    const read = meaning(word);
    /* A word is text only where Apex writes it (after =, or in a (…) list);
     * after a colon it is a typo (tru, True), not data. */
    if (read.text && !spaces) fail(start);
    if (read.text) found.add('bare words');
    return read.value;
  }

  function key() {
    const ch = source[at];
    if (ch === '"' || ch === "'") return string(ch);
    const start = at;
    while (at < source.length && KEY_CHARS.test(source[at])) at += 1;
    if (at === start) fail(start);
    found.add('unquoted keys');
    return source.slice(start, at);
  }

  function object(depth) {
    if (depth > MAX_DEPTH) fail();
    at += 1;
    const out = {};
    let spaces = false; // an Apex map: its values may hold spaces
    skip();
    if (source[at] === '}') { at += 1; return out; }
    for (;;) {
      skip();
      const name = key();
      skip();
      if (source[at] === ':') at += 1;
      else if (source[at] === '=') { found.add('= separators'); spaces = true; at += 1; } else fail();
      put(out, name, value(depth + 1, '}', spaces));
      skip();
      if (source[at] === ',') {
        at += 1;
        skip();
        if (source[at] === '}') { found.add('trailing commas'); at += 1; return out; }
        continue;
      }
      if (source[at] === '}') { at += 1; return out; }
      fail();
    }
  }

  function list(depth, closer, spaces) {
    if (depth > MAX_DEPTH) fail();
    if (closer === ')') found.add('parenthesised lists');
    at += 1;
    const out = [];
    skip();
    if (source[at] === closer) { at += 1; return out; }
    for (;;) {
      out.push(value(depth + 1, closer, spaces || closer === ')'));
      skip();
      if (source[at] === ',') {
        at += 1;
        skip();
        if (source[at] === closer) { found.add('trailing commas'); at += 1; return out; }
        continue;
      }
      if (source[at] === closer) { at += 1; return out; }
      fail();
    }
  }

  /* `closer` is null at the top, where only JSON's own values and the
   * containers are read: a bare word has no business being the whole text. */
  function value(depth, closer, spaces) {
    skip();
    const ch = source[at];
    if (ch === undefined) fail(source.length);
    if (ch === '{') return object(depth);
    if (ch === '[') return list(depth, ']', spaces);
    if (ch === '(') return list(depth, ')', true);
    if (ch === '"' || ch === "'") return string(ch);
    if (closer === null) {
      const word = /^[^\s,{}[\]()]+/.exec(source.slice(at));
      const read = word ? meaning(word[0]) : null;
      if (!read || read.text) fail();
      at += word[0].length;
      return read.value;
    }
    return bare(closer, spaces);
  }

  try {
    const result = value(0, null, false);
    skip();
    if (at < source.length) fail();
    return { ok: true, value: result, loose: LOOSE_WORDS.filter((word) => found.has(word)) };
  } catch (index) {
    const where = placeOf(source, typeof index === 'number' ? index : source.length);
    const end = typeof index !== 'number' || index >= source.length;
    return {
      ok: false,
      error: end ? 'Unexpected end of text' : `Unexpected ${JSON.stringify(source[index])}`,
      line: where.line,
      column: where.column
    };
  }
}
