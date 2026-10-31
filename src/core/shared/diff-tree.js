'use strict';

/* Two JSON values as the rows of two panes, Before on the left and After on
 * the right, lined up so that a row of one sits beside the same row of the
 * other. The side-by-side comparison (src/ui/compare-view.js) draws these
 * rows; the flat list draws diffValues. Both come from one walk (walkDiff,
 * with the rows of arrays lined up by alignRows), so the two views never
 * disagree about what differs.
 *
 * A row pair is
 *   { id, path, depth, kind, left, right, open, count, diff, container, parent }
 *   kind   'same' | 'changed' | 'added' | 'removed' | 'fold'
 *   left / right  { label, text, type, line, value } or null where the row is
 *          only on the other side (the view draws a hatched gap there).
 *          label is the key, or |N for a position in an array (counting from
 *          1, as formatPath writes it); text the value as the tree writes it
 *          (strings quoted, null, true), '{' or '[' for an open container,
 *          '}' or ']' for its closing row, a short preview for a closed one;
 *          type 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'
 *          | 'close' | 'fold'; line the line of the Raw view of that side
 *          (null on a fold).
 *   open   for a container: whether its rows follow. count: on a fold, the
 *          number of unchanged keys or rows it stands for. diff: the index
 *          of the difference the row shows, if any. parent: the id of the
 *          container row the row is in.
 *
 * Rules: a branch with a difference inside is open (and the root with
 * showUnchanged); a run of two or more unchanged keys or rows folds to one
 * row unless showUnchanged; the caller's
 * `open` map (id -> boolean) overrides any of that, for containers and folds.
 *
 * Pure: no DOM, no chrome.*. */

import { walkDiff, alignRows } from './diff-walk.js';
import { formatPath, maskIdentity, commonAffix } from './diff.js';
import { lineSize, childLines } from './json-tree-model.js';

/* The same cap as the flat list (diffValues): differences, and rows. */
export const DIFF_LIMIT = 500;

/* A value longer than this is cut on screen; the copy carries it whole. */
const TEXT_MAX = 1000;
const PREVIEW_MAX = 80;
const SENTENCE_VALUE_MAX = 60;

/* Inner character highlight only for values at least this long. */
export const HIGHLIGHT_MIN = 12;

const isContainer = (value) => value !== null && typeof value === 'object';
const sameShape = (x, y) => isContainer(x) && isContainer(y) && Array.isArray(x) === Array.isArray(y);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/* ------------------------------------------------------------ texts */

export function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function cut(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* A scalar as the tree writes it. */
export function scalarText(value) {
  if (value === undefined) return '';
  if (typeof value === 'string') return cut(JSON.stringify(value), TEXT_MAX);
  return String(value);
}

/* A closed container on one line: { Code: "SPORT", Limit: 20000 }, nested
 * containers as {…} and […], cut at 80 characters. */
export function previewText(value, max = PREVIEW_MAX) {
  if (!isContainer(value)) return scalarText(value);
  const array = Array.isArray(value);
  const keys = Object.keys(value);
  if (!keys.length) return array ? '[]' : '{}';
  const inner = (item) => {
    if (Array.isArray(item)) return item.length ? '[…]' : '[]';
    if (isContainer(item)) return Object.keys(item).length ? '{…}' : '{}';
    return scalarText(item);
  };
  let text = array ? '[ ' : '{ ';
  for (let i = 0; i < keys.length; i++) {
    const part = array ? inner(value[i]) : `${keys[i]}: ${inner(value[keys[i]])}`;
    const next = `${text}${i ? ', ' : ''}${part}`;
    if (next.length > max) return `${text}${i ? ', ' : ''}…${array ? ' ]' : ' }'}`;
    text = next;
  }
  return `${text}${array ? ' ]' : ' }'}`;
}

/* A value in a sentence: short, a container by its size. */
function sentenceValue(value) {
  if (Array.isArray(value)) return `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`;
  if (isContainer(value)) {
    const count = Object.keys(value).length;
    return `{${count} ${count === 1 ? 'key' : 'keys'}}`;
  }
  return cut(scalarText(value), SENTENCE_VALUE_MAX);
}

/* Which part of a changed value to mark, as { before: {start, end}, after:
 * {start, end} } offsets into the two texts. The inner span that differs is
 * marked only when both texts are long (at least 12 characters) and share a
 * start or an end; a short value, a number, a flag or null is marked whole, so
 * false -> true is not read as "fals" -> "tru". A long text that shares
 * nothing is left unmarked: the whole line would only shout. Used by both
 * views. */
export function changeHighlight(beforeText, afterText, beforeValue, afterValue) {
  const whole = { before: { start: 0, end: beforeText.length }, after: { start: 0, end: afterText.length } };
  const plain = (value) => value === null || typeof value === 'number' || typeof value === 'boolean';
  if (plain(beforeValue) || plain(afterValue)) return whole;
  if (beforeText.length < HIGHLIGHT_MIN || afterText.length < HIGHLIGHT_MIN) return whole;
  const { prefix, suffix } = commonAffix(beforeText, afterText);
  if (prefix + suffix === 0) return { before: { start: 0, end: 0 }, after: { start: 0, end: 0 } };
  return {
    before: { start: prefix, end: beforeText.length - suffix },
    after: { start: prefix, end: afterText.length - suffix }
  };
}

/* ------------------------------------------------------ differences */

/* The address of a node: its keys, with a position in an array written as
 * b<N> (a row of After, or matched in both) or a<N> (a row only in Before), so
 * a removed row and the matched row at the same position never meet. */
const SEP = '\u001f';
const keyPart = (key) => `k${key}`;
const rowPart = (side, index) => `${side}${index}`;

function addressOf(entry) {
  const last = entry.parts.length - 1;
  return entry.parts.map((part, at) => {
    if (typeof part !== 'number') return keyPart(part);
    const removedRow = at === last && entry.index !== undefined && (entry.kind === 'removed' || entry.kind === 'row-removed');
    return rowPart(removedRow ? 'a' : 'b', part);
  });
}

/* A side that is not there at all (no Before, no After) reads as added or
 * removed, not as a change from or to nothing. */
function kindOf(entry) {
  if (entry.kind === 'changed' && entry.before === undefined) return 'added';
  if (entry.kind === 'changed' && entry.after === undefined) return 'removed';
  return entry.kind;
}

/* The colour a difference is counted under. */
export const toneOf = (kind) => (kind === 'row-added' ? 'added' : kind === 'row-removed' ? 'removed' : kind);

/* One difference in words: "Consents:HasCard changed: false → true",
 * "Discount added: 10", "LegacyId removed", "row |2 added", "row Id=7 removed". */
export function differenceSentence(difference, mask = (value) => value) {
  const path = formatPath(difference.path);
  switch (difference.kind) {
    case 'row-added':
    case 'row-removed': {
      const verb = difference.kind === 'row-added' ? 'added' : 'removed';
      if (!difference.identity) return `row ${path} ${verb}`;
      const parent = difference.path.length > 1 ? `${formatPath(difference.path.slice(0, -1))} ` : '';
      return `row ${parent}${maskIdentity(difference.identity, mask)} ${verb}`;
    }
    case 'added': return `${path} added: ${sentenceValue(mask(difference.after))}`;
    case 'removed': return `${path} removed`;
    default: return `${path} changed: ${sentenceValue(mask(difference.before))} → ${sentenceValue(mask(difference.after))}`;
  }
}

/* The differences of a and b in document order, as walkDiff finds them (the
 * flat list's diffValues reads the same walk), each
 *   { path, kind, before, after, index?, identity?, address, sentence }. */
export function listDifferences(a, b, limit = DIFF_LIMIT) {
  const differences = [];
  let truncated = false;
  walkDiff(a, b, (entry) => {
    if (differences.length >= limit) { truncated = true; return true; }
    const difference = { path: entry.parts, kind: kindOf(entry), before: entry.before, after: entry.after };
    if (entry.index !== undefined) difference.index = entry.index;
    if (entry.identity !== undefined) difference.identity = entry.identity;
    difference.address = addressOf(entry).join(SEP);
    difference.sentence = differenceSentence(difference);
    differences.push(difference);
    return false;
  });
  return { differences, truncated };
}

export function countsOf(differences) {
  const counts = { changed: 0, added: 0, removed: 0 };
  differences.forEach((difference) => { counts[toneOf(difference.kind)] += 1; });
  return counts;
}

/* ------------------------------------------------------------- rows */

function sideOf(label, value, line, open) {
  if (isContainer(value)) {
    const array = Array.isArray(value);
    return { label, text: open ? (array ? '[' : '{') : previewText(value), type: array ? 'array' : 'object', line, value };
  }
  return { label, text: scalarText(value), type: typeOf(value), line, value };
}

const closerOf = (value, line) => ({ label: '', text: Array.isArray(value) ? ']' : '}', type: 'close', line });

const isOpenable = (value) => isContainer(value) && Object.keys(value).length > 0;

/* The id of a row inside the row `id`. */
const childId = (id, part) => (id === '' ? part : `${id}${SEP}${part}`);

/* The keys of two objects in reading order: Before's, with each key only
 * After has placed after the key it follows in After (first when it follows
 * none), so an added key sits where it is in the After JSON. */
export function mergeKeys(keysX, keysY) {
  const inX = new Set(keysX);
  const after = new Map(); // a key of Before -> the keys only After has that follow it
  const lead = [];
  let last = null;
  keysY.forEach((key) => {
    if (inX.has(key)) { last = key; return; }
    if (last === null) lead.push(key);
    else after.set(last, (after.get(last) || []).concat(key));
  });
  const out = lead.slice();
  keysX.forEach((key) => { out.push(key, ...(after.get(key) || [])); });
  return out;
}

/* The rows of two values. options:
 *   showUnchanged  draw unchanged keys and rows instead of folding them
 *   open           Map or object, id -> boolean: the caller's open and closed
 *                  branches and folds, which win over the defaults
 *   limit          the cap on differences and on rows (DIFF_LIMIT)
 * returns { rows, differences, counts, truncated }: each difference also gets
 * rowId (the id of the row that shows it), ancestors (the container rows to
 * open to reach it) and drawn (whether that row is among these rows). */
export function buildDiffTree(before, after, { showUnchanged = false, open = null, limit = DIFF_LIMIT } = {}) {
  const { differences, truncated: diffCut } = listDifferences(before, after, limit);
  const at = new Map(differences.map((difference, index) => [difference.address, index]));
  const inside = new Set();
  differences.forEach((difference) => {
    const parts = difference.address ? difference.address.split(SEP) : [];
    for (let n = 0; n <= parts.length; n++) inside.add(parts.slice(0, n).join(SEP));
  });

  /* The rows for one open state; `cap` stops them. */
  function drawRows(openState, showAll, cap) {
    const wanted = (id, fallback) => {
      if (!openState) return fallback;
      const value = openState instanceof Map ? openState.get(id) : openState[id];
      return typeof value === 'boolean' ? value : fallback;
    };

    const rows = [];
    let rowCut = false;
    let stopped = false;
    let shown = 0; // differences drawn so far

    const push = (row) => {
      if (stopped) return false;
      if (rows.length >= cap) { rowCut = true; stopped = true; return false; }
      rows.push(row);
      if (row.diff !== undefined) {
        shown += 1;
        /* With the differences cut short, nothing past the last one known can
         * be said to be unchanged: the rows stop there too. */
        if (diffCut && shown >= differences.length) stopped = true;
      }
      return true;
    };

    /* A subtree only one side has: every row of it is added (or removed). */
    function oneSided(value, { id, path, depth, label, line, side, kind, diff, parent }) {
      const container = isOpenable(value);
      const isOpen = container && wanted(id, false);
      const content = sideOf(label, value, line, isOpen);
      const row = { id, path, depth, kind, left: side === 'left' ? content : null, right: side === 'right' ? content : null, parent, container, open: isOpen };
      if (diff !== undefined) row.diff = diff;
      if (!push(row)) return;
      if (!isOpen) return;
      const lines = childLines(value, line);
      Object.keys(value).forEach((key, n) => {
        if (stopped) return;
        const index = Array.isArray(value) ? n : key;
        const childLabel = Array.isArray(value) ? `|${n + 1}` : key;
        oneSided(value[index], {
          id: childId(id, Array.isArray(value) ? rowPart(side === 'left' ? 'a' : 'b', n) : keyPart(key)),
          path: path.concat(index), depth: depth + 1, label: childLabel, line: lines[n], side, kind, parent: id
        });
      });
      const close = closerOf(value, line + lineSize(value) - 1);
      push({ id: `${id}${SEP}#end`, path, depth, kind, left: side === 'left' ? close : null, right: side === 'right' ? close : null, parent: id });
    }

    /* The children of a container both sides have, as descriptors in walkDiff's
     * order: keys of Before, then the keys only After has; rows as alignRows
     * lines them up. Lines are each side's own, as its Raw view numbers them. */
    function childrenOf(x, y, id, path, lineX, lineY) {
      const linesX = childLines(x, lineX);
      const linesY = childLines(y, lineY);
      if (Array.isArray(x)) {
        return alignRows(x, y).ops.map((op) => {
          const both = op.a !== undefined && op.b !== undefined;
          const part = op.b !== undefined ? rowPart('b', op.b) : rowPart('a', op.a);
          return {
            address: childId(id, part),
            path: path.concat(op.b !== undefined ? op.b : op.a),
            inX: op.a !== undefined, inY: op.b !== undefined, both,
            x: op.a !== undefined ? x[op.a] : undefined, y: op.b !== undefined ? y[op.b] : undefined,
            labelX: op.a !== undefined ? `|${op.a + 1}` : '', labelY: op.b !== undefined ? `|${op.b + 1}` : '',
            lineX: op.a !== undefined ? linesX[op.a] : null, lineY: op.b !== undefined ? linesY[op.b] : null
          };
        });
      }
      const keysX = Object.keys(x);
      const keysY = Object.keys(y);
      const placeX = new Map(keysX.map((key, n) => [key, n]));
      const placeY = new Map(keysY.map((key, n) => [key, n]));
      return mergeKeys(keysX, keysY).map((key) => {
        const inX = hasOwn(x, key);
        const inY = hasOwn(y, key);
        return {
          address: childId(id, keyPart(key)),
          path: path.concat(key), inX, inY, both: inX && inY,
          x: inX ? x[key] : undefined, y: inY ? y[key] : undefined, labelX: key, labelY: key,
          lineX: inX ? linesX[placeX.get(key)] : null, lineY: inY ? linesY[placeY.get(key)] : null
        };
      });
    }

    /* One node: a key or row both sides may have. */
    function node(child, depth, parent) {
      if (stopped) return;
      const { address: id, path } = child;
      const diff = at.get(id);
      if (!child.inY) {
        oneSided(child.x, { id, path, depth, label: child.labelX, line: child.lineX, side: 'left', kind: 'removed', diff, parent });
        return;
      }
      if (!child.inX) {
        oneSided(child.y, { id, path, depth, label: child.labelY, line: child.lineY, side: 'right', kind: 'added', diff, parent });
        return;
      }
      const { x, y } = child;
      if (diff !== undefined) {
        // A value that changed, or a container that became a value (or another kind of container).
        push({ id, path, depth, kind: 'changed', diff, parent, container: false, open: false,
          left: sideOf(child.labelX, x, child.lineX, false), right: sideOf(child.labelY, y, child.lineY, false) });
        return;
      }
      if (!sameShape(x, y) || (!isOpenable(x) && !isOpenable(y))) {
        push({ id, path, depth, kind: 'same', parent, container: false, open: false,
          left: sideOf(child.labelX, x, child.lineX, false), right: sideOf(child.labelY, y, child.lineY, false) });
        return;
      }
      /* With every line asked for, the whole value is open at the root. */
      const differs = inside.has(id) || (showAll && depth === 0);
      const isOpen = wanted(id, differs);
      if (!push({ id, path, depth, kind: 'same', parent, container: true, open: isOpen,
        left: sideOf(child.labelX, x, child.lineX, isOpen), right: sideOf(child.labelY, y, child.lineY, isOpen) })) return;
      if (!isOpen) return;
      branch(x, y, id, path, depth, child.lineX, child.lineY);
      push({ id: `${id}${SEP}#end`, path, depth, kind: 'same', parent: id,
        left: closerOf(x, child.lineX + lineSize(x) - 1), right: closerOf(y, child.lineY + lineSize(y) - 1) });
    }

    /* The rows inside an open container both sides have, with the unchanged
     * runs folded. */
    function branch(x, y, id, path, depth, lineX, lineY) {
      const children = childrenOf(x, y, id, path, lineX, lineY);
      const unit = Array.isArray(x) ? ['row', 'rows'] : ['key', 'keys'];
      let n = 0;
      while (n < children.length && !stopped) {
        const child = children[n];
        const quiet = child.both && !inside.has(child.address);
        if (!quiet || showAll) { node(child, depth + 1, id); n += 1; continue; }
        let end = n;
        while (end < children.length && children[end].both && !inside.has(children[end].address)) end += 1;
        const run = end - n;
        const foldId = `${id}${SEP}#fold${n}`;
        if (run < 2 || wanted(foldId, false)) {
          for (let k = n; k < end && !stopped; k++) node(children[k], depth + 1, id);
        } else {
          const text = `… ${run} unchanged ${run === 1 ? unit[0] : unit[1]}`;
          const fold = { label: '', text, type: 'fold', line: null };
          push({ id: foldId, path: child.path, depth: depth + 1, kind: 'fold', count: run, parent: id, open: false, left: fold, right: { ...fold } });
        }
        n = end;
      }
    }

    /* The root: a value on one side only, two values, or two containers. */
    const root = { address: '', path: [], inX: before !== undefined, inY: after !== undefined, x: before, y: after, labelX: '', labelY: '', lineX: 1, lineY: 1 };
    root.both = root.inX && root.inY;
    if (root.inX || root.inY) node(root, 0, null);
    return { rows, cut: rowCut };
  }


  /* The differences in reading order (an added key sits where After has
   * it, not after every key of Before, where the walk finds it), so Previous
   * and Next go down the panes. That order is the one of the rows drawn with
   * every branch that holds a difference open, whatever the caller's open
   * state; a difference the walk never reaches stays at the end. */
  const reading = drawRows(null, false, Infinity);
  const custom = open || showUnchanged ? drawRows(open, showUnchanged, limit) : null;
  const order = [];
  const seen = new Set();
  reading.rows.forEach((row) => {
    if (row.diff !== undefined && !seen.has(row.diff)) { seen.add(row.diff); order.push(row.diff); }
  });
  differences.forEach((difference, index) => { if (!seen.has(index)) order.push(index); });
  const renumber = new Map(order.map((old, index) => [old, index]));
  const sorted = order.map((old) => differences[old]);
  const { rows, cut } = custom || { rows: reading.rows.slice(0, limit), cut: reading.rows.length > limit };
  const ids = new Set(rows.map((row) => row.id));
  rows.forEach((row) => { if (row.diff !== undefined) row.diff = renumber.get(row.diff); });
  sorted.forEach((difference) => {
    difference.rowId = difference.address;
    difference.ancestors = pathToDifference(difference);
    difference.drawn = ids.has(difference.address);
  });
  return { rows, differences: sorted, counts: countsOf(sorted), truncated: diffCut || cut };
}

/* The ids to open so that a difference that is inside a closed branch can be
 * shown: every container on the way to it. Worked out from its address, so it
 * holds for a difference whose row is not drawn yet. */
export function pathToDifference(difference) {
  const parts = difference.address ? difference.address.split(SEP) : [];
  const ids = [];
  for (let n = 0; n < parts.length; n++) ids.push(parts.slice(0, n).join(SEP));
  return ids;
}

/* ---------------------------------------------------------- masking */

/* The rows with Mask values applied to what they show, the way maskChange
 * masks a change: the values (and so the previews) through `mask`; keys,
 * positions and structure as they are. */
export function maskRows(rows, mask = (value) => value) {
  const maskSide = (side) => {
    if (!side || !('value' in side)) return side;
    const value = mask(side.value);
    const text = side.type === 'object' || side.type === 'array'
      ? (side.text === '{' || side.text === '[' ? side.text : previewText(value))
      : scalarText(value);
    return { ...side, text, value };
  };
  return rows.map((row) => ({ ...row, left: maskSide(row.left), right: maskSide(row.right) }));
}

/* The differences with their values and sentences masked. */
export function maskDifferences(differences, mask = (value) => value) {
  return differences.map((difference) => {
    const out = { ...difference, before: mask(difference.before), after: mask(difference.after) };
    if (difference.identity !== undefined) out.identity = maskIdentity(difference.identity, mask);
    out.sentence = differenceSentence(difference, mask);
    return out;
  });
}

/* --------------------------------------------------------- the view */

/* The words of the foot: "Difference 1 of 11 · Plan changed: …". */
export function footText(differences, index, truncated = false) {
  if (!differences.length) return truncated ? 'No difference in the rows drawn.' : 'No differences.';
  if (index === null || index === undefined || !differences[index]) {
    return `${differences.length}${truncated ? '+' : ''} ${differences.length === 1 && !truncated ? 'difference' : 'differences'} · Next (↓) goes to the first`;
  }
  return `Difference ${index + 1} of ${differences.length}${truncated ? '+' : ''} · ${differences[index].sentence}`;
}

/* The pills of the head: only the counts that are not zero. */
export function countPills(counts) {
  return [['changed', counts.changed], ['added', counts.added], ['removed', counts.removed]]
    .filter(([, count]) => count > 0)
    .map(([tone, count]) => ({ tone, count, text: `${count} ${tone}` }));
}

/* One pane for a narrow panel: each pair becomes one line, or two for a
 * change (Before's line above After's, both marked). Each line is
 *   { row, side: 'left' | 'right', tone: 'same' | 'fold' | 'removed' | 'added' }. */
export function unifiedRows(rows) {
  const out = [];
  rows.forEach((row) => {
    if (row.kind === 'changed') {
      out.push({ row, side: 'left', tone: 'removed' });
      out.push({ row, side: 'right', tone: 'added' });
    } else if (row.kind === 'removed') {
      out.push({ row, side: 'left', tone: 'removed' });
    } else if (row.kind === 'added') {
      out.push({ row, side: 'right', tone: 'added' });
    } else {
      out.push({ row, side: row.right ? 'right' : 'left', tone: row.kind });
    }
  });
  return out;
}

/* The index of the row to make current after `from` (a row index, -1 for
 * before the first) going `step` (+1 or -1): the next row that shows a
 * difference or is a fold. -1 when there is none. */
export function nextStop(rows, from, step) {
  for (let n = from + step; n >= 0 && n < rows.length; n += step) {
    const row = rows[n];
    if (row.diff !== undefined || row.kind === 'fold') return n;
  }
  return -1;
}

/* The differences in the shape of diffValues' changes ({ path as text, kind,
 * before, after, index?, identity? }), for the List view and for Copy, in the
 * order the panes show them. */
export function changesOf(differences) {
  return differences.map((difference) => {
    const change = { path: formatPath(difference.path), kind: difference.kind, before: difference.before, after: difference.after };
    if (difference.index !== undefined) change.index = difference.index;
    if (difference.identity !== undefined) change.identity = difference.identity;
    return change;
  });
}
