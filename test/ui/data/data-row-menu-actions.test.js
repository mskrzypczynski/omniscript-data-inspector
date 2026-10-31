'use strict';

/* Explicit actions on the Data tree: a jump lets go of selected text, and
 * "Filter to this key" is a key search. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => {
  jest.useRealTimers();
  window.getSelection().removeAllRanges();
  document.body.innerHTML = '';
});

const keyRow = (key) => [...viewport().querySelectorAll('.row')].find((row) => row.querySelector(':scope > .k')?.textContent === key);

function selectViewportText() {
  const range = document.createRange();
  range.selectNodeContents(viewport());
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('a jump while text is selected in the tree', () => {
  it('lets go of the selection and shows the row', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { A: { B: { C: { D: 'deep' } } }, Other: 1 } }] });
    const { Nav } = await import('../../../src/ui/nav.js');
    document.getElementById('collapse').click();
    await tick();
    expect(keyRow('D')).toBeUndefined();

    selectViewportText();
    expect(window.getSelection().isCollapsed).toBe(false);
    Nav.go('data', { segments: ['A', 'B', 'C', 'D'] });
    await tick();

    expect(window.getSelection().isCollapsed).toBe(true);
    expect(keyRow('D')).not.toBeUndefined();
    expect(Targets.selected()).not.toBe(null);
  });
});

describe('Filter to this key', () => {
  async function filterToKey(data, key) {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data }] });
    keyRow(key).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    [...document.querySelectorAll('.ctx-menu .ctx-item')].find((b) => b.textContent === 'Filter to this key').click();
    return document.getElementById('filter').value;
  }

  it('searches for the key, not for the word in any value', async () => {
    const value = await filterToKey({ Step: { Name: 'Ada', Note: 'Name of the file' } }, 'Name');
    expect(value).toBe('Name=');
    jest.useFakeTimers();
    expect(viewport().textContent).toContain('Ada');
  });

  it('keeps plain text for a key the filter syntax would read as something else', async () => {
    expect(await filterToKey({ 'a:b': 1 }, 'a:b')).toBe('a:b');
  });
});
