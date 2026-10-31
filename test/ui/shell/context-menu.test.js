'use strict';

/* The context menu from the keyboard: the arrows move between its items (and
 * wrap), Home and End go to the ends, disabled items are skipped, and when it
 * closes by the keyboard focus goes back to what had it. */

import { jest } from '@jest/globals';
import { openContextMenu, closeContextMenu } from '../../../src/ui/context-menu.js';

const key = (name, init = {}) => {
  const ev = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  (document.activeElement || document.body).dispatchEvent(ev);
  return ev;
};
const items = () => [...document.querySelectorAll('.ctx-item')];

let opener;
let actions;

function open(init = {}) {
  actions = { a: jest.fn(), b: jest.fn(), c: jest.fn() };
  openContextMenu({ clientX: 5, clientY: 5, type: 'keydown', detail: 0, ...init }, [
    { label: 'One', action: actions.a },
    { label: 'Two', action: actions.b, disabled: true },
    '-',
    { label: 'Three', action: actions.c }
  ]);
}

beforeEach(() => {
  document.body.innerHTML = '<button id="opener">row</button>';
  opener = document.getElementById('opener');
  opener.focus();
});

afterEach(() => { closeContextMenu(); document.body.innerHTML = ''; });

describe('context menu keys', () => {
  it('moves down and up through the enabled items, wrapping, and skips a disabled one', () => {
    open();
    expect(document.activeElement).toBe(items()[0]); // opened with the keyboard: the first item
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items()[2]); // Two is disabled
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[0]); // wraps
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('goes to the first and last item with Home and End', () => {
    open();
    key('End');
    expect(document.activeElement).toBe(items()[2]);
    key('Home');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('starts from the ends when the menu itself has the focus (opened with the mouse)', () => {
    open({ type: 'contextmenu', button: 2, detail: 0 });
    expect(document.activeElement).toBe(document.querySelector('.ctx-menu'));
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    document.querySelector('.ctx-menu').focus();
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('keeps the arrow keys from reaching the page', () => {
    const page = jest.fn();
    document.addEventListener('keydown', page);
    open();
    key('ArrowDown');
    expect(page).not.toHaveBeenCalled();
    document.removeEventListener('keydown', page);
  });

  it('gives focus back to the element it was opened on when Esc closes it', () => {
    open();
    key('Escape');
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('gives focus back before the chosen action runs', () => {
    open();
    let focusedDuringAction = null;
    actions.c.mockImplementation(() => { focusedDuringAction = document.activeElement; });
    key('ArrowDown');
    items()[2].click();
    expect(actions.c).toHaveBeenCalled();
    expect(focusedDuringAction).toBe(opener);
  });

  it('leaves focus where the user put it when a click elsewhere closes it', () => {
    open();
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(document.activeElement).toBe(other);
  });
});

describe('context menu toggles and menu buttons', () => {
  it('lists an item with checked as a menuitemcheckbox that says its state', () => {
    openContextMenu({ clientX: 5, clientY: 5, type: 'keydown', detail: 0 }, [
      { label: 'On', action: () => {}, checked: true },
      { label: 'Off', action: () => {}, checked: false },
      { label: 'Plain', action: () => {} }
    ]);
    const [on, off, plain] = items();
    expect(on.getAttribute('role')).toBe('menuitemcheckbox');
    expect(on.getAttribute('aria-checked')).toBe('true');
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(plain.getAttribute('role')).toBe('menuitem');
    expect(plain.hasAttribute('aria-checked')).toBe(false);
  });

  it('marks the menu button that opened it as expanded until it closes', () => {
    document.body.innerHTML = '<button id="menu-btn" aria-haspopup="menu" aria-expanded="false">View</button>';
    const button = document.getElementById('menu-btn');
    openContextMenu({ clientX: 5, clientY: 5, type: 'click', detail: 1, currentTarget: button }, [{ label: 'A', action: () => {} }]);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    closeContextMenu();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
