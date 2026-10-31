'use strict';

/* The Structure toolbar's View and More menus, driven the way a user does:
 * press the button, read or press an item. The menus are drawn on demand, so
 * a test that wants a switch's state opens the menu, reads it and closes it. */


/* Esc, like a user: the app's own copy of the menu module closes it (a test may hold another copy). */
const closeMenu = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

const items = () => [...document.querySelectorAll('.ctx-menu .ctx-item')];

/* The item with this label in the open menu, or undefined. */
export const menuItem = (label) => items().find((item) => item.textContent === label);

/* Opens a menu button's menu (View by default). */
export function openMenu(id = 'struct-view') {
  document.getElementById(id).click();
}

/* Is the View switch with this label on? undefined when the menu has no such switch. */
export function viewOn(label) {
  openMenu();
  const item = menuItem(label);
  const on = item ? item.getAttribute('aria-checked') === 'true' : undefined;
  closeMenu();
  return on;
}

/* Presses a View switch. */
export function toggleView(label) {
  openMenu();
  menuItem(label).click();
}

/* Puts a View switch on or off (does nothing when it already is). */
export function setView(label, on) {
  if (viewOn(label) !== on) toggleView(label);
}

/* The labels of the open menu, in order. */
export const menuLabels = () => items().map((item) => item.textContent);

/* Presses an item of the More menu (Timeline, Compare definition, Export ...). */
export function pressMore(label) {
  openMenu('struct-more');
  menuItem(label).click();
}

/* Is the More menu's Timeline item ticked (the pane shows the Timeline)? */
export function timelineOn() {
  openMenu('struct-more');
  const on = menuItem('Timeline').getAttribute('aria-checked') === 'true';
  closeMenu();
  return on;
}
