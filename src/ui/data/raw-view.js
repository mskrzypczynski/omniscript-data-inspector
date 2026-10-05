'use strict';

/* The Data tab's Raw view: pretty-printed JSON as text, each line numbered,
 * every match of the filter marked. */

import { countLines, splitByQuery } from '../../core/text-search.js';

/* Past this many lines a block per line costs more than it is worth, so the
 * text is drawn whole, without numbers. */
const MAX_NUMBERED_LINES = 20000;

/* { node, lines, matches } for the text. The numbers are a CSS counter on one
 * block per line (never part of a copied selection), and wrapping a long line
 * keeps its number on the first row only. */
export function buildRawBlock(text, { query = '', wrap = false } = {}) {
  const pre = document.createElement('pre');
  const lines = countLines(text);
  const numbered = lines <= MAX_NUMBERED_LINES;
  pre.className = `raw${wrap ? ' is-wrap' : ''}${numbered ? ' is-numbered' : ''}`;
  if (numbered) pre.style.setProperty('--gutter', `calc(${String(lines).length}ch + 14px)`);

  let line = null;
  const startLine = () => {
    line = numbered ? document.createElement('div') : pre;
    if (numbered) { line.className = 'raw-line'; pre.appendChild(line); }
  };
  const put = (node) => line.appendChild(node);
  startLine();

  const { pieces, total } = splitByQuery(text, query);
  pieces.forEach((piece) => {
    piece.text.split('\n').forEach((part, index) => {
      if (index > 0) { if (numbered) startLine(); else put(document.createTextNode('\n')); }
      if (!part) return;
      if (!piece.match) { put(document.createTextNode(part)); return; }
      const mark = document.createElement('mark');
      mark.textContent = part;
      put(mark);
    });
  });

  return { node: pre, lines, matches: total };
}

/* Enter / Shift+Enter in the filter box walk the marks. Returns the new
 * cursor, or the old one when there is nothing to walk. */
export function stepMark(container, cursor, backwards) {
  const marks = container.querySelectorAll('mark');
  if (!marks.length) return cursor;
  marks.forEach((mark) => mark.classList.remove('is-current'));
  const next = (cursor + (backwards ? -1 : 1) + marks.length) % marks.length;
  marks[next].classList.add('is-current');
  marks[next].scrollIntoView({ block: 'center' });
  return next;
}
