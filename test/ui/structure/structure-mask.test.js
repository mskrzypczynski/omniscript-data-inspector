'use strict';

/* Mask values on: a loaded definition can carry what a person typed (an
 * element's `response`, a `defaultValue`). None of it leaves the panel through
 * Export > Definition JSON, a detail tab's Copy, or the tree menu. Names and
 * values here are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

let saved;
let written;
let clickSpy;

beforeEach(() => {
  saved = [];
  written = [];
  global.URL.createObjectURL = jest.fn((blob) => { saved.push({ blob }); return 'blob:test'; });
  global.URL.revokeObjectURL = jest.fn();
  clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload() {
    saved[saved.length - 1].name = this.download;
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});
afterEach(() => { clickSpy.mockRestore(); document.querySelectorAll('.ctx-menu').forEach((n) => n.remove()); });

/* A script whose Field carries an answer, as the runtime leaves it on a loaded definition. */
function answered() {
  const def = definition({ steps: [{ name: 'Intro', elements: [
    { name: 'Field', type: 'Text', propSetMap: { label: 'Name', defaultValue: 'Kept Default' } }
  ] }] });
  const field = def.children[0].children[0].eleArray[0];
  field.response = 'Ada Secret';
  field.propSetMap.response = 'Ada Secret Again';
  return def;
}

async function bootMasked() {
  const page = await bootStructure({ scripts: [{ id: 'main', def: answered(), data: { Intro: { Field: 'Ada Secret' } } }] });
  const { Mask } = await import('../../../src/ui/mask-setting.js');
  Mask.mount(document.getElementById('mask-values'));
  const box = document.getElementById('mask-values');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  return page;
}

const choose = (label) => [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === label).click();
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));

describe('Mask values and the answers inside a definition', () => {
  it('keeps them out of the Copy button of the JSON tab', async () => {
    await bootMasked();
    clickRow('Field');
    tabButton('JSON').click();
    [...document.querySelectorAll('#struct-detail .detail-tools .icon-btn')].find((b) => b.title === 'Copy this view as JSON. Honours Mask values.').click();
    await tick();
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('Ada Secret');
    expect(written[0]).not.toContain('Kept Default');
    expect(JSON.parse(written[0]).response).toBe('<string>');
  });

  it('keeps them out of the tree menu: Copy value on a node', async () => {
    await bootMasked();
    clickRow('Field');
    tabButton('JSON').click();
    document.getElementById('struct-detail').querySelector('.detail-tools .icon-btn[title^="Expand"]').click();
    const row = [...document.querySelectorAll('#struct-detail .row')].find((r) => r.querySelector(':scope > .k')?.textContent === 'response');
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    choose('Copy value');
    await tick();
    expect(written.join('')).not.toContain('Ada Secret');
  });

  it('keeps them out of a row copy button in the JSON tab', async () => {
    await bootMasked();
    clickRow('Field');
    tabButton('JSON').click();
    document.getElementById('struct-detail').querySelector('.detail-tools .icon-btn[title^="Expand"]').click();
    const row = [...document.querySelectorAll('#struct-detail .row')].find((r) => r.querySelector(':scope > .k')?.textContent === 'response');
    [...row.querySelectorAll('.row-tools button')].find((b) => /Copy/.test(b.title)).click();
    await tick();
    expect(written.join('')).not.toContain('Ada Secret');
  });

  it('writes no definition JSON while masking when the text does not parse', async () => {
    await bootMasked();
    const { exportItems } = await import('../../../src/ui/structure/export-menu.js');
    const state = { elements: [{ name: 'Field', type: 'Text' }], header: null, defRaw: 'not json {"response":"Ada Secret"}' };
    exportItems(state).find((item) => item.label === 'Export definition as JSON').action();
    expect(saved).toHaveLength(0);
    expect(document.body.textContent).toContain('Not saved');
  });
});
