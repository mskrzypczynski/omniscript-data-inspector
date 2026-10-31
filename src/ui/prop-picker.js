'use strict';

/* Attaches a dropdown of the selected element's properties to a text input.
 * Opens on focus listing everything, narrows with a fuzzy filter as you type,
 * and picking one fires the input's normal `change` event, so the owning tab
 * needs no special handling. Free typing still works for names not listed.
 * Returns a function that removes the menu from the page. */

import { fuzzyFilter } from '../core/shared/fuzzy.js';
import { TextSize } from './text-size.js';

const MAX_SHOWN = 60;
const MENU_MIN_WIDTH = 220;
const EDGE = 4; // the gap kept to the panel's edge
let pickers = 0;

export function attachPropPicker(input, loadProps) {
  const menu = document.createElement('div');
  menu.className = 'prop-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Properties of the selected element');
  menu.id = `prop-menu-${++pickers}`;
  document.body.appendChild(menu);

  let all = [];
  let shown = [];
  let active = 0;
  let typed = false;
  let open = false;

  function place() {
    const box = input.getBoundingClientRect();
    const z = TextSize.zoom(); // the box is in screen pixels, the style in the zoomed page's
    const room = window.innerWidth / z - 2 * EDGE;
    /* Never wider than the panel, and slid left when it would run past the right edge. */
    const width = Math.min(Math.max(box.width / z, MENU_MIN_WIDTH), room);
    const left = Math.max(EDGE, Math.min(box.left / z, window.innerWidth / z - width - EDGE));
    menu.style.left = `${left}px`;
    menu.style.top = `${(box.bottom + 2) / z}px`;
    menu.style.minWidth = `${width}px`;
    menu.style.maxWidth = `${room}px`;
    menu.style.maxHeight = `${Math.max(120, (window.innerHeight - box.bottom - 12) / z)}px`;
  }

  function draw() {
    menu.textContent = '';
    shown = fuzzyFilter(all, typed ? input.value : '').slice(0, MAX_SHOWN);
    active = Math.min(active, Math.max(0, shown.length - 1));
    /* Before the user types, the list is the full set; the property already in
     * the field is highlighted so it is easy to see and to move away from. */
    const currentName = typed ? null : input.value;

    if (!shown.length) {
      const none = document.createElement('div');
      none.className = 'prop-empty';
      input.removeAttribute('aria-activedescendant');
      none.textContent = all.length ? 'No matching property — press Enter to use what you typed' : 'No properties found on the selected element';
      menu.appendChild(none);
      return;
    }

    shown.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = `prop-item${i === active ? ' is-active' : ''}${item.name === currentName ? ' is-current' : ''}`;
      row.setAttribute('role', 'option');
      row.id = `${menu.id}-${i}`;
      row.setAttribute('aria-selected', i === active ? 'true' : 'false');

      const name = document.createElement('span');
      name.textContent = item.name;
      row.appendChild(name);

      const type = document.createElement('span');
      type.className = 'prop-type';
      type.textContent = item.type;
      row.appendChild(type);

      row.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // keep focus in the input
        choose(item);
      });
      menu.appendChild(row);
    });

    const current = menu.children[active];
    input.setAttribute('aria-activedescendant', current.id);
    if (current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
  }

  function show() {
    if (open) return;
    open = true;
    input.setAttribute('aria-expanded', 'true');
    typed = false;
    active = 0;
    menu.hidden = false;
    place();
    loadProps((props) => {
      all = props || [];
      if (open && !typed) active = Math.max(0, all.findIndex((item) => item.name === input.value));
      if (open) draw();
    });
    draw();
  }

  function hide() {
    open = false;
    menu.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function choose(item) {
    input.value = item.name;
    hide();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', menu.id);
  input.setAttribute('aria-expanded', 'false');
  input.addEventListener('focus', () => {
    show();
    /* Select the current name so typing replaces it and filters at once. */
    setTimeout(() => { if (open && !typed && document.activeElement === input) input.select(); }, 0);
  });
  input.addEventListener('click', show);
  input.addEventListener('blur', hide);

  input.addEventListener('input', () => {
    if (!open) show();
    typed = true;
    active = 0;
    draw();
  });

  input.addEventListener('keydown', (ev) => {
    /* Esc closes the menu first; a dialog around the field then stays open. */
    if (ev.key === 'Escape') {
      if (open) { ev.preventDefault(); ev.stopPropagation(); }
      hide();
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!open) { show(); return; }
      if (!shown.length) return;
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      draw();
      return;
    }
    if (ev.key === 'Enter' && open && typed && shown[active]) {
      ev.preventDefault();
      choose(shown[active]);
    }
  });

  /* For a field that is built again (the Settings dialog): drop the menu with it. */
  return () => { hide(); menu.remove(); };
}
