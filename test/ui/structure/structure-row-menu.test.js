'use strict';

/* Right-click on a row of the Structure list opens a menu about that element. */

import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

let written;
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});
afterEach(() => document.querySelectorAll('.ctx-menu').forEach((node) => node.remove()));

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Kind', type: 'Text', JSONPath: 'Intro:Kind' },
  { name: 'Box', type: 'Block', elements: [{ name: 'Inner', type: 'Text', JSONPath: 'Intro:Box:Inner' }] }
] }];
const boot = () => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Kind: 'a', Box: { Inner: 'b' } } } }] });
const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));
const rightClick = (row) => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
const menu = () => [...document.querySelectorAll('.ctx-menu .ctx-item')];
const choose = (label) => menu().find((item) => item.textContent === label).click();

describe('right-click on a Structure row', () => {
  it('opens a menu about the element, and marks the row while it is open', async () => {
    await boot();
    rightClick(rowOf('Kind'));
    expect(menu().map((item) => item.textContent)).toEqual(['Copy name', 'Copy OmniScript path', 'Show in Data', 'Highlight on page', 'Select this row']);
    expect(rowOf('Kind').classList.contains('is-menu-target')).toBe(true);
    expect(rowOf('Intro').classList.contains('is-menu-target')).toBe(false);
  });

  it('removes the mark when the menu closes, however it closes', async () => {
    await boot();
    rightClick(rowOf('Kind'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(document.querySelectorAll('#struct-list .is-menu-target')).toHaveLength(0);
  });

  it('keeps the mark on the row when the list is redrawn under an open menu', async () => {
    await boot();
    rightClick(rowOf('Kind'));
    document.getElementById('struct-filter').value = '';
    document.getElementById('struct-expand').click(); // redraws the rows
    expect(rowOf('Kind').classList.contains('is-menu-target')).toBe(true);
  });

  it('copies the name and the OmniScript path', async () => {
    await boot();
    rightClick(rowOf('Inner'));
    choose('Copy name');
    await tick();
    rightClick(rowOf('Inner'));
    choose('Copy OmniScript path');
    await tick();
    expect(written).toEqual(['Inner', 'Intro:Box:Inner']);
  });

  it('does not select the row for a right-click, and Select does', async () => {
    await boot();
    rightClick(rowOf('Kind'));
    expect(document.querySelector('#struct-list .el-row.is-selected .el-name').textContent).not.toContain('Kind');
    choose('Select this row');
    expect(document.querySelector('#struct-list .el-row.is-selected .el-name').textContent).toContain('Kind');
  });

  it('opens the Data tab at the element with Show in Data', async () => {
    const { Nav } = await boot();
    const go = jest.fn();
    Nav.on('data', go);
    rightClick(rowOf('Kind'));
    choose('Show in Data');
    expect(go).toHaveBeenCalledWith({ segments: ['Intro', 'Kind'] });
  });

  it('collapses and expands a branch, with everything inside it', async () => {
    await boot();
    rightClick(rowOf('Intro'));
    choose('Collapse this branch');
    expect(rowOf('Kind')).toBeUndefined();
    expect(rowOf('Box')).toBeUndefined();

    rightClick(rowOf('Intro'));
    expect(menu().map((item) => item.textContent)).toContain('Expand this branch');
    choose('Expand this branch');
    expect(rowOf('Inner')).toBeDefined();
  });

  it('offers Highlight on page for an element drawn on the page, with no Advanced switch to turn on', async () => {
    await boot();
    rightClick(rowOf('Kind'));
    expect(menu().map((item) => item.textContent)).toContain('Highlight on page');
  });
});
