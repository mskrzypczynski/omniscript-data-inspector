'use strict';

/* Control names in running text. A text names a button or a switch by writing
 * it between double square brackets, [[Rescan]], and whatever draws the text
 * shows the name as a small button-like chip. This is the one place that
 * knows the mark: the panel (help, tours), the reference page and the guides
 * all read it through here, so they cannot disagree.
 *
 * A mark is one line, holds no square bracket, and is not empty. Anything
 * else stays as written, so a stray "[[" never loses text.
 *
 * Pure: no DOM, no chrome.*. */

const MARK = /\[\[([^[\]\n]*[^[\]\s][^[\]\n]*)\]\]/g;

/* The text as pieces: { text } for words and { chip } for a control name.
 * Pieces with nothing in them are left out. */
export function chipSegments(text) {
  const source = String(text === undefined || text === null ? '' : text);
  const pieces = [];
  let from = 0;
  for (const found of source.matchAll(MARK)) {
    if (found.index > from) pieces.push({ text: source.slice(from, found.index) });
    pieces.push({ chip: found[1].trim() });
    from = found.index + found[0].length;
  }
  if (from < source.length) pieces.push({ text: source.slice(from) });
  return pieces;
}

/* The text with every mark replaced by the name it holds: what a search, a
 * tooltip or a screen reader works with. */
export function plainChips(text) {
  return chipSegments(text).map((piece) => (piece.chip !== undefined ? piece.chip : piece.text)).join('');
}

/* The control names a text marks, in order. */
export function chipNames(text) {
  return chipSegments(text).filter((piece) => piece.chip !== undefined).map((piece) => piece.chip);
}

/* True when `text` is cut inside a mark (an opening [[ with no closing ]] yet). */
export function endsInsideMark(text) {
  const open = String(text).lastIndexOf('[[');
  return open >= 0 && !String(text).slice(open).includes(']]');
}
