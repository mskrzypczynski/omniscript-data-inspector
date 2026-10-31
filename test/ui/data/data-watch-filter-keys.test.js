'use strict';

/* Watch notify and pins that follow rows, path / key=value filtering, Copy as
 * %merge%, the partial-copy warning and the tree's keyboard access. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => {
  jest.useRealTimers();
  window.getSelection().removeAllRanges();
  document.body.innerHTML = '';
});

const rows = (ids) => ids.map((id) => ({ Id: id, Code: `c-${id}` }));
const rowFor = (key) => [...viewport().querySelectorAll('.row')].find((r) => r.querySelector(':scope > .k')?.textContent === key);
const keys = () => [...viewport().querySelectorAll('.row')].filter((r) => r.dataset.path !== undefined).map((r) => r.querySelector(':scope > .k')?.textContent);

async function change(value) {
  document.getElementById('a').jsonDataStr = JSON.stringify(value);
  document.getElementById('refresh').click();
  await tick();
}

function setFilter(text) {
  const filter = document.getElementById('filter');
  filter.value = text;
  filter.dispatchEvent(new Event('input'));
  jest.advanceTimersByTime(200);
}

function key(target, name, init = {}) {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('filter box', () => {
  it('takes an OmniScript path with a 1-based row', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step1: { Rows: rows(['x', 'y', 'z']), Other: 'no' } } }] });
    setFilter('Step1:Rows|2:Code');
    expect(viewport().textContent).toContain('c-y');
    expect(viewport().textContent).not.toContain('c-x');
    expect(viewport().textContent).not.toContain('Other');
    expect(viewport().querySelector('mark')).toBe(null); // nothing to highlight in text
  });

  it('takes key=value', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: { Name: 'Ada' }, B: { Name: 'Bea' } } }] });
    setFilter('Name=Bea');
    expect(viewport().textContent).toContain('Bea');
    expect(viewport().textContent).not.toContain('Ada');
  });

  it('searches the text when the path finds nothing', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Link: 'http://example.com', Other: 1 } }] });
    setFilter('http://example');
    expect(viewport().textContent).toContain('http://example.com');
    expect(viewport().textContent).not.toContain('Other');
    expect(viewport().querySelector('mark')).not.toBe(null);
  });

  it('has the syntax in its tooltip and no new control beside it', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: 1 } }] });
    const filter = document.getElementById('filter');
    expect(filter.title).toMatch(/Step:Rows\|2:Field/);
    expect(filter.title).toMatch(/key=value/);
    expect(filter.placeholder).toBe('Filter keys and values');
  });
});

describe('Copy as %merge% field', () => {
  let written;
  beforeEach(() => {
    written = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
    });
  });

  function menuFor(row) {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    return [...document.querySelectorAll('.ctx-menu .ctx-item')];
  }

  it('sits after Copy OmniScript path in the row menu', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    const labels = menuFor(rowFor('Name')).map((item) => item.textContent);
    expect(labels.indexOf('Copy as %merge% field')).toBe(labels.indexOf('Copy OmniScript path') + 1);
  });

  it('copies %Step:Field%', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    menuFor(rowFor('Name')).find((item) => item.textContent === 'Copy as %merge% field').click();
    await tick();
    expect(written).toEqual(['%Step:Name%']);
  });

  it('copies the position inside an array', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Rows: rows(['x', 'y']) } } }] });
    document.getElementById('expand').click();
    const code = [...viewport().querySelectorAll('.row')].filter((r) => r.querySelector(':scope > .k')?.textContent === 'Code')[1];
    menuFor(code).find((item) => item.textContent === 'Copy as %merge% field').click();
    await tick();
    expect(written).toEqual(['%Step:Rows|2:Code%']);
  });
});

describe('copying a windowed tree', () => {
  function copyAll() {
    const range = document.createRange();
    range.selectNodeContents(viewport());
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    viewport().dispatchEvent(event);
    return copied;
  }

  it('says how many rows were copied of how many', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { list: Array.from({ length: 3000 }, (_, i) => i) } }] });
    document.getElementById('expand').click();
    expect(viewport().querySelector('.vwin')).not.toBe(null);
    document.querySelectorAll('.toast').forEach((node) => node.remove());
    const copied = copyAll();
    expect(copied).not.toBe(null);
    expect(document.querySelector('.toast').textContent).toMatch(/^Copied [\d,]+ of 3,004 rows; use Copy JSON for everything$/);
  });

  it('says nothing for a tree that is drawn whole', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { a: 1, b: 2 } }] });
    document.querySelectorAll('.toast').forEach((node) => node.remove());
    expect(copyAll()).not.toBe(null);
    expect(document.querySelector('.toast')).toBe(null);
  });
});

describe('tree keyboard access', () => {
  const data = { Step1: { Name: 'Ada', Rows: rows(['x']) }, Step2: { Name: 'Bea' } };

  it('marks the tree and its rows for assistive technology, with one row in the tab order', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    expect(viewport().getAttribute('role')).toBe('tree');
    const items = [...viewport().querySelectorAll('.row[role="treeitem"]')];
    expect(items.length).toBeGreaterThan(3);
    expect(items.filter((row) => row.tabIndex === 0)).toHaveLength(1);
    const step1 = rowFor('Step1');
    expect(step1.getAttribute('aria-expanded')).toBe('true');
    expect(step1.getAttribute('aria-level')).toBe('2');
    expect(rowFor('Name').hasAttribute('aria-expanded')).toBe(false);
  });

  it('moves with the arrow keys', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    const first = viewport().querySelector('.row[data-path]');
    first.focus();
    const order = [];
    for (let i = 0; i < 3; i++) {
      key(document.activeElement, 'ArrowDown');
      order.push(document.activeElement.querySelector(':scope > .k').textContent);
    }
    expect(order).toEqual(['Step1', 'Name', 'Rows']);
    key(document.activeElement, 'ArrowUp');
    expect(document.activeElement.querySelector(':scope > .k').textContent).toBe('Name');
    key(document.activeElement, 'End');
    expect(document.activeElement.querySelector(':scope > .k').textContent).toBe('Name');
    key(document.activeElement, 'Home');
    expect(document.activeElement).toBe(first);
  });

  it('folds and unfolds with the left and right arrows, keeping focus on the row', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    rowFor('Step1').focus();
    key(rowFor('Step1'), 'ArrowLeft');
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(rowFor('Step1'));
    expect(keys()).not.toContain('Rows');

    key(document.activeElement, 'ArrowRight');
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(rowFor('Step1'));

    key(document.activeElement, 'ArrowRight'); // open: goes to the first child
    expect(document.activeElement.querySelector(':scope > .k').textContent).toBe('Name');
    key(document.activeElement, 'ArrowLeft'); // a leaf: goes to its parent
    expect(document.activeElement.querySelector(':scope > .k').textContent).toBe('Step1');
  });

  it('toggles with Enter and Space', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    rowFor('Step1').focus();
    key(rowFor('Step1'), 'Enter');
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('false');
    const space = key(document.activeElement, ' ');
    expect(space.defaultPrevented).toBe(true);
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves keys typed in a row\'s own buttons to the buttons', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    const button = rowFor('Step1').querySelector('.row-copy');
    button.focus();
    const event = key(button, 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('true');
  });

  it('copies the focused row\'s value with c', async () => {
    const written = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
    });
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    await import('../../../src/ui/panel-shell.js').then(({ mountPanelShell }) => mountPanelShell());
    rowFor('Name').focus();
    key(document.activeElement, 'c');
    await tick();
    expect(written).toEqual(['"Ada"']);
  });

  it('keeps focus on the row through a redraw from new data', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    rowFor('Name').focus();
    await change({ Step1: { Name: 'Ada2', Rows: rows(['x']) }, Step2: { Name: 'Bea' } });
    expect(document.activeElement.classList.contains('row')).toBe(true);
    expect(document.activeElement.dataset.path).toBe(rowFor('Name').dataset.path);
    expect(document.activeElement.textContent).toContain('Ada2');
  });

  it('keeps mouse behaviour: a click on a branch row still toggles it', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
    rowFor('Step1').click();
    expect(rowFor('Step1').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps focus on a row while a long tree is scrolled', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { list: Array.from({ length: 3000 }, (_, i) => i) } }] });
    document.getElementById('expand').click();
    const row = viewport().querySelector('.vwin .row[data-path]');
    row.focus();
    // Scroll the window along: the drawn rows are replaced.
    viewport().scrollTop = 4000;
    viewport().dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(viewport().contains(document.activeElement)).toBe(true);
  });
});
