'use strict';

/* The Form view's row buttons: the ones the Tree has (copy, %merge% field,
 * watch, Show in Structure, open record) drawn by the same code, shown on hover
 * and keyboard focus, with Mask values applied to what is copied, and the
 * sticky path of the open groups. Names are invented. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { flatten } from '../../../src/core/shared/structure-model.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const P = (...keys) => keys.join(SEP);
const $ = (id) => document.getElementById(id);
const ID = '0015g00000AbCdEAAV'; // with its checksum

const DATA = { Step1: { FirstName: 'Ada', AccountId: ID, Rows: [{ Number: '555' }] }, userId: 'u-1' };
const elements = flatten({
  children: [{
    name: 'Step1', type: 'Step', propSetMap: { label: 'Your details' },
    children: [{ eleArray: [
      { name: 'FirstName', type: 'Text', propSetMap: { label: 'First name' } },
      { name: 'AccountId', type: 'Text', propSetMap: { label: 'Account' } }
    ] }]
  }]
}, null);

let written;
let opened;
beforeEach(() => {
  written = [];
  opened = jest.fn();
  window.open = opened;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  delete navigator.clipboard;
  document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  document.body.innerHTML = '';
});

const row = (path) => [...viewport().querySelectorAll('.form-row')].find((node) => node.dataset.path === path);
const tools = (path) => [...row(path).querySelectorAll('.form-tools > button')];
const button = (path, start) => tools(path).find((b) => (b.getAttribute('aria-label') || '').startsWith(start));

async function boot({ data = DATA, withElements = true } = {}) {
  const booted = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
  if (withElements) booted.Shared.setElements(elements);
  $('view-form').click();
  await tick();
  return booted;
}

describe('Form row buttons', () => {
  it('copies the place of a row as a %merge% field, which Mask values leaves alone', async () => {
    await boot();
    const box = $('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await tick();
    button(P('Step1', 'FirstName'), 'Copy as %merge%').click();
    await tick();
    expect(written).toEqual(['%Step1:FirstName%']);
  });

  it('keeps Mask values on the copied value', async () => {
    await boot();
    const box = $('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await tick();
    button(P('Step1', 'FirstName'), 'Copy this value').click();
    await tick();
    expect(written[0]).not.toContain('Ada');
    expect(written[0]).toContain('<string>');
  });

  it('jumps to Structure with the same segments the Tree sends', async () => {
    await boot();
    const { Nav } = await import('../../../src/ui/nav.js');
    const go = jest.spyOn(Nav, 'go').mockImplementation(() => {});
    button(P('Step1', 'FirstName'), 'Select').click();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go.mock.calls[0][0]).toBe('structure');
    expect(go.mock.calls[0][1].segments).toEqual(['Step1', 'FirstName']);
  });

  it('offers no jump when the definition is not known', async () => {
    await boot({ withElements: false });
    expect(button(P('Step1', 'FirstName'), 'Select')).toBeUndefined();
  });

  it('opens a record Id in a new tab, and only on a record Id', async () => {
    await boot();
    expect(button(P('Step1', 'FirstName'), 'Open this record')).toBeUndefined();
    button(P('Step1', 'AccountId'), 'Open this record').click();
    expect(opened).toHaveBeenCalledWith(`${window.location.origin}/${ID}`, '_blank', 'noopener');
  });

  it('puts the buttons on a group row too, but not the Tree\'s open-everything box', async () => {
    await boot();
    expect(button(P('Step1'), 'Copy this branch')).not.toBeUndefined();
    expect(button(P('Step1'), 'Copy as %merge%')).not.toBeUndefined();
    expect(tools(P('Step1')).some((b) => b.classList.contains('row-fold'))).toBe(false);
  });

  it('puts only the focused row\'s buttons in the Tab order', async () => {
    await boot();
    row(P('Step1')).focus();
    expect(tools(P('Step1')).every((b) => b.tabIndex === 0)).toBe(true);
    expect(tools(P('userId')).every((b) => b.tabIndex === -1)).toBe(true);
    row(P('userId')).focus();
    expect(tools(P('Step1')).every((b) => b.tabIndex === -1)).toBe(true);
    expect(tools(P('userId')).every((b) => b.tabIndex === 0)).toBe(true);
  });
});

describe('Form sticky path', () => {
  const ROW_PX = 18;
  let scrollTop;
  let realRect;

  beforeEach(() => {
    scrollTop = 0;
    realRect = Element.prototype.getBoundingClientRect;
    const rect = (top, height) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height });
    Element.prototype.getBoundingClientRect = function box() {
      if (this.id === 'viewport') return rect(0, 300);
      if (this.classList && this.classList.contains('form-row')) {
        const index = [...viewport().querySelectorAll('.form-row')].indexOf(this);
        return rect(index * ROW_PX - scrollTop, ROW_PX);
      }
      return rect(0, 0);
    };
  });
  afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

  const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
  const pinned = () => [...viewport().querySelectorAll('.tree-sticky-line')].map((line) => line.dataset.path);

  async function scrollToRow(index) {
    scrollTop = index * ROW_PX;
    viewport().dispatchEvent(new Event('scroll'));
    await wait();
  }

  it('pins the open group the first visible row is inside', async () => {
    await boot();
    $('expand').click();
    await tick();
    expect(pinned()).toEqual([]); // nothing is pinned at the top
    const paths = [...viewport().querySelectorAll('.form-row')].map((node) => node.dataset.path);
    await scrollToRow(paths.indexOf(P('Step1', 'AccountId')));
    expect(pinned()).toEqual([P('Step1')]);
    const line = viewport().querySelector('.tree-sticky-line');
    expect(line.getAttribute('title')).toBe('Scroll to this row');
    expect(viewport().querySelector('.tree-sticky').getAttribute('aria-hidden')).toBe('true');
    await scrollToRow(0);
    expect(pinned()).toEqual([]);
  });

  it('is drawn again, not stacked, after a redraw', async () => {
    await boot();
    $('expand').click();
    await tick();
    $('refresh').click();
    await tick();
    expect(viewport().querySelectorAll('.tree-sticky')).toHaveLength(1);
  });
});
