'use strict';

/* Open record: a value that is a record Id gets a row button and a menu entry
 * that open `${page origin}/${Id}` in a new tab; the Id itself stays text. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

const ID = '0015g00000AbCdEAAV'; // with its checksum
const host = { id: 'a', tag: 'c-os', data: { Step1: { AccountId: ID, Phone: '123456789012345', Name: 'Ada', Plan: 'RetirementPlans' } } };

const rowOf = (key) => [...viewport().querySelectorAll('.row')].find((row) => row.dataset.path !== undefined && row.dataset.path.endsWith(key));
const openButton = (key) => rowOf(key).querySelector('.row-copy[aria-label="Open this record in a new tab"]');

function rightClick(row) {
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
}
const menuItem = (label) => [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === label);

let opened;
beforeEach(() => {
  opened = jest.fn();
  window.open = opened;
});
afterEach(() => { document.body.innerHTML = ''; });

describe('open record', () => {
  it('adds a button to a record Id only, after the other row buttons', async () => {
    await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    expect(openButton('AccountId')).not.toBeNull();
    expect(openButton('Phone')).toBeNull(); // only digits: not an Id
    expect(openButton('Name')).toBeNull();
    expect(openButton('Plan')).toBeNull(); // a word of 15 letters: no digit in the key prefix and instance
    const buttons = [...rowOf('AccountId').querySelectorAll('.row-tools > button')];
    expect(buttons[buttons.length - 1]).toBe(openButton('AccountId'));
    expect(openButton('AccountId').title).toBe('Open this record in a new tab');
  });

  it('opens the page\'s own address plus the Id in a new tab, without an opener', async () => {
    await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    openButton('AccountId').click();
    expect(opened).toHaveBeenCalledWith(`${window.location.origin}/${ID}`, '_blank', 'noopener');
  });

  it('keeps the Id as plain text in the row', async () => {
    await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    const value = rowOf('AccountId').querySelector('.v');
    expect(value.textContent).toBe(` "${ID}"`);
    expect(value.querySelector('a, button')).toBeNull();
  });

  it('puts Open record in the row menu', async () => {
    await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    rightClick(rowOf('AccountId'));
    const item = menuItem('Open record in a new tab');
    expect(item.disabled).toBe(false);
    item.click();
    expect(opened).toHaveBeenCalledWith(`${window.location.origin}/${ID}`, '_blank', 'noopener');
  });

  it('offers no entry on a value that is not an Id', async () => {
    await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    rightClick(rowOf('Name'));
    expect(menuItem('Open record in a new tab')).toBeUndefined();
    expect(menuItem('Open record (no page)')).toBeUndefined();
  });

  it('shows no button and a greyed-out entry when the page\'s address cannot be read', async () => {
    const page = await bootData({ hosts: [host] });
    document.getElementById('expand').click();
    const real = global.chrome.devtools.inspectedWindow.eval;
    global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
      const callback = typeof a === 'function' ? a : b;
      if (expression === 'location.origin') callback(undefined, { isException: true, value: 'denied' });
      else real(expression, a, b);
    };
    page.page.navigated.forEach((fn) => fn());
    await tick();
    document.getElementById('expand').click();
    expect(openButton('AccountId')).toBeNull();
    rightClick(rowOf('AccountId'));
    expect(menuItem('Open record (no page)').disabled).toBe(true);
    menuItem('Open record (no page)').click();
    expect(opened).not.toHaveBeenCalled();
  });
});
