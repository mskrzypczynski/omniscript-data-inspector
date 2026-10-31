'use strict';

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import { ipPreviewCall, ipFullData, remotingAnswer, vfNetworkEntry } from '../../fixtures/debug-runs.js';

/* The Calls tab in the Free build: the same code booted through src/ui/app.js
 * with the Free markup of panel.html and no gate open. Every gated
 * control of the tab is absent there, its help with it, and what Free keeps
 * (the list, the filter, the detail, the row menu) still works. Names are invented. */

const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
const tabNames = () => [...$('log-detail').querySelectorAll('.detail-tools .seg-btn')].map((button) => button.textContent);
const actionLabels = () => [...$('log-detail').querySelectorAll('.detail-actions .icon-btn')].map((button) => button.textContent);

let listeners;

async function boot(settings = {}) {
  jest.resetModules();
  await seedSettings(settings);
  mountPanelMarkup({ free: true });
  listeners = stubChromeDevtools();
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
}

const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));

const addCalls = () => {
  fire(auraNetworkEntry({ actionId: '1', method: 'Alpha_Fetch', time: 100, startedDateTime: '2024-01-01T00:00:00.000Z' }));
  fire(auraNetworkEntry({ actionId: '2', method: 'Beta_Fetch', time: 3000, startedDateTime: '2024-01-01T00:00:01.000Z', errorInAction: 'boom' }));
  fire(auraNetworkEntry({ actionId: '3', method: 'Gamma_Fetch', time: 300, startedDateTime: '2024-01-01T00:00:02.000Z' }));
};

const open = (index) => rows()[index].click();

describe('Calls in the Free build: the gated controls are not there', () => {
  beforeEach(() => boot());

  it('has no All Apex calls box, no New test call… and no selection bar (calls.analysis, calls.test, calls.select)', () => {
    expect($('log-show-all')).toBeNull();
    expect($('log-new-call')).toBeNull();
    expect($('log-selection')).toBeNull();
    expect($('log-selection-text')).toBeNull();
    expect(document.querySelector('[data-help="All Apex calls"]')).toBeNull();
    expect(document.querySelector('[data-help="Test calls"]')).toBeNull();
  });

  it('keeps the Free toolbar, and points Export at an entry that is still there', async () => {
    ['log-record', 'log-clear', 'log-filter', 'log-errors-only', 'log-export'].forEach((id) => expect($(id)).not.toBeNull());
    const { ACTIONS_HELP } = await import('../../../src/ui/help/actions.js');
    const titles = ACTIONS_HELP.sections.flatMap(([, entries]) => entries).map(([title]) => title);
    document.querySelectorAll('#view-actions .toolbar [data-help]').forEach((node) => expect(titles).toContain(node.getAttribute('data-help')));
  });

  it('draws no tick boxes, only an empty cell to keep the columns (calls.select)', () => {
    addCalls();
    expect(document.querySelector('#log-list .log-check')).toBeNull();
    expect(rows()).toHaveLength(3);
    expect(rows()[0].children).toHaveLength(7); // the cell is still there, so the columns line up
    expect(document.querySelector('#log-list .log-head .log-check-gap')).not.toBeNull();
  });

  it('ignores x and b on a row (calls.select, calls.compare)', () => {
    addCalls();
    open(0);
    const row = rows()[1];
    row.focus();
    ['x', 'b'].forEach((key) => row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    expect(rows().some((node) => node.classList.contains('is-marked') || node.classList.contains('is-baseline'))).toBe(false);
    expect(tabNames()).not.toContain('Compare');
  });

  it('offers only Copy name, Copy input and Show raw in the row menu (calls.test, calls.compare, calls.select)', () => {
    addCalls();
    rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect([...document.querySelectorAll('.ctx-menu .ctx-item')].map((item) => item.textContent))
      .toEqual(['Copy name', 'Copy input', 'Show raw']);
    expect(document.querySelectorAll('.ctx-menu .ctx-sep')).toHaveLength(0);
  });

  it('shows Input, Output and Options in the detail, without Debug, Compare or Changes (calls.debug, calls.compare, calls.changes)', async () => {
    addCalls();
    open(0);
    expect(tabNames()).toEqual(['Input', 'Output', 'Options']);
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.compareWithPrevious();
    RemoteActions.compareWithLastSuccess();
    expect(tabNames()).toEqual(['Input', 'Output', 'Options']);
  });

  it('has only Copy input in the detail head, and no Copy as Apex, Re-run… or Compare (calls.apex, calls.test, calls.compare)', () => {
    addCalls();
    open(2);
    expect(actionLabels().filter((text) => /Apex|Re-run|Compare|Copy ▾/.test(text))).toEqual([]);
    expect(actionLabels()).toContain('Copy input');
    expect($('log-detail').querySelector('.copy-direct')).toBeNull(); // no narrow-pane swap to a menu of one
    expect($('log-detail').querySelector('.copy-menu-btn')).toBeNull();
  });

  it('opens a debug run like any call, without a Debug tab (calls.debug)', () => {
    fire(vfNetworkEntry({ call: ipPreviewCall(), text: remotingAnswer(12, { fullDataJson: ipFullData() }) }));
    expect(rows()).toHaveLength(1);
    open(0);
    expect(tabNames()).not.toContain('Debug');
    expect(document.querySelector('#log-detail .seg-btn.is-on').textContent).toBe('Input');
    expect($('log-detail').querySelector('.debug-body')).toBeNull();
  });

  it('keeps the tab picked by hand when a debug run is opened, since there is no Debug tab (calls.debug)', () => {
    addCalls();
    fire(vfNetworkEntry({ call: ipPreviewCall(), text: remotingAnswer(12, { fullDataJson: ipFullData() }) }));
    expect(rows()).toHaveLength(4);
    open(0);
    [...$('log-detail').querySelectorAll('.detail-tools .seg-btn')].find((button) => button.textContent === 'Output').click();
    rows().forEach((row, index) => {
      open(index);
      expect([index, document.querySelector('#log-detail .seg-btn.is-on').textContent]).toEqual([index, 'Output']);
    });
    expect(tabNames()).not.toContain('Debug');
  });

  it('shows no oversized-input chip, size line or slow cause (calls.analysis)', () => {
    fire(auraNetworkEntry({ actionId: '1', method: 'Big_Fetch', input: JSON.stringify({ Blob: 'x'.repeat(120 * 1024) }), time: 5000 }));
    open(0);
    expect($('log-detail').querySelector('.size-chip')).toBeNull();
    expect($('log-detail').querySelector('.input-size')).toBeNull();
    expect($('log-detail').querySelector('.detail-slow')).toBeNull();
  });

  it('lists only OmniStudio calls, even when the stored setting says all Apex calls (calls.analysis)', async () => {
    await boot({ logShowAll: true });
    fire(auraNetworkEntry({ actionId: '1', method: 'Alpha_Fetch' }));
    fire(auraNetworkEntry({ actionId: '2', plainApex: { classname: 'LayoutController', method: 'getLayout' } }));
    expect(rows()).toHaveLength(1);
  });

  it('does not filter by slow:, and does not name it in the filter box (calls.analysis)', () => {
    addCalls();
    expect($('log-filter').placeholder).toBe('Filter calls (try in:)');
    expect($('log-filter').placeholder).not.toMatch(/slow/);
    expect($('log-filter').title).not.toMatch(/slow/);
    $('log-filter').value = 'slow:1000';
    $('log-filter').dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((resolve) => setTimeout(resolve, 200)).then(() => {
      expect(rows()).toHaveLength(3);
    });
  });
});

describe('Calls in the Free build: the help leaves out the gated entries', () => {
  const GATED = ['Slow calls', 'Oversized input', 'All Apex calls', 'Compare', 'Select calls', 'Copy as Apex', 'Test calls', 'Re-run', 'Debug tab', 'Changes'];

  beforeEach(() => boot());

  it('has no entry for a gated feature, and keeps the others', async () => {
    const { ACTIONS_HELP } = await import('../../../src/ui/help/actions.js');
    const titles = ACTIONS_HELP.sections.flatMap(([, entries]) => entries).map(([title]) => title);
    GATED.forEach((title) => expect(titles).not.toContain(title));
    ['Failed only', 'Filter box', 'Raw view', 'Row menu', 'Recording / Paused', 'Clear list', 'Mask values', 'Repeated calls', 'Chained procedures', 'Batched calls', 'REST calls', 'HTTP vs Result', 'Show in Structure'].forEach((title) => expect(titles).toContain(title));
  });

  it('has no Start here line about comparing, and no d, Shift+D, b or x shortcut', async () => {
    const { START } = await import('../../../src/ui/help/start.js');
    const { shortcuts } = await import('../../../src/ui/help/shortcuts.js');
    expect(START.actions).toHaveLength(4);
    expect(START.actions.join(' ')).not.toMatch(/Compare/);
    const single = shortcuts().filter(([keys]) => keys.length === 1 || keys.join('+') === 'Shift+D').map(([keys]) => keys.join('+'));
    ['d', 'Shift+D', 'b', 'x'].forEach((key) => expect(single).not.toContain(key));
    expect(single).toContain('/');
  });
});

describe('Calls in the Free build: what Free keeps works', () => {
  beforeEach(() => boot());

  it('lists the calls with their columns and narrows them with the filter box', async () => {
    addCalls();
    expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['Alpha_Fetch', 'Beta_Fetch', 'Gamma_Fetch']);
    expect(rows()[1].classList.contains('is-failed')).toBe(true);
    $('log-filter').value = 'gamma';
    $('log-filter').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['Gamma_Fetch']);
  });

  it('opens a call on its input, a failed one on its output, with Copy input in the head', () => {
    addCalls();
    open(0);
    expect(document.querySelector('#log-detail .seg-btn.is-on').textContent).toBe('Input');
    expect($('log-detail').textContent).toContain('AccountId');
    open(1);
    expect(document.querySelector('#log-detail .seg-btn.is-on').textContent).toBe('Output');
    expect(actionLabels()).toContain('Copy input');
  });

  it('shows only failed calls with Failed only, and pauses and clears', async () => {
    addCalls();
    const box = $('log-errors-only');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(rows()).toHaveLength(1);
    $('log-clear').click();
    expect(rows()).toHaveLength(0);
    $('log-record').click();
    expect($('log-record').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens Show raw from the row menu', () => {
    addCalls();
    rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === 'Show raw').click();
    expect($('log-detail').textContent).toMatch(/Alpha_Fetch|invokeMethod/);
  });
});
