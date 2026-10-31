'use strict';

/* Keyboard and screen-reader support for the two click-only row lists
 * (Calls calls, Structure elements). The tabs keep drawing their own
 * rows; this module only adds what a row needs to be a real list item:
 *
 *   const lb = enhanceList(listEl, { role: 'listbox', label: 'Remote calls' });
 *   ... after every redraw ...
 *   lb.decorate(hadFocus);
 *
 * Rows are the `.list-row` children except the `.list-head` header, and each
 * carries `data-row-key` so a redraw can put focus back on the same row.
 * Moving with the keyboard "clicks" the target row, so selecting by key and by
 * mouse run exactly the same code. */

const PAGE_ROWS = 10;
const ROW = '.list-row:not(.list-head)';

/* Brings a row into view after a keyboard move. A row the stylesheet pins under
 * the header (a Structure step) counts as in view wherever the list is scrolled,
 * so scrollIntoView leaves the list where it was: Home would stay at the bottom.
 * For such a row the place it has in the flow decides: when that is above the
 * visible part, the list scrolls up to it; below, down to it. */
function reveal(list, row) {
  const pinned = !!window.getComputedStyle && window.getComputedStyle(row).position === 'sticky';
  if (!pinned) { if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); return; }

  const head = list.querySelector('.list-head');
  const headHeight = head ? head.getBoundingClientRect().height : 0;
  const was = row.style.position;
  row.style.position = 'static'; // measure where the row sits in the flow, not where it is pinned
  const place = row.getBoundingClientRect();
  const natural = place.top - list.getBoundingClientRect().top + list.scrollTop;
  row.style.position = was;

  const top = natural - headHeight;
  if (top < list.scrollTop) list.scrollTop = Math.max(0, top);
  else if (natural + place.height > list.scrollTop + list.clientHeight) list.scrollTop = natural + place.height - list.clientHeight;
}

export function enhanceList(list, { role, label, onKey, multiselectable = false }) {
  list.setAttribute('role', role);
  list.setAttribute('aria-label', label);
  // Rows can be marked besides the one selected (Calls' checkboxes).
  if (multiselectable) list.setAttribute('aria-multiselectable', 'true');
  const itemRole = role === 'tree' ? 'treeitem' : 'option';

  const rows = () => Array.from(list.querySelectorAll(ROW));
  let pendingKey = null; // the row keyboard navigation is moving to

  /* Selects a row like a click does and moves focus to it, redraw included. */
  function moveTo(row) {
    pendingKey = row.dataset.rowKey;
    row.click();
    pendingKey = null;
  }

  /* Call after every redraw. hadFocus: focus was inside the list before it was
   * rebuilt, so the row that had it (or the selected one) gets it back. */
  function decorate(hadFocus, focusKey) {
    const all = rows();
    const head = list.querySelector('.list-head');
    if (head) head.setAttribute('aria-hidden', 'true');

    const selected = all.find((row) => row.classList.contains('is-selected')) || null;
    const stop = selected || all[0] || null;
    all.forEach((row) => {
      row.setAttribute('role', itemRole);
      const marked = row.classList.contains('is-marked');
      row.setAttribute('aria-selected', String(row === selected || marked));
      if (multiselectable) row.setAttribute('aria-checked', String(marked));
      row.tabIndex = row === stop ? 0 : -1;
    });

    if (!hadFocus || !all.length) return;
    const target = all.find((row) => row.dataset.rowKey === focusKey) || selected || all[0];
    target.focus({ preventScroll: true });
  }

  /* Wrap a redraw so focus inside the list survives it. */
  function around(draw) {
    const active = document.activeElement;
    const hadFocus = !!active && list.contains(active);
    const row = hadFocus ? active.closest(ROW) : null;
    const focusKey = pendingKey !== null ? pendingKey : (row ? row.dataset.rowKey : undefined);
    draw();
    decorate(hadFocus, focusKey);
  }

  function indexFor(key, all, current) {
    const last = all.length - 1;
    switch (key) {
      case 'ArrowDown': case 'j': return Math.min(current + 1, last);
      case 'ArrowUp': case 'k': return Math.max(current - 1, 0);
      case 'PageDown': return Math.min(current + PAGE_ROWS, last);
      case 'PageUp': return Math.max(current - PAGE_ROWS, 0);
      case 'Home': return 0;
      case 'End': return last;
      default: return -1;
    }
  }

  list.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const row = ev.target.closest && ev.target.closest(ROW);
    if (!row || !list.contains(row)) return;

    if (onKey && onKey(ev, row)) { ev.preventDefault(); return; }

    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      moveTo(row);
      return;
    }

    const all = rows();
    const next = indexFor(ev.key, all, all.indexOf(row));
    if (next < 0) return;
    ev.preventDefault();
    const target = all[next];
    if (target === row && row.classList.contains('is-selected')) return;
    moveTo(target); // selects, and the redraw puts focus on the new row
    const now = rows().find((r) => r.dataset.rowKey === target.dataset.rowKey);
    if (now) reveal(list, now);
  });

  return { decorate, around, rows, moveTo };
}
