'use strict';

/* The differences between two values as a list, the List view of the
 * comparisons (src/ui/compare-view.js) and the Track changes log.
 *
 * Each change is a block: the path on the first line with a glyph for what
 * happened (+ added, − removed, ~ changed; a whole array row says "row" and
 * its Id), then the value(s): a changed value gets a red − line (before) and a
 * green + line (after) with the part that differs highlighted (inside a long
 * value; a short one, a number, a flag or null is marked whole). Long values are
 * folded at 160 characters behind a "more" button, around the highlight.
 * diffLineText is the one-line form used for copying. */

import { maskIdentity, excerpt } from '../core/shared/diff.js';
import { changeHighlight } from '../core/shared/diff-tree.js';
import { lineCount, lineCut } from '../core/shared/fold-lines.js';

const SHOW_MAX = 300;
const FOLD_AT = 160;
const PRETTY_LINES = 20; // a pretty-printed value shows this many lines before "more"

function show(value, limit = SHOW_MAX, space = 0) {
  if (value === undefined) return '';
  const text = JSON.stringify(value, null, space);
  return limit && text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/* Rows[2], or Rows[2] (Id=7) when the rows were lined up by a key. */
const rowName = (change, transform) => (change.identity
  ? `${change.path} (${maskIdentity(change.identity, transform)})` : change.path);

/* The line as text. `transform` is applied to the values first (Mask values
 * for a copy), and `limit` cuts a long value short on screen. */
export function diffLineText(change, transform = (value) => value, limit = SHOW_MAX) {
  const before = show(transform(change.before), limit);
  const after = show(transform(change.after), limit);
  switch (change.kind) {
    case 'row-added': return `+ row ${rowName(change, transform)}: ${after}`;
    case 'row-removed': return `− row ${rowName(change, transform)}: ${before}`;
    case 'added': return `+ ${change.path}: ${after}`;
    case 'removed': return `− ${change.path}: ${before}`;
    default: return `~ ${change.path}: ${before} → ${after}`;
  }
}

/* Row kinds borrow the colour of added / removed. */
const COLOUR = { 'row-added': 'added', 'row-removed': 'removed' };
const GLYPH = { added: '+', removed: '−', changed: '~' };

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/* The first line: glyph, path, and the row's Id when it has one. */
function pathLine(change, colour, mask) {
  const line = document.createElement('div');
  line.className = 'diff-path';
  line.appendChild(span('diff-glyph', GLYPH[colour] || '~'));
  const isRow = change.kind === 'row-added' || change.kind === 'row-removed';
  line.appendChild(span('diff-name', `${isRow ? 'row ' : ''}${change.path}`));
  if (isRow && change.identity) line.appendChild(span('diff-id', `(${maskIdentity(change.identity, mask)})`));
  return line;
}

/* One value line: `sign` and the text, the differing span [hl.start, hl.end)
 * marked, folded when long. With `foldLines` the text is several lines (a
 * pretty-printed value) and is folded to that many lines instead of around
 * the differing span. */
function valueLine(className, sign, text, hl, foldLines = 0) {
  const line = document.createElement('div');
  line.className = className;
  line.appendChild(span('diff-sign', sign));
  const value = document.createElement('span');
  value.className = 'diff-val';
  line.appendChild(value);

  const paint = (open) => {
    const closed = foldLines ? { from: 0, to: lineCut(text, foldLines) } : excerpt(text.length, hl.start, hl.end, FOLD_AT);
    const { from, to } = open ? { from: 0, to: text.length } : closed;
    value.textContent = '';
    if (from > 0) value.appendChild(document.createTextNode('…'));
    [[from, Math.min(to, hl.start), false], [Math.max(from, hl.start), Math.min(to, hl.end), true], [Math.max(from, hl.end), to, false]]
      .forEach(([a, b, marked]) => {
        if (b <= a) return;
        if (marked) value.appendChild(span('diff-hl', text.slice(a, b)));
        else value.appendChild(document.createTextNode(text.slice(a, b)));
      });
    if (to < text.length) value.appendChild(document.createTextNode('…'));
  };
  paint(false);

  if (foldLines ? lineCount(text) > foldLines : text.length > FOLD_AT) {
    let open = false;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'diff-more';
    more.textContent = 'more';
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
      open = !open;
      paint(open);
      more.textContent = open ? 'less' : 'more';
      more.setAttribute('aria-expanded', String(open));
    });
    line.appendChild(more);
  }
  return line;
}

const NO_HIGHLIGHT = { start: 0, end: 0 };

const isStructured = (value) => value !== null && typeof value === 'object';

/* `mask` is applied to the values shown (Mask values on screen, as the
 * Calls comparisons do); the copy path masks from `__change`.
 * `pretty` writes an object or array over several lines, indented, folded
 * after 20 of them, instead of as one long line. */
export function diffLine(change, mask = (value) => value, { pretty = false } = {}) {
  const colour = COLOUR[change.kind] || change.kind;
  const block = document.createElement('div');
  block.className = `diff-line diff-block is-${colour}`;
  block.__change = change; // for a copy that has to apply Mask values
  block.appendChild(pathLine(change, colour, mask));

  const spread = pretty && (isStructured(change.before) || isStructured(change.after));
  const before = show(mask(change.before), 0, spread ? 2 : 0);
  const after = show(mask(change.after), 0, spread ? 2 : 0);
  const fold = spread ? PRETTY_LINES : 0;
  if (colour === 'removed') {
    block.appendChild(valueLine('diff-before', '−', before, NO_HIGHLIGHT, fold));
  } else if (colour === 'added') {
    block.appendChild(valueLine('diff-after', '+', after, NO_HIGHLIGHT, fold));
  } else {
    /* The part that differs inside two long values; a short value, a number,
     * a flag or null marked whole (changeHighlight, shared with the side by
     * side view). */
    const hl = changeHighlight(before, after, mask(change.before), mask(change.after));
    block.appendChild(valueLine('diff-before', '−', before, hl.before, fold));
    block.appendChild(valueLine('diff-after', '+', after, hl.after, fold));
  }
  return block;
}
