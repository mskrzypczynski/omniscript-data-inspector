'use strict';

/* What the Data tab's filter box means. Besides plain text it takes
 *   an OmniScript path     Step:Rows|2:Field   (|N counts from 1)
 *   key=value              Name=Ada            (a key at any depth, or a path
 *                                               as the key: Step:Name=Ada)
 *   $ query                $.Step.Rows[*].Code, $..Code, $.Rows[-1], $.Rows[1:3]
 *                          ($ query, see json-query.js)
 * Anything that is not one of those, or that finds nothing, is searched as
 * plain text, so typing never leaves the user with an empty tree for a query
 * that merely looked like a path.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, isContainer, addAllPaths, joinPath } from './json-tree-model.js';
import { omniPath } from './path-links.js';
import { parseQuerySteps, queryPaths } from './json-query.js';

export { queryPaths };

const SEGMENT = /^([^:|=]+?)(?:\|(\d+))?$/;

/* "Step", "Rows|2" -> { name, index } (index counted from 1, or null). */
function parseSegments(text) {
  const parts = text.split(':').map((part) => part.trim());
  const segments = [];
  for (const part of parts) {
    const match = SEGMENT.exec(part);
    if (!match || (match[2] !== undefined && Number(match[2]) < 1)) return null;
    segments.push({ name: match[1].trim(), index: match[2] === undefined ? null : Number(match[2]) });
  }
  return segments;
}

function parseValue(text) {
  const value = text.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  return value;
}

/* { kind: 'text', text } | { kind: 'path', segments } |
 * { kind: 'keyValue', segments, value } | { kind: 'query', text, steps }.
 * A $ that does not make a query ($, $1,000) is read like any other text. */
export function parseFilter(input) {
  const text = String(input === undefined || input === null ? '' : input);
  const plain = { kind: 'text', text };
  const trimmed = text.trim();
  if (!trimmed) return plain;

  /* Before the = and : rules below: a query may hold both ($["a:b"]). */
  const steps = trimmed.startsWith('$') ? parseQuerySteps(trimmed) : null;
  if (steps) return { kind: 'query', text: trimmed, steps };

  const equals = trimmed.indexOf('=');
  if (equals > 0) {
    const segments = parseSegments(trimmed.slice(0, equals));
    if (segments) return { kind: 'keyValue', segments, value: parseValue(trimmed.slice(equals + 1)) };
    return plain;
  }

  if (trimmed.includes(':') || trimmed.includes('|')) {
    const segments = parseSegments(trimmed);
    if (segments) return { kind: 'path', segments };
  }
  return plain;
}

/* "Step:Rows|2:Code" -> [{ name, index }] (index from 1, or null), or null when
 * the text is not a path. For code that takes a path of its own (the watch
 * expressions) rather than a filter. */
export function parsePathSegments(text) {
  const trimmed = String(text === undefined || text === null ? '' : text).trim();
  return trimmed ? parseSegments(trimmed) : null;
}

const sameName = (a, b) => a === b || a.toLowerCase() === b.toLowerCase();

function keyOf(node, name) {
  const keys = Object.keys(node);
  return keys.includes(name) ? name : keys.find((key) => sameName(key, name));
}

/* Every node a path leads to, as tree paths. A step without |N that meets an
 * array and still has steps to go looks in every row. */
function resolve(data, segments) {
  const found = [];
  /* Under the root a key called '' keeps the path '', so only the root's own
   * children are joined bare. */
  const join = (path, key, parent) => (path === '' && parent === data ? key : path + SEP + key);

  const walk = (node, path, at) => {
    if (at === segments.length) { found.push(path); return; }
    if (!isContainer(node) || Array.isArray(node)) return;
    const { name, index } = segments[at];
    const key = keyOf(node, name);
    if (key === undefined) return;
    const child = node[key];
    const childPath = join(path, key, node);

    if (index !== null) {
      if (Array.isArray(child) && index <= child.length) walk(child[index - 1], join(childPath, index - 1, child), at + 1);
      return;
    }
    if (Array.isArray(child) && at + 1 < segments.length) {
      child.forEach((row, i) => walk(row, join(childPath, i, child), at + 1));
      return;
    }
    walk(child, childPath, at + 1);
  };

  walk(data, '', 0);
  return found;
}

/* Nodes at any depth reached through a key called `name`. */
function resolveAnywhere(data, name) {
  const found = [];
  const walk = (node, path, depth) => {
    if (!isContainer(node) || depth > 60) return;
    const isArray = Array.isArray(node);
    Object.keys(node).forEach((key) => {
      const childPath = joinPath(path, key, depth);
      if (!isArray && sameName(key, name)) found.push(childPath);
      walk(node[key], childPath, depth + 1);
    });
  };
  walk(data, '', 0);
  return found;
}

const at = (data, path) => (path ? path.split(SEP) : []).reduce((node, key) => (isContainer(node) ? node[key] : undefined), data);

const valueMatches = (node, wanted) => {
  if (wanted === '') return true;
  if (isContainer(node)) return false;
  return String(node).toLowerCase() === String(wanted).toLowerCase();
};

/* Every tree path a list of segments leads to, in the filter's sense: a single
 * name is looked for at any depth, a longer path from the root (a step without
 * |N that meets a list looks in every row). */
export function findPaths(data, segments) {
  if (data === undefined || !segments || !segments.length) return [];
  if (segments.length === 1 && segments[0].index === null) return resolveAnywhere(data, segments[0].name);
  return resolve(data, segments);
}

/* The rows a structured query lets through: each match, the way down to it
 * and everything under it. null for plain text, and for a path or key=value
 * that matches nothing (the caller then searches the text instead). A $ query
 * that matches nothing is not text: it comes back with no rows
 * ({ matches: 0, visible: empty }) so the caller can say so. `capped` says the
 * query stopped at its match limit. */
export function queryMatches(data, query) {
  if (!query || query.kind === 'text' || data === undefined) return null;

  let paths;
  let capped = false;
  if (query.kind === 'query') ({ paths, capped } = queryPaths(data, query));
  else if (query.kind === 'path') paths = resolve(data, query.segments);
  else paths = findPaths(data, query.segments);
  if (query.kind === 'keyValue') paths = paths.filter((path) => valueMatches(at(data, path), query.value));
  if (!paths.length) return query.kind === 'query' ? { visible: new Set(), matches: 0, paths, capped } : null;

  const visible = new Set(['']);
  paths.forEach((path) => {
    const parts = path.split(SEP);
    for (let i = 1; i < parts.length; i++) visible.add(parts.slice(0, i).join(SEP));
    addAllPaths(at(data, path), path, visible, 0);
  });
  return { visible, matches: paths.length, paths, capped };
}

/* What the filter box holds after "Filter to this key": `Name=` lists every
 * place that key appears, where plain text would also find the word in values.
 * A key the filter syntax would read differently (it holds = : | or starts with
 * $) stays plain text. */
export function filterForKey(key) {
  const name = String(key === undefined || key === null ? '' : key);
  if (!name.trim() || /[=:|]/.test(name) || name.trim().startsWith('$') || name !== name.trim()) return name;
  return `${name}=`;
}

/* The merge field for a place in the payload: %Step:Rows|2:Field%. */
export function mergeField(data, treePath) {
  const path = omniPath(data, treePath);
  return path ? `%${path}%` : '';
}
