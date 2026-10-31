'use strict';

/* A small right-click menu. One at a time; it closes on any click elsewhere,
 * on Escape, on scroll and when the panel loses focus.
 *
 *   openContextMenu(ev, [{ label, action, disabled, checked }, '-', ...])
 *
 * ev is the event that opened it (or { clientX, clientY, type, detail }).
 * An item with `checked` (true or false) is a menuitemcheckbox: a toggle a
 * View menu lists in place of a row of checkboxes. When ev.currentTarget is a
 * menu button (aria-haspopup), it says aria-expanded while the menu is open.
 */

import { fixedPosition } from '../core/shared/text-size.js';
import { TextSize } from './text-size.js';
import { openedWithMouse } from '../core/shared/menu-focus.js';

let current = null;

/* `restoreFocus`: the keyboard closed it (Esc, or an item chosen), so focus
 * goes back to what had it when the menu opened. A click elsewhere, a scroll or
 * the panel losing focus leave focus where the user put it. */
export function closeContextMenu({ restoreFocus = false } = {}) {
  if (!current) return;
  const { opener, button } = current;
  current.cleanup();
  if (button) button.setAttribute('aria-expanded', 'false');
  current.node.remove();
  current = null;
  if (restoreFocus && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
}

/* The arrows move between the enabled items and wrap; Home and End go to the
 * first and the last. Says whether the key was one of them. */
function moveFocus(node, key) {
  const items = [...node.querySelectorAll('.ctx-item:not(:disabled)')];
  if (!items.length) return false;
  const at = items.indexOf(document.activeElement);
  let target;
  if (key === 'ArrowDown') target = items[at < 0 ? 0 : (at + 1) % items.length];
  else if (key === 'ArrowUp') target = items[at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length];
  else if (key === 'Home') target = items[0];
  else if (key === 'End') target = items[items.length - 1];
  else return false;
  target.focus();
  return true;
}

export function openContextMenu(ev, items) {
  closeContextMenu();
  const opener = document.activeElement;

  const node = document.createElement('div');
  node.className = 'ctx-menu';
  node.setAttribute('role', 'menu');

  items.forEach((item) => {
    if (item === '-') {
      const rule = document.createElement('div');
      rule.className = 'ctx-sep';
      node.appendChild(rule);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctx-item';
    const toggle = typeof item.checked === 'boolean';
    button.setAttribute('role', toggle ? 'menuitemcheckbox' : 'menuitem');
    if (toggle) {
      button.setAttribute('aria-checked', String(item.checked));
      button.classList.add('ctx-check');
    }
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    if (item.title) button.title = item.title;
    button.addEventListener('click', () => { closeContextMenu({ restoreFocus: true }); item.action(); });
    node.appendChild(button);
  });

  document.body.appendChild(node);

  /* Keep it inside the panel: flip to the left / upwards near the edges. */
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  const at = fixedPosition({
    x: ev.clientX, y: ev.clientY, width, height,
    viewWidth: window.innerWidth, viewHeight: window.innerHeight, zoom: TextSize.zoom()
  });
  node.style.left = `${at.left}px`;
  node.style.top = `${at.top}px`;

  const onDown = (down) => { if (!node.contains(down.target)) closeContextMenu(); };
  const onKey = (key) => {
    if (key.key === 'Escape') { key.stopPropagation(); closeContextMenu({ restoreFocus: true }); return; }
    if (key.ctrlKey || key.metaKey || key.altKey || !node.contains(document.activeElement)) return;
    if (moveFocus(node, key.key)) { key.preventDefault(); key.stopPropagation(); }
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);

  /* A menu button says it is open, for assistive technology. */
  const menuButton = ev && ev.currentTarget && typeof ev.currentTarget.getAttribute === 'function'
    && ev.currentTarget.hasAttribute('aria-haspopup') ? ev.currentTarget : null;
  if (menuButton) menuButton.setAttribute('aria-expanded', 'true');

  current = {
    node,
    opener,
    button: menuButton,
    cleanup: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeContextMenu);
      document.removeEventListener('scroll', closeContextMenu, true);
    }
  };

  /* Opened with the keyboard, the first item takes focus. With the mouse the
   * menu itself does, so Escape and Tab still work but nothing looks picked. */
  const first = node.querySelector('.ctx-item:not(:disabled)');
  if (openedWithMouse(ev) || !first) {
    node.tabIndex = -1;
    node.focus({ preventScroll: true });
  } else {
    first.focus();
  }
}
