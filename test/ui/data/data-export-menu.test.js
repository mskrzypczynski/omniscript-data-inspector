'use strict';

/* The Export button of the Data toolbar: Copy JSON and Save file… in one menu,
 * both honouring Mask values, in the "…" menu of a narrow panel too. */

import { jest } from '@jest/globals';
import { bootData } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

const $ = (id) => document.getElementById(id);
const items = () => [...document.querySelectorAll('.ctx-menu .ctx-item')];
const choose = (label) => items().find((item) => item.textContent === label).click();
const readBlob = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

const host = { id: 'a', tag: 'c-os', data: { Name: 'Ada', Age: 36 } };
let written;
let saved;
let clickSpy;

beforeEach(() => {
  written = [];
  saved = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
  global.URL.createObjectURL = jest.fn((blob) => { saved.push({ blob }); return 'blob:test'; });
  global.URL.revokeObjectURL = jest.fn();
  clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record() {
    saved[saved.length - 1].name = this.download;
  });
});
afterEach(() => {
  clickSpy.mockRestore();
  delete navigator.clipboard;
  document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  document.body.innerHTML = '';
});

describe('Export', () => {
  it('is one menu button at the end of the toolbar, and Copy JSON and Save file are no buttons of their own', async () => {
    await bootData({ hosts: [host] });
    const button = $('data-export');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.hasAttribute('data-overflow')).toBe(true);
    expect(button.title).toMatch(/Honours Mask values/);
    expect(button.textContent).toBe('Export');
    expect(document.querySelector('#view-data .toolbar .bar').lastElementChild).toBe(button);
    expect($('copy')).toBeNull();
    expect($('download')).toBeNull();
  });

  it('opens a menu of Copy JSON and Save file…, and says aria-expanded while it is open', async () => {
    await bootData({ hosts: [host] });
    $('data-export').click();
    expect(items().map((item) => item.textContent)).toEqual(['Copy JSON', 'Save file…']);
    expect($('data-export').getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('data-export').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens from the keyboard with the first item focused', async () => {
    await bootData({ hosts: [host] });
    $('data-export').focus();
    $('data-export').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Copy JSON copies the data and says so', async () => {
    await bootData({ hosts: [host] });
    $('data-export').click();
    choose('Copy JSON');
    await tick();
    expect(JSON.parse(written[0])).toEqual(host.data);
    expect(document.querySelector('.toast').textContent).toBe('Copied Data JSON');
  });

  it('Save file… writes the same text to omniscript-<time>.json', async () => {
    await bootData({ hosts: [host] });
    $('data-export').click();
    choose('Save file…');
    expect(saved[0].name).toMatch(/^omniscript-.*\.json$/);
    expect(JSON.parse(await readBlob(saved[0].blob))).toEqual(host.data);
  });

  it('masks both while Mask values is on', async () => {
    await bootData({ hosts: [host] });
    const box = $('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    $('data-export').click();
    choose('Copy JSON');
    await tick();
    expect(written[0]).not.toContain('Ada');
    expect(written[0]).toContain('<string>');
    $('data-export').click();
    choose('Save file…');
    const text = await readBlob(saved[0].blob);
    expect(text).not.toContain('Ada');
    expect(text).toContain('<number>');
  });

  it('says Not valid JSON, and writes nothing, for text that cannot be masked', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: 'not json {' }] });
    const box = $('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    $('data-export').click();
    choose('Copy JSON');
    await tick();
    expect(written).toEqual([]);
    expect(document.querySelector('.toast').textContent).toBe('Not valid JSON');
    $('data-export').click();
    choose('Save file…');
    expect(saved).toEqual([]);
  });

  it('is greyed out with no script, like the other controls that act on data', async () => {
    await bootData({ hosts: [] });
    expect($('data-export').disabled).toBe(true);
  });

  it('hangs its menu under the … button when the panel is narrow', async () => {
    await bootData({ hosts: [host] });
    const { applyWidth, resetToolbarOverflow } = await import('../../../src/ui/toolbar-overflow.js');
    applyWidth(480);
    const more = document.querySelector('#view-data .overflow-btn');
    expect(more.hidden).toBe(false);
    expect($('data-export').closest('.overflow-holder')).not.toBeNull();
    more.getBoundingClientRect = () => ({ left: 300, right: 330, top: 30, bottom: 52 });
    more.click();
    choose('Export');
    expect(items().map((item) => item.textContent)).toEqual(['Copy JSON', 'Save file…']);
    const menu = document.querySelector('.ctx-menu');
    expect(menu.style.left).toBe('300px');
    expect(menu.style.top).toBe('52px');
    choose('Copy JSON');
    await tick();
    expect(JSON.parse(written[0])).toEqual(host.data);
    applyWidth(900);
    resetToolbarOverflow();
  });
});
