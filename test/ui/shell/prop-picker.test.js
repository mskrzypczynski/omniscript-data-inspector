import { jest } from '@jest/globals';
import { attachPropPicker } from '../../../src/ui/prop-picker.js';

function setup() {
  document.body.innerHTML = '<input id="p" value="jsonDef" />';
  const input = document.getElementById('p');
  attachPropPicker(input, (done) => done([
    { name: 'jsonDataStr', type: 'string' },
    { name: 'jsonDef', type: 'string' },
    { name: 'recordId', type: 'string' }
  ]));
  return input;
}

const menuNames = () => [...document.querySelectorAll('.prop-item > span:first-child')].map((el) => el.textContent);

describe('property picker', () => {
  it('lists every property on focus even when the input already has a value', () => {
    const input = setup();
    input.dispatchEvent(new Event('focus'));
    expect(menuNames()).toEqual(['jsonDataStr', 'jsonDef', 'recordId']);
  });

  it('fuzzy-filters while typing', () => {
    const input = setup();
    input.dispatchEvent(new Event('focus'));
    input.value = 'rid';
    input.dispatchEvent(new Event('input'));
    expect(menuNames()).toEqual(['recordId']);
  });

  it('picks with Enter and fires change', () => {
    const input = setup();
    let changes = 0;
    input.addEventListener('change', () => { changes++; });
    input.dispatchEvent(new Event('focus'));
    input.value = 'jds';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(input.value).toBe('jsonDataStr');
    expect(changes).toBe(1);
    expect(document.querySelector('.prop-menu').hidden).toBe(true);
  });
});

describe('property picker in a dialog', () => {
  it('names its listbox and tells a screen reader which option is active', () => {
    const input = setup();
    input.dispatchEvent(new Event('focus'));
    const menu = document.querySelector('.prop-menu');
    expect(menu.getAttribute('aria-label')).toBeTruthy();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe(menu.id);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(document.querySelector('.prop-item.is-active').id);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes only the menu on Esc while it is open, and lets Esc through when it is closed', () => {
    const input = setup();
    const reached = jest.fn();
    document.addEventListener('keydown', reached);
    input.dispatchEvent(new Event('focus'));
    const esc = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    esc();
    expect(document.querySelector('.prop-menu').hidden).toBe(true);
    expect(reached).not.toHaveBeenCalled(); // the dialog around the field stays open
    esc();
    expect(reached).toHaveBeenCalledTimes(1); // the next one is the dialog's
    document.removeEventListener('keydown', reached);
  });

  it('stays inside a narrow panel: slid left, never wider than the panel', () => {
    const input = setup();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 340 });
    input.getBoundingClientRect = () => ({ left: 123, right: 263, bottom: 60, width: 140, top: 40, height: 20 });
    input.dispatchEvent(new Event('focus'));
    const menu = document.querySelector('.prop-menu');
    const left = parseFloat(menu.style.left);
    const width = parseFloat(menu.style.minWidth);
    expect(left + width).toBeLessThanOrEqual(340 - 4);
    expect(left).toBeGreaterThanOrEqual(4);
    delete window.innerWidth;
  });
});
