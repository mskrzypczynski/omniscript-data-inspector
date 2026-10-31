'use strict';

/* "Copy as %merge% field" is also a row button, after the copy button, and puts
 * exactly what the row menu's item puts. */

import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

let written;

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});

afterEach(() => {
  delete navigator.clipboard;
  document.body.innerHTML = '';
});

const DATA = { PlanSelection: { Rows: [{ Code: 'a' }, { Code: 'b' }] } };
const row = (path) => [...viewport().querySelectorAll('.row[data-path]')].find((node) => node.dataset.path === path);
const mergeButton = (path) => row(path).querySelector('.row-copy[aria-label^="Copy as %merge%"]');

describe('the %merge% row button', () => {
  it('sits right after the copy button, with the path in its tooltip and label', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: DATA }] });
    document.getElementById('expand').click();
    const path = [...viewport().querySelectorAll('.row[data-path]')].find((node) => node.querySelector(':scope > .k')?.textContent === 'Code').dataset.path;
    const button = mergeButton(path);
    expect(button.title).toBe('Copy as %merge% field: %PlanSelection:Rows|1:Code%');
    expect(button.getAttribute('aria-label')).toBe(button.title);
    expect(button.getAttribute('data-help')).toBe('Buttons on a row');
    expect(button.querySelector('svg.ui-icon')).not.toBeNull();
    expect(button.previousElementSibling.getAttribute('aria-label')).toMatch(/^Copy this value/);
    expect(button.textContent).toBe(''); // an icon only: nothing leaks into a copied selection
  });

  it('copies what the menu item copies, shows the check mark, and is not masked', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: DATA }] });
    const mask = document.getElementById('mask-values');
    mask.checked = true;
    mask.dispatchEvent(new Event('change'));
    document.getElementById('expand').click();
    await tick();
    const code = [...viewport().querySelectorAll('.row[data-path]')].find((node) => node.querySelector(':scope > .k')?.textContent === 'Code');
    const button = mergeButton(code.dataset.path);
    button.click();
    await tick();
    expect(written).toEqual(['%PlanSelection:Rows|1:Code%']);
    expect(button.classList.contains('is-done')).toBe(true);

    code.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === 'Copy as %merge% field').click();
    await tick();
    expect(written[1]).toBe(written[0]);
  });

  it('is not on the root row, which has no path', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: DATA }] });
    expect(mergeButton('')).toBeNull();
  });
});
