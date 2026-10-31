'use strict';

/* Small tree behaviours of the Data tab: numeric object keys, Expand all on a
 * big payload, and the row menu's branch actions. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

const keyRow = (key) => [...viewport().querySelectorAll('.row')].find((row) => row.querySelector(':scope > .k')?.textContent === key);

describe('numeric object keys', () => {
  it('are keys, not array positions', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Map: { 7: 'x' }, List: ['y'] } }] });
    viewport().querySelectorAll('.row').forEach(() => {});
    const seven = keyRow('7');
    expect(seven.querySelector('.k').classList.contains('is-index')).toBe(false);
    const zero = keyRow('0');
    expect(zero.querySelector('.k').classList.contains('is-index')).toBe(true);
  });

  it('are copied with their key, an array item without', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Map: { 7: 'x' }, List: ['y'] } }] });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(viewport());
    selection.removeAllRanges();
    selection.addRange(range);

    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    viewport().dispatchEvent(event);
    selection.removeAllRanges();

    expect(copied).toContain('"7": "x"');
    expect(copied).toMatch(/\n\s+"y"/);
  });
});

describe('Expand all', () => {
  it('opens branches, not leaves, and says when it stopped short', async () => {
    const rows = Array.from({ length: 20500 }, () => ({ x: { y: 1 } }));
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { rows } }] });
    document.getElementById('expand').click();
    await tick();
    expect(document.querySelector('.toast').textContent).toBe('Opened the first 20,000 branches');
  });

  it('stays quiet when everything fits, even with many leaves', async () => {
    document.querySelectorAll('.toast').forEach((node) => node.remove());
    const rows = Array.from({ length: 30000 }, (_, i) => i);
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { rows } }] });
    document.getElementById('expand').click();
    await tick();
    expect(document.querySelector('.toast')).toBe(null);
  });
});

describe('drawing', () => {
  it('stacks no second tree when the definition is there while the first one is drawn', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    expect(viewport().querySelectorAll('.row[data-path=""]')).toHaveLength(1);
  });
});

describe('tree rows', () => {
  it('keep a long text out of the tooltip, which would copy it whole on every redraw', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Big: 'x'.repeat(50000), Small: 'short' } }] });
    const title = keyRow('Big').querySelector('.v').title;
    expect(title.length).toBeLessThan(1200);
    expect(title.endsWith('…')).toBe(true);
    expect(keyRow('Small').querySelector('.v').title).toBe('short');
  });
});

describe('text filter', () => {
  it('does not take the position of a list item for a key', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Rows: [{ Code: 'a' }, { Code: 'b' }], Other: 'z' } }] });
    const filter = document.getElementById('filter');
    filter.value = '1';
    filter.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    expect(viewport().querySelector('.row')).toBe(null);
  });
});

describe('an empty property', () => {
  it('says there is nothing on it, not that it is invalid JSON', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: '', def: { children: [] } }] });
    expect(viewport().textContent).toContain('Nothing on jsonDataStr');
    expect(viewport().textContent).not.toContain('not valid JSON');
  });
});

describe('Raw search', () => {
  it('ignores spaces around the filter text, like the tree does', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Name: 'Ada', Other: 'Bea' } }] });
    document.getElementById('view-raw').click();
    const filter = document.getElementById('filter');
    filter.value = ' Ada ';
    filter.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    expect(viewport().querySelectorAll('mark').length).toBe(1);
    expect(viewport().querySelector('mark').textContent).toBe('Ada');
  });
});
