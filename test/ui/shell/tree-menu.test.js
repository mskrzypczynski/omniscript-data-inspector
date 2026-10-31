'use strict';

/* The generic tree menu, used as is by any JSON tree and with extra entries
 * by the Data tab (through data/row-menu.js). */

import { jest } from '@jest/globals';
import { openTreeMenu } from '../../../src/ui/tree-menu.js';
import { closeContextMenu } from '../../../src/ui/context-menu.js';

afterEach(() => { closeContextMenu(); document.body.innerHTML = ''; });

const labels = () => [...document.querySelectorAll('.ctx-menu .ctx-item')].map((b) => b.textContent);
const item = (label) => [...document.querySelectorAll('.ctx-menu .ctx-item')].find((b) => b.textContent === label);
const ev = { clientX: 1, clientY: 1 };

const root = { Step: { Name: 'Ada', Rows: [{ Id: 1 }] } };
const row = { path: 'Step', value: root.Step, keyText: 'Step', container: true };

describe('openTreeMenu', () => {
  it('offers the copy entries and the branch entries, and nothing of Data', () => {
    const tree = { expanded: new Set(['', 'Step']), filterOpen: new Map() };
    openTreeMenu(ev, row, { root, tree, filtering: () => false, copy: () => {}, rerender: () => {} });
    expect(labels()).toEqual(['Copy value', 'Copy key', 'Copy OmniScript path', 'Copy as %merge% field',
      'Collapse this branch', 'Expand everything inside', 'Collapse everything inside']);
  });

  it('puts the extra entries after the copy entries', () => {
    const tree = { expanded: new Set(['']), filterOpen: new Map() };
    const hit = jest.fn();
    openTreeMenu(ev, { path: 'Step', value: 'x', keyText: 'Step', container: false }, {
      root, tree, filtering: () => false, copy: () => {}, rerender: () => {}, extra: [{ label: 'Mine', action: hit }]
    });
    expect(labels()).toEqual(['Copy value', 'Copy key', 'Copy OmniScript path', 'Copy as %merge% field', 'Mine']);
    item('Mine').click();
    expect(hit).toHaveBeenCalled();
  });

  it('copies the value and opens the branch', () => {
    const tree = { expanded: new Set(['']), filterOpen: new Map() };
    const copy = jest.fn();
    const rerender = jest.fn();
    openTreeMenu(ev, row, { root, tree, filtering: () => false, copy, rerender });
    item('Expand this branch').click();
    expect(tree.expanded.has('Step')).toBe(true);
    expect(rerender).toHaveBeenCalled();
    openTreeMenu(ev, row, { root, tree, filtering: () => false, copy, rerender });
    item('Copy value').click();
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('"Name": "Ada"'), 'value');
  });
});

