'use strict';

/* Walking two JSON values side by side and reporting what differs. Both the
 * list of differences between two payloads (diff.js) and the marks on the
 * Data tree (changes.js) are built from this one walk, so they always agree.
 *
 * Arrays are the hard part. Comparing them position by position turns one
 * removed row into a change in every row after it, so rows are lined up first:
 *   1. by identity, when every row is an object with the same unique
 *      Id / id / Name / name / key / Key;
 *   2. otherwise by content: rows the two arrays share at the start and the
 *      end are matched, and the rows in between by a longest common
 *      subsequence when both stretches are small (up to 200 rows);
 *   3. whatever is left over in a stretch is paired by position.
 * A row with no partner is reported whole, as 'row-added' or 'row-removed'.
 *
 * Pure: no DOM, no chrome.*. */

const isContainer = (value) => value !== null && typeof value === 'object';

/* In the order they are preferred. */
const IDENTITY_KEYS = ['Id', 'id', 'Name', 'name', 'key', 'Key'];

/* Longest stretch of unmatched rows the content match will try to align. */
export const LCS_MAX_ROWS = 200;

const MAX_DEPTH = 60;

function usableId(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/* Does every row of the array carry `key` with an id that no other row has? */
function uniqueIdsBy(rows, key) {
  const seen = new Set();
  for (const row of rows) {
    if (!isContainer(row) || Array.isArray(row)) return false;
    const id = usableId(row[key]);
    if (id === null || seen.has(id)) return false;
    seen.add(id);
  }
  return rows.length > 0;
}

/* The identity key of a list of rows, or null. */
export function identityKey(rows) {
  return IDENTITY_KEYS.find((key) => uniqueIdsBy(rows, key)) || null;
}

/* The key both arrays can be lined up by, or null. */
function sharedIdentityKey(a, b) {
  return IDENTITY_KEYS.find((key) => uniqueIdsBy(a, key) && uniqueIdsBy(b, key)) || null;
}

const hashOf = (row) => String(JSON.stringify(row));

/* Longest common subsequence of two lists of strings; returns the matched
 * pairs [indexInA, indexInB] in order. */
function lcsPairs(x, y) {
  const n = x.length;
  const m = y.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { pairs.push([i, j]); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
  }
  return pairs;
}

/* Rows that appear in both arrays, as ordered [indexInA, indexInB] pairs. The
 * positions left out are the rows with no partner (before the by-position
 * pairing of `alignRows`). `how` says which rule lined them up. */
function matchRows(a, b) {
  const key = sharedIdentityKey(a, b);
  if (key) {
    const where = new Map(b.map((row, j) => [String(row[key]), j]));
    const pairs = [];
    a.forEach((row, i) => {
      const j = where.get(String(row[key]));
      if (j !== undefined) pairs.push([i, j]);
    });
    return { pairs, key, positional: false };
  }

  const x = a.map(hashOf);
  const y = b.map(hashOf);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endA = x.length;
  let endB = y.length;
  while (endA > start && endB > start && x[endA - 1] === y[endB - 1]) { endA--; endB--; }

  const pairs = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  if (endA - start <= LCS_MAX_ROWS && endB - start <= LCS_MAX_ROWS) {
    lcsPairs(x.slice(start, endA), y.slice(start, endB)).forEach(([i, j]) => pairs.push([start + i, start + j]));
  }
  for (let k = 0; k < x.length - endA; k++) pairs.push([endA + k, endB + k]);
  return { pairs, key: null, positional: true };
}

/* The rows of two arrays lined up, in reading order, as a list of
 *   { a: i, b: j }   the same row (or a changed version of it)
 *   { a: i }         only in the first array
 *   { b: j }         only in the second
 * `key` is the identity key used, if any. */
export function alignRows(a, b) {
  const { pairs, key, positional } = matchRows(a, b);
  const partnerOf = new Array(a.length).fill(-1);
  const bMatched = new Set();
  pairs.forEach(([i, j]) => { partnerOf[i] = j; bMatched.add(j); });

  const ops = [];
  let removed = []; // rows of a with no partner since the last match
  let cursor = 0; // rows of b before this are done

  /* Between two matches. With no identity to go by, unmatched rows facing each
   * other are taken to be the same row edited, so they are paired by position. */
  const flush = (upToB) => {
    const added = [];
    for (; cursor < upToB; cursor++) if (!bMatched.has(cursor)) added.push(cursor);
    const paired = positional ? Math.min(removed.length, added.length) : 0;
    for (let k = 0; k < paired; k++) ops.push({ a: removed[k], b: added[k] });
    removed.slice(paired).forEach((index) => ops.push({ a: index }));
    added.slice(paired).forEach((index) => ops.push({ b: index }));
    removed = [];
  };

  a.forEach((row, i) => {
    if (partnerOf[i] === -1) { removed.push(i); return; }
    flush(partnerOf[i]);
    ops.push({ a: i, b: partnerOf[i] });
    cursor = Math.max(cursor, partnerOf[i] + 1);
  });
  flush(b.length);
  return { ops, key };
}

/* Walk a and b. `emit` is called for each difference with
 *   { parts, kind, before, after, index?, identity? }
 * where parts are the keys from the root (array positions as numbers) and
 * kind is 'changed', 'added', 'removed', 'row-added' or 'row-removed'. A
 * matched row is reported at its position in b; a removed row at its position
 * in a. Return true from `emit` to stop the walk. */
export function walkDiff(a, b, emit) {
  let stopped = false;
  const report = (entry) => {
    if (stopped) return;
    if (emit(entry) === true) stopped = true;
  };

  const isRecord = (value) => value !== null && typeof value === 'object';

  function walkArrays(x, y, parts, depth) {
    const { ops, key } = alignRows(x, y);
    ops.forEach((op) => {
      if (stopped) return;
      if (op.a !== undefined && op.b !== undefined) { walk(x[op.a], y[op.b], parts.concat(op.b), depth + 1); return; }
      /* "row" is for a record that came or went; a scalar in a list of tags or
       * ids reads better as a plain added or removed value. */
      if (op.a !== undefined) {
        report({ parts: parts.concat(op.a), kind: isRecord(x[op.a]) ? 'row-removed' : 'removed', before: x[op.a], after: undefined, index: op.a,
          identity: key ? `${key}=${x[op.a][key]}` : undefined });
      } else {
        report({ parts: parts.concat(op.b), kind: isRecord(y[op.b]) ? 'row-added' : 'added', before: undefined, after: y[op.b], index: op.b,
          identity: key ? `${key}=${y[op.b][key]}` : undefined });
      }
    });
  }

  function walk(x, y, parts, depth) {
    if (stopped) return;
    if (!isContainer(x) || !isContainer(y) || Array.isArray(x) !== Array.isArray(y) || depth > MAX_DEPTH) {
      if (!isContainer(x) && !isContainer(y) && x === y) return;
      if (isContainer(x) && isContainer(y) && depth > MAX_DEPTH) return;
      report({ parts, kind: 'changed', before: x, after: y });
      return;
    }
    if (Array.isArray(x)) { walkArrays(x, y, parts, depth); return; }

    new Set([...Object.keys(x), ...Object.keys(y)]).forEach((key) => {
      const inX = Object.prototype.hasOwnProperty.call(x, key);
      const inY = Object.prototype.hasOwnProperty.call(y, key);
      if (inX && !inY) report({ parts: parts.concat(key), kind: 'removed', before: x[key], after: undefined });
      else if (!inX && inY) report({ parts: parts.concat(key), kind: 'added', before: undefined, after: y[key] });
      else walk(x[key], y[key], parts.concat(key), depth + 1);
    });
  }

  walk(a, b, [], 0);
}
