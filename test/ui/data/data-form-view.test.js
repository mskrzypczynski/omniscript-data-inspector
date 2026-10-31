'use strict';

/* The Form view of the Data tab: the data JSON as labelled rows (the rows the Structure
 * tab's Form draws), with the filter, the Track changes marks, the row menu, the
 * copy button, Mask values, the open groups it shares with the Tree, the remembered
 * choice and the keyboard. Names are invented. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { flatten } from '../../../src/core/shared/structure-model.js';

const S = '\u0001';
const P = (...keys) => keys.join(S);
const $ = (id) => document.getElementById(id);

const DATA = { Step1: { FirstName: 'Ada', Plan: 'Basic', Rows: [{ Number: '555' }, { Number: '777' }] }, userId: 'u-1' };
const host = { id: 'a', tag: 'c-os', data: DATA };

const elements = flatten({
  children: [{
    name: 'Step1', type: 'Step', propSetMap: { label: 'Your details' },
    children: [{ eleArray: [
      { name: 'FirstName', type: 'Text', propSetMap: { label: 'First name' } },
      { name: 'Plan', type: 'Select', propSetMap: { label: 'Plan' } },
      { name: 'Rows', type: 'Edit Block', propSetMap: { label: 'Phone numbers' },
        children: [{ eleArray: [{ name: 'Number', type: 'Text', propSetMap: { label: 'Number' } }] }] }
    ] }]
  }]
}, null);

let written;
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});
afterEach(() => {
  jest.useRealTimers();
  delete navigator.clipboard;
  window.getSelection().removeAllRanges();
  document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  document.body.innerHTML = '';
});

const rows = () => [...viewport().querySelectorAll('.form-row')];
const row = (path) => rows().find((node) => node.dataset.path === path);
const paths = () => rows().map((node) => node.dataset.path);
const labelOf = (path) => row(path).querySelector('.fc-label').textContent;
const valueOf = (path) => row(path).querySelector('.fc-value').textContent;
const menuLabels = () => [...document.querySelectorAll('.ctx-menu .ctx-item')].map((item) => item.textContent);
const choose = (label) => [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === label).click();

function rightClick(node) {
  node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
}

function key(node, name, extra = {}) {
  const ev = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra });
  node.dispatchEvent(ev);
  return ev;
}

async function boot({ withElements = true, track = false, data } = {}) {
  const booted = await bootData({ hosts: [data ? { ...host, data } : host], track });
  if (withElements) booted.Shared.setElements(elements);
  $('view-form').click();
  await tick();
  return booted;
}

async function change(value) {
  $('a').jsonDataStr = JSON.stringify(value);
  $('refresh').click();
  await tick();
}

function filter(text) {
  jest.useFakeTimers();
  $('filter').value = text;
  $('filter').dispatchEvent(new Event('input'));
  jest.advanceTimersByTime(200);
}

describe('the rows', () => {
  it('draws one row per key: the element\'s label with its name dimmed after it, the value as plain text', async () => {
    await boot();
    $('collapse').click();
    expect(paths()).toEqual([P('Step1'), 'userId']);
    expect(labelOf('Step1')).toBe('Your details Step1');
    expect(row('Step1').querySelector('.fc-elname').textContent).toBe('Step1');
    expect(labelOf('userId')).toBe('userId'); // no element owns it: the key is the label
    expect(valueOf('userId')).toContain('u-1');
    expect(viewport().querySelector('.row')).toBeNull(); // not the tree
  });

  it('says "n items" for an object or a list, and opens it in place, indented', async () => {
    await boot();
    $('collapse').click();
    expect(valueOf('Step1')).toContain('3 items');
    row('Step1').querySelector('.form-open').click();
    expect(paths()).toEqual([P('Step1'), P('Step1', 'FirstName'), P('Step1', 'Plan'), P('Step1', 'Rows'), 'userId']);
    expect(labelOf(P('Step1', 'FirstName'))).toBe('First name FirstName');
    expect(valueOf(P('Step1', 'FirstName'))).toContain('Ada');
    expect(row(P('Step1', 'FirstName')).style.getPropertyValue('--depth')).toBe('1');
    row(P('Step1', 'Rows')).querySelector('.form-open').click();
    expect(labelOf(P('Step1', 'Rows', '0'))).toBe('Row 1'); // an item of an Edit Block
    expect(row(P('Step1', 'Rows', '0')).style.getPropertyValue('--depth')).toBe('2');
    row(P('Step1')).querySelector('.form-open').click(); // and closes again
    expect(paths()).toEqual([P('Step1'), 'userId']);
  });

  it('uses the keys as labels when the definition is not known', async () => {
    await boot({ withElements: false });
    $('collapse').click();
    expect(labelOf('Step1')).toBe('Step1');
    expect(row('Step1').querySelector('.fc-elname')).toBeNull();
  });

  it('shares its open groups with the Tree: what is open in one is open in the other', async () => {
    await boot();
    $('collapse').click();
    row('Step1').querySelector('.form-open').click();
    $('view-tree').click();
    expect([...viewport().querySelectorAll('.row[data-path]')].map((node) => node.dataset.path)).toContain(P('Step1', 'FirstName'));
    $('collapse').click();
    $('view-form').click();
    expect(paths()).toEqual([P('Step1'), 'userId']);
  });

  it('opens and closes every group with Expand all and Collapse all, which are shown for it', async () => {
    await boot();
    expect($('expand').hidden).toBe(false);
    $('expand').click();
    expect(paths()).toContain(P('Step1', 'Rows', '1', 'Number'));
    $('collapse').click();
    expect(paths()).toEqual([P('Step1'), 'userId']);
  });

  it('leaves Export (Copy JSON and Save file) as it is: they copy the data, not the view', async () => {
    await boot();
    $('data-export').click();
    choose('Copy JSON');
    await tick();
    expect(JSON.parse(written[0])).toEqual(DATA);
  });

  it('shows a note when the data holds nothing to list', async () => {
    await boot({ data: {} });
    expect(viewport().textContent).toContain('Nothing in the value to list.');
  });
});

describe('the filter', () => {
  it('narrows the rows by label, with the way down to the match', async () => {
    await boot();
    filter('first name');
    expect(paths()).toEqual([P('Step1'), P('Step1', 'FirstName')]);
  });

  it('narrows them by key and by value as it narrows the Tree', async () => {
    await boot();
    filter('plan');
    expect(paths()).toEqual([P('Step1'), P('Step1', 'Plan')]);
    filter('777');
    expect(paths()).toEqual([P('Step1'), P('Step1', 'Rows'), P('Step1', 'Rows', '1'), P('Step1', 'Rows', '1', 'Number')]);
    filter('USERID');
    expect(paths()).toEqual(['userId']);
  });

  it('shows everything under a group whose label matched, and lets that group be closed', async () => {
    await boot();
    filter('phone numbers');
    expect(paths()).toEqual([P('Step1'), P('Step1', 'Rows'), P('Step1', 'Rows', '0'), P('Step1', 'Rows', '0', 'Number'),
      P('Step1', 'Rows', '1'), P('Step1', 'Rows', '1', 'Number')]);
    row(P('Step1', 'Rows')).querySelector('.form-open').click();
    expect(paths()).toEqual([P('Step1'), P('Step1', 'Rows')]);
  });

  it('says so when nothing matches, with a way to clear the filter', async () => {
    await boot();
    filter('zzzz');
    expect(rows()).toHaveLength(0);
    expect(viewport().textContent).toContain('zzzz');
    expect(viewport().querySelector('button')).not.toBeNull();
  });
});

describe('Track changes', () => {
  const NEXT = { Step1: { FirstName: 'Ada', Plan: 'Gold', Rows: [{ Number: '555' }, { Number: '777' }] }, userId: 'u-1' };

  it('marks a closed group with a change inside it with a dot', async () => {
    await boot({ track: true });
    $('collapse').click();
    await change(NEXT);
    expect(row('Step1').querySelector('.form-dot')).not.toBeNull();
    expect(row('userId').querySelector('.form-dot')).toBeNull();
  });
});

describe('the row menu', () => {
  it('copies a value, a merge field and the path of a row inside a list', async () => {
    await boot();
    $('expand').click();
    const inner = row(P('Step1', 'Rows', '1', 'Number'));
    rightClick(inner);
    choose('Copy value');
    rightClick(inner);
    choose('Copy as %merge% field');
    rightClick(inner);
    choose('Copy OmniScript path');
    await tick();
    expect(written).toEqual(['"777"', '%Step1:Rows|2:Number%', 'Step1:Rows|2:Number']);
  });

  it('knows a list item has no key of its own, and offers Expand and Collapse for a group', async () => {
    await boot();
    $('expand').click();
    rightClick(row(P('Step1', 'Rows', '0')));
    expect([...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === 'Filter to this key').disabled).toBe(true);
    expect(menuLabels()).toContain('Collapse this branch');
    choose('Collapse this branch');
    expect(row(P('Step1', 'Rows', '0', 'Number'))).toBeUndefined();
  });

  it('jumps to Structure and sets the filter from the menu, as in the Tree', async () => {
    await boot();
    rightClick(row(P('Step1', 'Plan')));
    choose('Filter to this key');
    expect($('filter').value).toBe('Plan=');
  });

  it('opens from the keyboard: the menu key, and Shift+F10', async () => {
    await boot();
    const plan = row(P('Step1', 'Plan'));
    plan.focus();
    expect(key(plan, 'ContextMenu').defaultPrevented).toBe(true);
    expect(menuLabels()).toContain('Copy value');
    document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
    key(plan, 'F10', { shiftKey: true });
    expect(menuLabels()).toContain('Copy value');
  });
});

describe('the row copy button', () => {
  it('copies the value as JSON, and a group as the branch', async () => {
    await boot();
    $('expand').click();
    const button = row(P('Step1', 'Plan')).querySelector('.form-tools button');
    expect(button.getAttribute('aria-label')).toMatch(/^Copy this value/);
    expect(button.textContent).toBe('');
    button.click();
    await tick();
    row(P('Step1', 'Rows', '0')).querySelector('.form-tools button').click();
    await tick();
    expect(written).toEqual(['"Basic"', JSON.stringify({ Number: '555' }, null, 2)]);
  });

  it('honours Mask values, here and in a selection dragged across rows', async () => {
    await boot();
    $('expand').click();
    const mask = $('mask-values');
    mask.checked = true;
    mask.dispatchEvent(new Event('change'));
    row(P('Step1', 'FirstName')).querySelector('.form-tools button').click();
    await tick();
    expect(written).toEqual(['"<string>"']);
    expect(valueOf(P('Step1', 'FirstName'))).toContain('Ada'); // on screen, as in the Tree

    const range = document.createRange();
    range.selectNodeContents(viewport().querySelector('.data-form'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    viewport().querySelector('.data-form').dispatchEvent(event);
    expect(copied).toContain('First name (FirstName): "<string>"');
    expect(copied).toContain('Your details (Step1): 3 items');
    expect(copied).not.toContain('Ada');
    expect(copied).not.toContain('777');

    mask.checked = false;
    mask.dispatchEvent(new Event('change'));
    let again = null;
    const plain = new Event('copy', { bubbles: true, cancelable: true });
    plain.clipboardData = { setData: (type, text) => { again = text; } };
    viewport().querySelector('.data-form').dispatchEvent(plain);
    expect(again).toBeNull(); // not intercepted while Mask values is off
  });

  it('has c copy the row the pointer is over', async () => {
    const { DataTab } = await boot();
    $('expand').click();
    row(P('Step1', 'Plan')).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    DataTab.copySelected();
    await tick();
    expect(written).toEqual(['"Basic"']);
  });
});

describe('the remembered choice', () => {
  it('is put back by Restore default settings', async () => {
    await boot();
    const { Settings } = await import('../../../src/ui/settings.js');
    Settings.resetKey('dataView');
    expect($('view-tree').getAttribute('aria-pressed')).toBe('true');
    expect(viewport().querySelector('.form-row')).toBeNull();
  });
});

describe('the keyboard', () => {
  it('has one row in the Tab order, and the arrows move between rows', async () => {
    await boot();
    $('expand').click();
    const all = rows();
    expect(all.filter((node) => node.tabIndex === 0)).toHaveLength(1);
    all[0].focus();
    expect(key(all[0], 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    expect(all[1].tabIndex).toBe(0);
    expect(all[0].tabIndex).toBe(-1);
    key(all[1], 'End');
    expect(document.activeElement).toBe(all[all.length - 1]);
    key(document.activeElement, 'Home');
    expect(document.activeElement).toBe(all[0]);
    key(all[0], 'ArrowUp');
    expect(document.activeElement).toBe(all[0]);
  });

  it('opens a group with Enter, Space or the right arrow, closes it with the left, and keeps the focus on the row', async () => {
    await boot();
    $('collapse').click();
    row('Step1').focus();
    key(row('Step1'), 'Enter');
    expect(row(P('Step1', 'FirstName'))).toBeDefined();
    expect(document.activeElement).toBe(row('Step1'));
    key(row('Step1'), 'ArrowRight'); // open: on to the first child
    expect(document.activeElement).toBe(row(P('Step1', 'FirstName')));
    key(row(P('Step1', 'FirstName')), 'ArrowLeft'); // a row with nothing to close: to its parent
    expect(document.activeElement).toBe(row('Step1'));
    key(row('Step1'), 'ArrowLeft');
    expect(row(P('Step1', 'FirstName'))).toBeUndefined();
    expect(document.activeElement).toBe(row('Step1'));
    key(row('Step1'), ' ');
    expect(row(P('Step1', 'FirstName'))).toBeDefined();
    key(row('Step1'), 'Enter');
    key(row('Step1'), 'ArrowRight');
    expect(row(P('Step1', 'FirstName'))).toBeDefined();
  });

  it('puts only the focused row\'s buttons in the Tab order', async () => {
    await boot();
    const stops = () => [...viewport().querySelectorAll('.form-open, .form-tools button')].filter((button) => button.tabIndex >= 0);
    const owner = (button) => button.closest('.form-row').dataset.path;
    const first = rows()[0];
    expect(new Set(stops().map(owner))).toEqual(new Set([first.dataset.path]));
    const other = rows()[2];
    other.focus();
    expect(new Set(stops().map(owner))).toEqual(new Set([other.dataset.path]));
  });
});

describe('the view switch', () => {
  it('shows the Form as pressed and the Tree as not, and back', async () => {
    await boot();
    expect($('view-form').getAttribute('aria-pressed')).toBe('true');
    expect($('view-tree').getAttribute('aria-pressed')).toBe('false');
    expect(viewport().querySelector('.data-form')).not.toBeNull();
    $('view-tree').click();
    expect(viewport().querySelector('.data-form')).toBeNull();
    expect(viewport().querySelector('.row')).not.toBeNull();
  });

  it('keeps the keyboard\'s row through a redraw', async () => {
    await boot();
    $('expand').click();
    const plan = row(P('Step1', 'Plan'));
    plan.focus();
    await change({ ...DATA, userId: 'u-2' });
    expect(document.activeElement.dataset.path).toBe(P('Step1', 'Plan'));
  });

  it('is on a Form row even when the data is read again with nothing changed', async () => {
    await boot();
    const before = viewport().firstChild;
    $('refresh').click();
    await tick();
    expect(viewport().querySelector('.data-form')).not.toBeNull();
    expect(before).toBeDefined();
  });
});
