'use strict';

/* The JSON trees of the Structure detail pane offer the same right-click menu
 * as the Data tab. */

import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

let written;
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Field', type: 'Text', propSetMap: { label: 'Name', options: [{ name: 'a', value: 'A' }], remoteOptions: { a: { b: { c: { d: 'x' } } } } } }
] }];
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const rowFor = (key) => [...document.querySelectorAll('#struct-detail .row')]
  .find((row) => row.querySelector(':scope > .k')?.textContent === key);
const menuFor = (row) => {
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  return [...document.querySelectorAll('.ctx-menu .ctx-item')];
};

describe('right-click on a tree in the detail pane', () => {
  it('opens the shared tree menu on the JSON tree and copies the key and the value', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Field: 'Ada' } } }] });
    clickRow('Field');
    tabButton('JSON').click();
    document.getElementById('struct-detail').querySelector('.detail-tools .icon-btn[title^="Expand"]').click();

    const labels = menuFor(rowFor('name')).map((item) => item.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Copy value', 'Copy key', 'Copy OmniScript path', 'Copy as %merge% field']));

    menuFor(rowFor('name')).find((item) => item.textContent === 'Copy key').click();
    await tick();
    expect(written).toEqual(['name']);
  });

  it('offers to collapse and expand a branch, and the tree follows', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: {} }] });
    clickRow('Field');
    tabButton('Properties').click();
    document.querySelector('.prop-toggle').click(); // opens the too-deep "remoteOptions" as a tree
    const root = [...document.querySelectorAll('.prop-tree .row')][0];
    const items = menuFor(root);
    expect(items.map((item) => item.textContent)).toContain('Collapse this branch');
    items.find((item) => item.textContent === 'Collapse this branch').click();
    expect(document.querySelectorAll('.prop-tree .row')).toHaveLength(1);
  });
});
