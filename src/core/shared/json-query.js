'use strict';

/* A small JSONPath-like query over a payload, for the Data tab's filter box
 * (a filter that starts with $) and for watch expressions.
 *
 *   $.Step.Rows[*].Code    a key, every item of a list
 *   $..Code                a key at any depth below
 *   $.Rows[2]  $.Rows[-1]  an item (counted from 0, as in JSON; negative from the end)
 *   $.Rows[1:3]            items 1 and 2 (either end may be left out)
 *   $.*.Name               every child (of an object or a list)
 *   $["a.b"]  $['a b']     a key written in quotes: dots, spaces and colons are fine
 *   $..*  $..[0]           every descendant; an item at any depth
 *
 * Not supported, so such a text is not a query: filters and expressions
 * (?(@.Qty>1)), unions ([0,2]), a bare $. A key written without quotes is
 * matched ignoring case when no key has exactly that spelling; a quoted key is
 * matched exactly.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer } from './json-tree-model.js';

/* Past this many matches the search stops and says so. */
export const QUERY_MAX_MATCHES = 5000;
const MAX_VISITS = 500000;
const MAX_DEPTH = 100;

const sameName = (a, b) => a === b || a.toLowerCase() === b.toLowerCase();

/* ----------------------------------------------------------------- parse */

/* A quoted key starting at text[at] (the quote). Returns { value, end } with
 * end just past the closing quote, or null. A backslash takes the next
 * character literally. */
function readQuoted(text, at) {
  const quote = text[at];
  let value = '';
  let i = at + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { value += text[i + 1]; i += 2; continue; }
    if (c === quote) return { value, end: i + 1 };
    value += c;
    i++;
  }
  return null;
}

/* The [...] starting at text[at]. Returns { step, end } or null. */
function readBracket(text, at, deep) {
  let i = at + 1;
  while (text[i] === ' ') i++;
  if (text[i] === '"' || text[i] === "'") {
    const quoted = readQuoted(text, i);
    if (!quoted) return null;
    i = quoted.end;
    while (text[i] === ' ') i++;
    if (text[i] !== ']') return null;
    return { step: { op: 'key', name: quoted.value, exact: true, deep }, end: i + 1 };
  }
  const close = text.indexOf(']', i);
  if (close < 0) return null;
  const body = text.slice(i, close).trim();
  const end = close + 1;
  if (body === '*') return { step: { op: 'all', deep }, end };
  if (/^-?\d+$/.test(body)) return { step: { op: 'index', index: Number(body), deep }, end };
  const slice = /^(-?\d+)?\s*:\s*(-?\d+)?$/.exec(body);
  if (slice) {
    return {
      step: {
        op: 'slice',
        from: slice[1] === undefined ? null : Number(slice[1]),
        to: slice[2] === undefined ? null : Number(slice[2]),
        deep
      },
      end
    };
  }
  return null;
}

/* A key written after a dot: everything up to the next . or [. */
function readName(text, at) {
  let i = at;
  while (i < text.length && text[i] !== '.' && text[i] !== '[') i++;
  return { name: text.slice(at, i).trim(), end: i };
}

/* The steps of a query, or null when the text is not one. */
export function parseQuerySteps(input) {
  const text = String(input === undefined || input === null ? '' : input).trim();
  if (text[0] !== '$' || text.length < 2) return null;
  const steps = [];
  let i = 1;
  while (i < text.length) {
    if (text[i] === '[') {
      const bracket = readBracket(text, i, false);
      if (!bracket) return null;
      steps.push(bracket.step);
      i = bracket.end;
      continue;
    }
    if (text[i] !== '.') return null;
    i++;
    const deep = text[i] === '.';
    if (deep) i++;
    if (text[i] === '[') {
      if (!deep) return null;
      const bracket = readBracket(text, i, true);
      if (!bracket) return null;
      steps.push(bracket.step);
      i = bracket.end;
    } else if (text[i] === '*') {
      steps.push({ op: 'all', deep });
      i++;
    } else {
      const { name, end } = readName(text, i);
      if (!name) return null;
      steps.push({ op: 'key', name, exact: false, deep });
      i = end;
    }
  }
  return steps.length ? steps : null;
}

/* ------------------------------------------------------------------- run */

/* Only the root's own children are joined bare: a key called '' keeps the
 * path '' and what lies below it still needs its separator. */
const join = (path, key, parent, root) => (path === '' && parent === root ? key : path + SEP + key);

/* The children of a node a step picks: [[key, child], ...]. */
function pick(node, step) {
  if (!isContainer(node)) return [];
  const isArray = Array.isArray(node);
  if (step.op === 'all') return isArray ? node.map((child, i) => [String(i), child]) : Object.keys(node).map((key) => [key, node[key]]);
  if (step.op === 'key') {
    if (isArray) return [];
    if (Object.prototype.hasOwnProperty.call(node, step.name)) return [[step.name, node[step.name]]];
    if (step.exact) return [];
    return Object.keys(node).filter((key) => sameName(key, step.name)).map((key) => [key, node[key]]);
  }
  if (!isArray) return [];
  const { length } = node;
  if (step.op === 'index') {
    const at = step.index < 0 ? length + step.index : step.index;
    return at >= 0 && at < length ? [[String(at), node[at]]] : [];
  }
  /* slice */
  const clamp = (value, fallback) => {
    if (value === null) return fallback;
    const at = value < 0 ? length + value : value;
    return Math.min(Math.max(at, 0), length);
  };
  const out = [];
  for (let i = clamp(step.from, 0); i < clamp(step.to, length); i++) out.push([String(i), node[i]]);
  return out;
}

/* Every match of the steps, in tree order and without repeats:
 * { paths, capped }. paths are tree paths (the SEP-joined keys of the
 * payload); capped says the search stopped early. */
function run(data, steps) {
  let frontier = [['', data]];
  let capped = false;
  let visits = 0;

  steps.forEach((step) => {
    const next = new Map();
    let full = false; // this step has all it may hold
    const add = (path, value) => {
      if (next.size >= QUERY_MAX_MATCHES) { capped = true; full = true; return false; }
      if (!next.has(path)) next.set(path, value);
      return true;
    };
    /* The node's own picks and, for a .. step, everything beneath it, kept in
     * tree order: a pick is added where its key comes among the children. */
    const apply = (node, path, depth) => {
      if (full || ++visits > MAX_VISITS) { if (!full) capped = true; return; }
      const picks = pick(node, step);
      if (!step.deep || depth >= MAX_DEPTH || !isContainer(node)) {
        for (const [key, child] of picks) if (!add(join(path, key, node, data), child)) return;
        return;
      }
      const picked = new Map(picks);
      const entries = Array.isArray(node) ? node.map((child, i) => [String(i), child]) : Object.keys(node).map((key) => [key, node[key]]);
      for (const [key, child] of entries) {
        if (picked.has(key) && !add(join(path, key, node, data), child)) return;
        apply(child, join(path, key, node, data), depth + 1);
      }
    };
    frontier.forEach(([path, node]) => apply(node, path, 0));
    frontier = [...next];
  });

  return { paths: frontier.map(([path]) => path), capped };
}

/* The tree paths a query matches in the data. `query` is the filter's parsed
 * { kind: 'query', steps } or the text itself; anything else matches nothing. */
export function queryPaths(data, query) {
  const steps = typeof query === 'string' ? parseQuerySteps(query) : (query && query.kind === 'query' ? query.steps : null);
  if (!steps || data === undefined) return { paths: [], capped: false };
  return run(data, steps);
}
