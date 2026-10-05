'use strict';

/* Drawing a long tree a window at a time, for src/ui/json-tree-view.js. */

/* Windowing: past maxRows only the rows near the viewport exist in the DOM,
 * between two spacers sized from the first window's average row height. Rows
 * wrap, so positions are approximate, but a payload of any size stays cheap to
 * draw and to redraw on every poll. */
const OVERSCAN = 40;
const DEFAULT_ROW_PX = 18;

/* Line numbers come from CSS counters (a pseudo-element, so they are never
 * part of a copied selection); this only sizes the gutter for the widest
 * number and starts the count. */
export function numberLines(container, rowCount) {
  container.classList.add('numbered');
  container.style.setProperty('--gutter', `calc(${String(rowCount).length}ch + 14px)`);
}

export function scrollerOf(parent, optsScroller) {
  return optsScroller || (parent.closest && parent.closest('.viewport, .detail-body, .log-detail')) || parent;
}

/* rows: the row descriptors; buildRow(desc) makes one row's element. Returns
 * scrollTo(path), which brings a row into view and says whether it exists. */
export function renderWindowed(parent, rows, buildRow, optsScroller) {
  numberLines(parent, rows.length);
  const wrap = document.createElement('div');
  wrap.className = 'vwin';
  const top = document.createElement('div');
  const holder = document.createElement('div');
  const bottom = document.createElement('div');
  wrap.append(top, holder, bottom);
  parent.appendChild(wrap);
  /* Give the wrapper its full estimated height before anything forces a
   * layout. The caller has just emptied the scroller; measuring first would
   * collapse its height and clamp scrollTop to 0, losing the user's place on
   * every rebuild. */
  const scroller = () => scrollerOf(parent, optsScroller);
  /* The row height measured by the previous draw into this scroller, so a
   * rebuild starts from the same scale and the scroll position stays put. */
  let rowPx = scroller().__vwinRowPx || DEFAULT_ROW_PX;
  let measured = !!scroller().__vwinRowPx;
  bottom.style.height = `${rows.length * rowPx}px`;
  let start = -1;
  let end = -1;

  function windowFor() {
    const box = scroller();
    const viewH = box.clientHeight || 600;
    const scrolled = Math.max(0, box.getBoundingClientRect().top - wrap.getBoundingClientRect().top);
    const first = Math.max(0, Math.floor(scrolled / rowPx) - OVERSCAN);
    const last = Math.min(rows.length - 1, Math.ceil((scrolled + viewH) / rowPx) + OVERSCAN);
    return [first, last];
  }

  function draw(first, last) {
    start = first;
    end = last;
    holder.textContent = '';
    holder.style.counterReset = `line ${first}`; // the window starts mid-list
    const frag = document.createDocumentFragment();
    for (let i = first; i <= last; i++) frag.appendChild(buildRow(rows[i]));
    holder.appendChild(frag);

    if (!measured && holder.offsetHeight > 0) {
      rowPx = Math.max(10, holder.offsetHeight / (last - first + 1));
      measured = true;
      scroller().__vwinRowPx = rowPx;
    }
    top.style.height = `${first * rowPx}px`;
    bottom.style.height = `${Math.max(0, rows.length - 1 - last) * rowPx}px`;
  }

  function update(force) {
    const [first, last] = windowFor();
    if (force || start < 0 || first < start || last > end) draw(first, last);
  }

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(false); });
  };
  const box = scroller();
  if (box.__vwinCleanup) box.__vwinCleanup();
  box.addEventListener('scroll', onScroll);
  box.__vwinCleanup = () => { box.removeEventListener('scroll', onScroll); delete box.__vwinCleanup; };

  draw(...windowFor());

  return function scrollTo(path) {
    const index = rows.findIndex((row) => !row.closing && row.path === path);
    if (index < 0) return false;
    const holderBox = scroller();
    const offset = holderBox.scrollTop + wrap.getBoundingClientRect().top - holderBox.getBoundingClientRect().top;
    holderBox.scrollTop = Math.max(0, offset + index * rowPx - (holderBox.clientHeight || 600) / 2);
    update(true);
    const row = [...holder.children].find((node) => node.dataset && node.dataset.path === path);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    return true;
  };
}
