'use strict';

/* The Free build of the Data tab: the same code booted through src/ui/app.js,
 * with the Free markup of panel.html and no gate open. Every gated
 * control of the tab (data.changes, data.compare, data.watch, data.sizes,
 * data.query) is absent, its help is absent, and what stays Free still works:
 * the Tree, Form and Raw views, Refresh, the filter, the amber flash, the row
 * menu's copy and filter entries. Names are invented. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';
import { until } from '../support/until.js';
import { GATES } from '../../../src/core/shared/features.js';

const feed = { value: '' };
const $ = (id) => document.getElementById(id);

function stubChrome() {
  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} }, onRequestFinished: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (!callback) return;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          if (expression.includes('function hostFetch')) { callback({ ok: true, count: 1, missing: false, value: feed.value }); return; }
          callback({ ok: true, hosts: [{ label: 'c-a', dataLen: feed.value.length, defLen: 1, top: true }], hints: [], truncated: false });
        }
      }
    }
  };
}

async function boot({ settings = {}, storage = null } = {}) {
  jest.resetModules();
  feed.value = JSON.stringify({ Step1: { Name: 'Ada', Plan: 'basic' }, Other: { Name: 'Bea' } });
  stubChrome();
  if (storage) {
    global.chrome.storage = {
      local: {
        get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, storage[name]])),
        set: async (values) => { Object.assign(storage, values); },
        remove: async (key) => { [].concat(key).forEach((name) => { delete storage[name]; }); }
      }
    };
  }
  mountPanelMarkup({ free: true });
  if (Object.keys(settings).length) {
    const { Settings } = await import('../../../src/ui/settings.js');
    Object.entries(settings).forEach(([key, value]) => Settings.set(key, value));
  }
  await import('../../../src/ui/app.js');
  const { Features } = await import('../../../src/ui/features.js');
  await until(() => rowOf('Name'), { what: 'the tree' });
  return Features;
}

const rows = () => [...document.querySelectorAll('#viewport .row')];
const rowOf = (key) => rows().find((row) => row.querySelector('.k') && row.querySelector('.k').textContent === key);
const keys = () => rows().filter((row) => row.querySelector('.k')).map((row) => row.querySelector('.k').textContent);
const menuLabels = () => [...document.querySelectorAll('.ctx-menu .ctx-item')].map((item) => item.textContent);

function rightClick(node) {
  node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }));
}

function typeFilter(text) {
  $('filter').value = text;
  $('filter').dispatchEvent(new Event('input'));
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the Data tab in the Free build', () => {
  it('has every Data gate closed', async () => {
    const Features = await boot();
    GATES.filter((gate) => gate.tab === 'data').forEach(({ name }) => expect(Features.has(name)).toBe(false));
  });

  it('has no Track changes, Changes bar or Changes view (data.changes)', async () => {
    await boot();
    ['data-changes', 'view-changes', 'changes-bar', 'changed-only', 'prev-change', 'next-change', 'change-count', 'clear-changes']
      .forEach((id) => expect($(id)).toBeNull());
    expect(document.querySelector('#view-data .changes-bar')).toBeNull();
  });

  it('has no Compare data (data.compare)', async () => {
    await boot();
    expect($('compare-toggle')).toBeNull();
    expect($('compare-panel')).toBeNull();
  });

  it('has no watch strip (data.watch)', async () => {
    await boot();
    expect($('watch')).toBeNull();
  });

  it('has no Sizes view (data.sizes)', async () => {
    await boot();
    expect($('view-sizes')).toBeNull();
  });

  it('leaves Tree, Form and Raw as the whole view switch', async () => {
    await boot();
    expect([...document.querySelectorAll('#view-data .seg .seg-btn')].map((button) => button.id)).toEqual(['view-tree', 'view-form', 'view-raw']);
  });

  it('has no group of the toolbar left empty', async () => {
    await boot();
    expect(document.querySelectorAll('#view-data .toolbar .bar')).toHaveLength(1);
    expect(document.querySelector('#view-data .toolbar .bar-group')).toBeNull();
  });

  it('offers no row buttons or row menu entries of the gated features (data.watch, data.changes)', async () => {
    await boot();
    const row = rowOf('Plan');
    expect(row.querySelector('.row-tools [title^="Watch this value"]')).toBeNull();
    expect(row.querySelector('.row-tools [title^="Stop watching"]')).toBeNull();
    rightClick(row);
    const labels = menuLabels();
    expect(labels).toEqual(expect.arrayContaining(['Copy value', 'Copy key', 'Copy OmniScript path', 'Copy as %merge% field', 'Filter to this key', 'Show in Structure']));
    expect(labels).not.toContain('Add to watch list');
    expect(labels).not.toContain('Watch an expression…');
    expect(labels).not.toContain('Where is this set?');
  });

  it('names no $ query in the filter and reads a $ filter as text (data.query)', async () => {
    await boot();
    expect($('filter').title).not.toContain('$');
    expect($('filter').title).toContain('Step:Rows|2:Field');
    typeFilter('$.Step1.Name');
    await until(() => document.querySelector('#viewport .notice'), { what: 'the empty notice' });
    expect(document.getElementById('viewport').textContent).toContain('No rows match');
    expect($('status-right').textContent).not.toContain('match');
  });

  it('keeps Track changes off even when a remembered setting says on', async () => {
    await boot({ settings: { dataChanges: true } });
    feed.value = JSON.stringify({ Step1: { Name: 'Eve', Plan: 'basic' }, Other: { Name: 'Bea' } });
    $('refresh').click();
    await until(() => rowOf('Name') && document.querySelector('#viewport .is-changed'), { what: 'the flash' });
    expect(document.querySelector('#viewport .is-touched')).toBeNull();
    expect($('changes-bar')).toBeNull();
  });

  it('keeps the n and p keys from doing anything', async () => {
    await boot();
    const { DataTab } = await import('../../../src/ui/data-tab.js');
    expect(() => { DataTab.step(1); DataTab.step(-1); }).not.toThrow();
    expect(document.querySelector('.toast')).toBeNull();
  });
});

describe('the help in the Free build', () => {
  it('leaves out the entries of the gated features', async () => {
    await boot();
    const { DATA_HELP } = await import('../../../src/ui/help/data.js');
    const titles = DATA_HELP.sections.flatMap(([, entries]) => entries.map(([title]) => title));
    ['Changes', 'Changes view', 'Where is this set?', 'Compare data', 'Watch list', 'Sizes'].forEach((title) => expect(titles).not.toContain(title));
    ['Amber highlight', 'Refresh', 'Auto-refresh', 'Filter', 'Views', 'Right-click', 'Raw search'].forEach((title) => expect(titles).toContain(title));
  });

  it('leaves out the Start here line about Track changes', async () => {
    await boot();
    const { START } = await import('../../../src/ui/help/start.js');
    expect(START.data).toHaveLength(4);
    expect(START.data.join(' ')).not.toContain('Track changes');
  });

  it('leaves out the shortcut lines of the marked changes and the Changes view', async () => {
    await boot();
    const { shortcuts } = await import('../../../src/ui/help/shortcuts.js');
    const texts = shortcuts().map(([, text]) => text);
    expect(texts.some((text) => text.includes('marked change'))).toBe(false);
    expect(texts.some((text) => text.includes('Changes view'))).toBe(false);
    expect(shortcuts().some(([keys]) => keys.join('+') === '/')).toBe(true);
  });

  it('runs the Data tour without the Track changes step', async () => {
    await boot({ storage: { tourSeen: true } });
    await until(() => document.querySelector('.tour-card'), { what: 'the Data tour' });
    const card = () => document.querySelector('.tour-card');
    const shown = [];
    for (let guard = 0; guard < 5 && card(); guard++) {
      shown.push({ title: card().querySelector('.tour-title').textContent, text: card().querySelector('.tour-text').textContent });
      card().querySelector('[data-move="next"]').click();
    }
    expect(shown.map((step) => step.title)).toEqual(['1 of 2: Find a value', '2 of 2: Freeze the data']);
    expect(shown.map((step) => step.text).join(' ')).not.toContain('Track changes');
    expect(card()).toBeNull();
  });
});

describe('what stays Free on the Data tab', () => {
  it('shows the tree and narrows it with the filter', async () => {
    await boot();
    expect(keys()).toEqual(expect.arrayContaining(['Step1', 'Other']));
    typeFilter('Ada');
    await until(() => !rowOf('Other'), { what: 'the narrowed tree' });
    expect(rowOf('Name')).toBeTruthy();
  });

  it('takes an OmniScript path and key=value in the filter', async () => {
    await boot();
    typeFilter('Step1:Plan');
    await until(() => !rowOf('Other'), { what: 'the path filter' });
    expect(rowOf('Plan')).toBeTruthy();
    typeFilter('Name=Bea');
    await until(() => !rowOf('Plan'), { what: 'the key=value filter' });
    expect(rowOf('Name')).toBeTruthy();
  });

  it('switches to Form and Raw', async () => {
    await boot();
    $('view-raw').click();
    expect(document.querySelector('#viewport').textContent).toContain('"Plan"');
    $('view-form').click();
    expect(document.querySelector('#viewport .form-row')).not.toBeNull();
    $('view-tree').click();
    expect(rowOf('Plan')).toBeTruthy();
  });

  it('refreshes, and flashes the changed value amber without keeping a mark', async () => {
    await boot();
    feed.value = JSON.stringify({ Step1: { Name: 'Eve', Plan: 'basic' }, Other: { Name: 'Bea' } });
    $('refresh').click();
    await until(() => document.querySelector('#viewport .is-changed'), { what: 'the flash' });
    expect(document.querySelector('#viewport .is-changed .k').textContent).toBe('Name');
    expect(document.querySelector('#viewport .is-touched')).toBeNull();
  });

  it('filters to a key from the row menu', async () => {
    await boot();
    rightClick(rowOf('Plan'));
    [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === 'Filter to this key').click();
    expect($('filter').value).not.toBe('');
    await until(() => !rowOf('Other'), { what: 'the filtered tree' });
  });
});
