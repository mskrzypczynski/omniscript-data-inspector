'use strict';

/* Draggable divider for a two-pane .split (list + detail), shared by the
 * Structure and Calls tabs. Works in both orientations: side by side
 * on a wide panel (drag left/right, sets --list-w) and stacked on a narrow one
 * (drag up/down, sets --list-h). panel.css maps each variable to the list
 * pane's flex-basis for the matching layout.
 *
 *   initSplitPane(splitEl)
 *
 * The size is kept as a percentage of the split, so the balance holds when
 * DevTools itself is resized. It is held in memory only — no storage, no
 * permissions — so it lasts as long as DevTools stays open.
 *
 * Each pane may shrink to whichever is smaller: a few pixels' worth of
 * content or a small share of the split, so even a narrow panel can give
 * almost all of its room to one side.
 *
 * Focus mode: a grip on the divider, Ctrl/Cmd+\ and Esc (from the detail pane)
 * hide the list so the detail takes the whole width, and bring it back at the
 * width it had. Kept per split while the panel is open, never stored. */

import { isFocusModeKey } from '../core/shared/shell-keys.js';

const MIN_PANE_PX = 80;     // a pane never gets narrower than this...
const MIN_PANE_SHARE = 0.1; // ...unless that would be more than this share
const KEY_STEP_PX = 16;     // arrow key; Shift moves four times as far
const DEFAULT_SHARE = { side: 46, stacked: 45 }; // the list's share, as panel.css sets it

const panes = new Set(); // every split with focus mode, for the shortcut
let shortcutOn = false;

/* One listener for all splits: the shortcut acts on the one on screen. The
 * help dialog, when open, keeps its keys to itself. */
function mountShortcut() {
  if (shortcutOn) return;
  shortcutOn = true;
  document.addEventListener('keydown', (ev) => {
    if (!isFocusModeKey(ev) || document.querySelector('.help-overlay:not([hidden])')) return;
    const shown = Array.from(panes).find((pane) => pane.split.isConnected && !pane.split.closest('[hidden]'));
    if (!shown) return;
    ev.preventDefault();
    shown.toggle();
  });
}

/* The grip sits in a zero-size anchor right after the divider rather than in
 * it: a separator's children are presentational, so a button inside would be
 * a nested control. */
function buildGrip() {
  const anchor = document.createElement('span');
  anchor.className = 'split-grip-anchor';
  const grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'split-grip';
  grip.setAttribute('data-help', 'Focus mode');
  grip.innerHTML = '<svg viewBox="0 0 10 12" aria-hidden="true" focusable="false"><path d="M7 2L3 6l4 4"/></svg>';
  anchor.appendChild(grip);
  return { anchor, grip };
}

export function initSplitPane(split) {
  if (!split || split.dataset.split === 'on') return;
  split.dataset.split = 'on';

  const list = split.firstElementChild;
  if (!list) return;

  const divider = document.createElement('div');
  divider.className = 'split-divider';
  divider.setAttribute('role', 'separator');
  divider.tabIndex = 0;
  divider.setAttribute('aria-label', 'Resize the list and detail panes');
  divider.setAttribute('aria-valuemin', '0');
  divider.setAttribute('aria-valuemax', '100');
  divider.title = 'Drag to resize · double-click to reset';
  list.after(divider);

  const { anchor, grip } = buildGrip();
  divider.after(anchor);
  const detail = anchor.nextElementSibling;
  if (list.id) grip.setAttribute('aria-controls', list.id);

  let focused = false;
  let listFocus = null; // where the keyboard was in the list when it was hidden
  let dragging = false;
  let vertical = false;

  /* Under Text size the page is zoomed: pointer positions and rects are in
   * screen pixels, clientWidth is not. This is the ratio between them (1 when
   * the panel is not zoomed, or has no size). */
  const scale = () => {
    const laidOut = split.offsetWidth;
    const shown = split.getBoundingClientRect().width;
    return laidOut > 0 && shown > 0 ? shown / laidOut : 1;
  };
  const extentOf = () => (vertical ? split.clientHeight : split.clientWidth) * scale();

  const isStacked = () => getComputedStyle(split).flexDirection === 'column';

  /* A separator's orientation is the direction of the line itself: a vertical
   * bar between side-by-side panes, a horizontal one between stacked panes. */
  function syncAria() {
    vertical = isStacked();
    divider.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
    const extent = extentOf();
    const size = vertical ? list.getBoundingClientRect().height : list.getBoundingClientRect().width;
    if (focused) divider.setAttribute('aria-valuenow', '0');
    else if (extent > 0) divider.setAttribute('aria-valuenow', String(Math.round((size / extent) * 100)));
    else divider.setAttribute('aria-valuenow', String(unmeasuredShare())); // not laid out (a hidden tab): say what CSS will make it
  }

  /* The list's share in percent while the split has no size: what was dragged
   * to, else the default in panel.css (a separator must always have a value). */
  function unmeasuredShare() {
    const set = parseFloat(split.style.getPropertyValue(vertical ? '--list-h' : '--list-w'));
    return Number.isFinite(set) ? Math.round(set) : (vertical ? DEFAULT_SHARE.stacked : DEFAULT_SHARE.side);
  }

  const minPane = (extent) => Math.min(MIN_PANE_PX, extent * MIN_PANE_SHARE);
  /* The divider's size along the drag axis: its height between stacked panes,
   * where its width is the whole panel and would eat the room to drag into. */
  const dividerSize = () => (vertical ? divider.offsetHeight : divider.offsetWidth) * scale();
  const clamp = (px, extent) => Math.max(minPane(extent), Math.min(px, extent - minPane(extent) - dividerSize()));
  const percent = (px, extent) => `${extent > 0 ? ((px / extent) * 100).toFixed(2) : 50}%`;

  function onMove(ev) {
    if (!dragging) return;
    const rect = split.getBoundingClientRect();
    if (vertical) {
      const px = clamp(ev.clientY - rect.top, extentOf());
      split.style.setProperty('--list-h', percent(px, extentOf()));
    } else {
      const px = clamp(ev.clientX - rect.left, extentOf());
      split.style.setProperty('--list-w', percent(px, extentOf()));
    }
    syncAria();
    ev.preventDefault();
  }

  function stop() {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', stop);
  }

  function paintGrip() {
    const label = focused ? 'Show the list' : 'Hide the list';
    grip.title = `${label} (Ctrl+\\)`;
    grip.setAttribute('aria-label', label);
    grip.setAttribute('aria-expanded', String(!focused));
  }

  /* With the list hidden there is nothing to resize: the grip, the shortcut or
   * a double-click on the divider brings it back at its old width. */
  function setFocusMode(on) {
    if (on === focused) return;
    if (on) listFocus = list.contains(document.activeElement) ? document.activeElement : null;
    focused = on;
    split.classList.toggle('is-focus', on);
    paintGrip();
    syncAria();
    /* Hidden content cannot keep the keyboard: it goes to the grip, and back
     * to where it was when the list returns. */
    if (on && listFocus) grip.focus();
    if (!on && listFocus && listFocus.isConnected) listFocus.focus();
    if (!on) listFocus = null;
  }

  grip.addEventListener('click', () => setFocusMode(!focused));
  if (detail) detail.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !focused || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    setFocusMode(false);
  });
  panes.add({ split, toggle: () => setFocusMode(!focused) });
  mountShortcut();
  paintGrip();

  divider.addEventListener('mousedown', (ev) => {
    if (focused) return;
    syncAria();
    dragging = true;
    divider.classList.add('is-dragging');
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', stop);
    ev.preventDefault();
  });

  /* Double-click restores the default balance for both axes. */
  divider.addEventListener('dblclick', () => {
    if (focused) { setFocusMode(false); return; }
    split.style.removeProperty('--list-w');
    split.style.removeProperty('--list-h');
    syncAria();
  });

  /* Keyboard: Left / Up shrink the list pane, Right / Down grow it. */
  divider.addEventListener('keydown', (ev) => {
    const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[ev.key];
    if (!delta || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    if (focused) return;
    syncAria();
    const rect = list.getBoundingClientRect();
    const current = vertical ? rect.height : rect.width;
    const extent = extentOf();
    const next = clamp(current + delta * KEY_STEP_PX * (ev.shiftKey ? 4 : 1), extent);
    split.style.setProperty(vertical ? '--list-h' : '--list-w', percent(next, extent));
    syncAria();
    divider.setAttribute('aria-valuenow', String(extent > 0 ? Math.round((next / extent) * 100) : 0));
  });

  divider.addEventListener('focus', syncAria);
  syncAria();
}
