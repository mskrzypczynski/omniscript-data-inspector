'use strict';

/* The sticky parent path of a tree (the Data tab's): the open branches the
 * first visible row sits inside stay pinned at the top, at most three lines,
 * and a click on one scrolls to that row. Which rows are pinned is decided in
 * core/shared/sticky-path.js; this draws them, and works with the windowed renderer
 * because it only asks which row is at the top.
 *
 * The lines are duplicates for the mouse. The tree itself stays the keyboard's
 * and a screen reader's: Left on a row goes to its parent, so the lines are
 * hidden from assistive technology and out of the tab order. */

import { stickyAncestors } from '../core/shared/sticky-path.js';
import { memoDraw } from './memo-draw.js';

const LINE_PX = 18; // keep in step with .tree-sticky-line in panel.css

/* The index, in `elements` (rows in document order), of the first one whose
 * bottom edge is below `top`: the row at the top of the view. -1 when none is. */
export function firstRowBelow(elements, top) {
  let low = 0;
  let high = elements.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (elements[middle].getBoundingClientRect().bottom > top) { found = middle; high = middle - 1; } else low = middle + 1;
  }
  return found;
}

function lineFor(row, goTo) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tree-sticky-line';
  button.tabIndex = -1;
  button.dataset.path = row.path;
  button.style.paddingLeft = `calc(var(--gutter, 0px) + ${4 + row.depth * 12}px)`;
  button.title = 'Scroll to this row';

  const twisty = document.createElement('span');
  twisty.className = 'tree-sticky-twisty';
  twisty.textContent = '▾';
  const key = document.createElement('span');
  key.textContent = row.keyText;
  button.append(twisty, key);
  button.addEventListener('click', () => goTo(row.path));
  /* The strip is hidden from assistive technology, since it only mirrors rows
   * already in the tree, so nothing in it may hold the focus: a press scrolls
   * without taking the focus from the tree (the browser warns otherwise). */
  button.addEventListener('mousedown', (ev) => ev.preventDefault());
  return button;
}

/* Puts the pinned lines at the top of `parent`'s scroller and keeps them right
 * as it scrolls. rows: the row descriptors; topIndex(): the descriptor index
 * of the first visible row, or -1; goTo(path): scrolls a row into view.
 * Returns update(), which a redraw calls once the rows are in the page. */
export function mountSticky(parent, scroller, rows, topIndex, goTo) {
  if (scroller.__stickyCleanup) scroller.__stickyCleanup();

  const holder = document.createElement('div');
  holder.className = 'tree-sticky';
  holder.setAttribute('aria-hidden', 'true');
  const lines = document.createElement('div');
  lines.className = 'tree-sticky-lines';
  lines.hidden = true;
  holder.appendChild(lines);
  parent.insertBefore(holder, parent.firstChild);

  /* Nothing is pinned until the first scroll, so '' counts as drawn. */
  const paint = memoDraw(
    (pinned) => pinned.map((row) => row.path).join('\u0000'),
    (signature, pinned) => {
      lines.textContent = '';
      pinned.forEach((row) => lines.appendChild(lineFor(row, goTo)));
      lines.hidden = !pinned.length;
      /* A row scrolled to by the keyboard must come to rest below the lines. */
      scroller.style.scrollPaddingTop = pinned.length ? `${pinned.length * LINE_PX + 1}px` : '';
    },
    ''
  );
  const update = () => {
    const at = topIndex();
    paint.redraw(at < 0 ? [] : stickyAncestors(rows, at));
  };

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  };
  scroller.addEventListener('scroll', onScroll);
  scroller.__stickyCleanup = () => {
    scroller.removeEventListener('scroll', onScroll);
    if (frame) cancelAnimationFrame(frame);
    scroller.style.scrollPaddingTop = '';
    delete scroller.__stickyCleanup;
  };
  return update;
}
