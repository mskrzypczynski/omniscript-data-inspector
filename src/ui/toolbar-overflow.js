'use strict';

/* Narrow toolbars: while the panel is narrower than 600 px, every control that
 * carries a data-overflow attribute moves out of its toolbar into one "…"
 * button at the end of it, which opens a menu with one item per moved control.
 * Above 600 px they go back where they were.
 *
 * The controls are moved, never cloned, so their ids, listeners and state
 * survive; a comment node marks the place each one came from. A menu item
 * clicks the real control, and a switch shows its state in the item. Tabs only
 * mark their deeper-dive controls (data-overflow in panel.html); the moving is
 * all here. When ResizeObserver is missing (jsdom) nothing moves until
 * applyWidth is called. */

import { isNarrow, overflowItemLabel } from '../core/shared/toolbar-overflow.js';
import { openContextMenu } from './context-menu.js';

let narrow = false;
const homes = new Map(); // control -> the comment that marks its place
const menus = new Map(); // toolbar -> { button, holder }

const toolbars = () => Array.from(document.querySelectorAll('.toolbar'));
const controlsOf = (toolbar) => Array.from(toolbar.querySelectorAll('[data-overflow]'));

/* The control's name for the menu: its visible label, else its aria-label or
 * title. A field with a checkbox has the text in its span. */
function nameOf(control) {
  const label = control.querySelector('.btn-label, span');
  const text = (label ? label.textContent : control.textContent).trim();
  return text || control.getAttribute('aria-label') || control.title || control.id || 'Control';
}

/* The element that gets clicked: the checkbox inside a field, else the control. */
const targetOf = (control) => control.querySelector('input[type="checkbox"]') || control;

/* On / off for a toggle (checkbox, switch, pressed button); undefined for a
 * plain button. */
function stateOf(control) {
  const target = targetOf(control);
  if (target.matches('input[type="checkbox"]')) return target.checked;
  const pressed = target.getAttribute('aria-pressed') ?? target.getAttribute('aria-checked');
  if (pressed === 'true') return true;
  if (pressed === 'false') return false;
  return undefined;
}

/* A control its own tab keeps out of sight has no place in the menu either. */
function available(control) {
  if (control.hidden) return false;
  const home = homes.get(control); // while moved, the row it came from may be hidden
  if (home && home.parentElement && home.parentElement.closest('[hidden]')) return false;
  return true;
}

function menuItems(toolbar) {
  return controlsOf(toolbar).filter(available).map((control) => {
    const target = targetOf(control);
    return {
      label: overflowItemLabel(nameOf(control), stateOf(control)),
      disabled: !!target.disabled,
      action: () => target.click()
    };
  });
}

function makeButton(toolbar) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn overflow-btn';
  button.textContent = '…';
  button.title = 'More';
  button.setAttribute('aria-label', 'More');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('data-help', 'More');
  button.addEventListener('click', (ev) => {
    const items = menuItems(toolbar);
    if (!items.length) return;
    const box = button.getBoundingClientRect();
    openContextMenu({ clientX: box.right, clientY: box.bottom, type: ev.type, detail: ev.detail }, items);
  });
  return button;
}

/* The "…" button goes at the end of the toolbar's first row, the one that held
 * the controls, so it never sits on a row of its own. */
const hostRow = (toolbar) => toolbar.querySelector('.bar') || toolbar;

function refreshButton(toolbar) {
  const menu = menus.get(toolbar);
  if (menu) menu.button.hidden = !narrow || menuItems(toolbar).length === 0;
}

function collapse(toolbar) {
  const controls = controlsOf(toolbar);
  if (!controls.length) return;

  let menu = menus.get(toolbar);
  if (!menu) {
    const holder = document.createElement('div');
    holder.className = 'overflow-holder';
    holder.hidden = true;
    menu = { button: makeButton(toolbar), holder };
    menus.set(toolbar, menu);
  }
  hostRow(toolbar).append(menu.button);
  toolbar.append(menu.holder);

  controls.forEach((control) => {
    const marker = document.createComment('overflow');
    control.before(marker);
    homes.set(control, marker);
    menu.holder.append(control);
  });
  refreshButton(toolbar);
}

function expand() {
  homes.forEach((marker, control) => { marker.replaceWith(control); });
  homes.clear();
  menus.forEach((menu) => { menu.button.hidden = true; });
}

/* Where a popup of `control` should hang: its own box, or, while it is out of
 * sight in the overflow menu (its box is then all zeros, which put the popup in
 * the panel's corner), the "…" button that stands for it. */
export function anchorRect(control) {
  const holder = control.closest('.overflow-holder');
  const menu = holder && Array.from(menus.values()).find((entry) => entry.holder === holder);
  return (menu ? menu.button : control).getBoundingClientRect();
}

/* Put the toolbars in the layout for this width (CSS px). Does nothing while
 * the layout is already right, so a resize that stays on one side is free. */
export function applyWidth(width) {
  const next = isNarrow(width);
  if (next === narrow) return;
  narrow = next;
  if (narrow) toolbars().forEach(collapse); else expand();
}

/* Watch the panel's width. No ResizeObserver (jsdom): the width is only
 * handed over by applyWidth. */
export function mountToolbarOverflow() {
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver((entries) => {
      const box = entries[entries.length - 1];
      applyWidth(box && box.contentRect ? box.contentRect.width : 0);
    }).observe(document.body);
  }

  /* What a moved control may offer changes without the width changing:
   * a class on the body, and a tab being shown. A tab that was out of
   * sight when the panel became narrow got no "…" button (its controls count
   * as unavailable while their section is hidden), so it is looked at again
   * as it is shown. */
  if (typeof MutationObserver === 'undefined') return;
  const watcher = new MutationObserver(() => {
    if (narrow) toolbars().forEach(refreshButton);
  });
  watcher.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('.view').forEach((view) => watcher.observe(view, { attributes: true, attributeFilter: ['hidden'] }));
}

/* For tests: forget what was moved without putting it back. */
export function resetToolbarOverflow() {
  homes.clear();
  menus.clear();
  narrow = false;
}
