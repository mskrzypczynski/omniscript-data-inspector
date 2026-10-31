'use strict';

/* The tab strip's order: tabs can be dragged into another order, or moved
 * with Alt+Shift+← / → while one has focus. The order is a setting (listed
 * among the settings that differ in Settings, put back by a reset) and, unlike the others, kept in
 * extension storage so it survives closing DevTools. Deciding the order is in
 * src/core/shared/tab-order.js. */

import { DEFAULT_ORDER, formatOrder, parseOrder, moveTab } from '../core/shared/tab-order.js';
import { Settings } from './settings.js';
import { readStored, writeStored, removeStored } from './stored.js';

const STORE_KEY = 'tabOrder';

let strip = null;
let order = DEFAULT_ORDER.slice();
let dragged = null;

function buttonOf(key) {
  return document.getElementById(`tab-${key}`);
}

/* Puts the buttons in ORDER; focus stays where it was. */
function apply(next, { save = true } = {}) {
  order = next.slice();
  const focused = document.activeElement;
  order.forEach((key) => strip.appendChild(buttonOf(key)));
  if (focused && focused.isConnected && focused !== document.activeElement && focused.focus) focused.focus();
  Settings.set('tabOrder', formatOrder(order));
  if (!save) return;
  const isDefault = formatOrder(order) === formatOrder(DEFAULT_ORDER);
  (isDefault ? removeStored(STORE_KEY) : writeStored(STORE_KEY, formatOrder(order))).catch(() => {});
}

function keyOf(button) {
  return button && button.id ? button.id.replace(/^tab-/, '') : null;
}

function wireDragging() {
  order.forEach((key) => {
    const button = buttonOf(key);
    button.draggable = true;
    button.addEventListener('dragstart', (ev) => {
      dragged = key;
      button.classList.add('is-dragging');
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', key);
      }
    });
    button.addEventListener('dragend', () => {
      dragged = null;
      button.classList.remove('is-dragging');
      strip.querySelectorAll('.drop-before, .drop-after').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
    });
  });

  /* Dropped on the left half of a tab: before it; on the right half: after. */
  const target = (ev) => {
    const over = ev.target.closest && ev.target.closest('.tab');
    if (!over || !dragged || keyOf(over) === dragged) return null;
    const rect = over.getBoundingClientRect();
    return { over, after: ev.clientX > rect.left + rect.width / 2 };
  };
  strip.addEventListener('dragover', (ev) => {
    const hit = target(ev);
    strip.querySelectorAll('.drop-before, .drop-after').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
    if (!hit) return;
    ev.preventDefault();
    hit.over.classList.add(hit.after ? 'drop-after' : 'drop-before');
  });
  strip.addEventListener('drop', (ev) => {
    const hit = target(ev);
    if (!hit) return;
    ev.preventDefault();
    const rest = order.filter((key) => key !== dragged);
    const at = rest.indexOf(keyOf(hit.over)) + (hit.after ? 1 : 0);
    apply(moveTab(order, dragged, at));
  });
}

/* Alt+Shift+← / → moves the focused tab one place. */
function wireKeys() {
  strip.addEventListener('keydown', (ev) => {
    if (!ev.altKey || !ev.shiftKey || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    const key = keyOf(ev.target.closest && ev.target.closest('.tab'));
    if (!key) return;
    ev.preventDefault();
    ev.stopPropagation();
    apply(moveTab(order, key, order.indexOf(key) + (ev.key === 'ArrowRight' ? 1 : -1)));
    buttonOf(key).focus();
  });
}

export const TabOrder = {
  mount(tablist) {
    strip = tablist;
    wireDragging();
    wireKeys();
    Settings.provide(() => ({ tabOrder: formatOrder(order) }));
    Settings.onReset((scope) => {
      if (Settings.inScope(scope, 'tabOrder')) apply(parseOrder(Settings.get('tabOrder')));
    });
    /* The saved order arrives a moment after the panel draws. */
    return readStored(STORE_KEY)
      .then((saved) => { if (saved) apply(parseOrder(saved), { save: false }); })
      .catch(() => {});
  },
  /* Tab keys in the order shown, for the arrow keys and the 1–4 shortcuts. */
  order: () => order.slice()
};
