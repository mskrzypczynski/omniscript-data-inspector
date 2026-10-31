'use strict';

/* Expanding or collapsing a whole node (the branch and everything inside it):
 * Alt+click, the row's "all" button and the Data row menu, with and without a
 * filter, plus one detail tree (Calls). */

import { jest } from '@jest/globals';
import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { renderJsonTree } from '../../../src/ui/json-tree-view.js';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { until } from '../support/until.js';

const DATA = { a: { b: { c: 'x' }, d: [{ e: 'x' }] }, z: 1 };

function draw(opts = {}) {
  const container = document.createElement('div');
  const expanded = opts.expanded || new Set(['']);
  const state = { expanded, filterOpen: opts.filter ? new Map() : null };
  const redraw = () => {
    container.textContent = '';
    renderJsonTree(container, 'root', DATA, { ...opts, ...state, onToggle: redraw });
  };
  redraw();
  return { container, state };
}

const rowFor = (container, key) => [...container.querySelectorAll('.row')]
  .find((r) => r.dataset.path !== undefined && r.querySelector(':scope > .k')?.textContent === key);
const keys = (container) => [...container.querySelectorAll('.row > .k')].map((el) => el.textContent);
const altClick = (row) => row.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));

describe('Alt+click on a branch', () => {
  it('opens the branch and everything inside it, and a plain click opens one level', () => {
    const { container } = draw();
    rowFor(container, 'a').click();
    expect(keys(container)).toEqual(['root', 'a', 'b', 'd', 'z']);

    const second = draw();
    altClick(rowFor(second.container, 'a'));
    expect(keys(second.container)).toEqual(['root', 'a', 'b', 'c', 'd', '0', 'e', 'z']);
  });

  it('closes the branch and everything inside it, so a plain click then shows one level', () => {
    const { container } = draw({ expanded: new Set(['', 'a', 'a' + SEP + 'b', 'a' + SEP + 'd']) });
    altClick(rowFor(container, 'a'));
    expect(keys(container)).toEqual(['root', 'a', 'z']);
    rowFor(container, 'a').click();
    expect(keys(container)).toEqual(['root', 'a', 'b', 'd', 'z']);
  });

  it('keeps line numbers matching the raw JSON', () => {
    const { container } = draw();
    altClick(rowFor(container, 'a'));
    const raw = JSON.stringify({ a: DATA.a, z: DATA.z }, null, 2).split('\n');
    const line = Number(rowFor(container, 'e').dataset.line);
    expect(raw[line - 1]).toContain('"e"');
  });
});

describe('the row button', () => {
  it('opens everything inside, then closes it, and is not in the leaf rows', () => {
    const { container } = draw();
    const button = () => rowFor(container, 'a').querySelector('.row-tools button');
    expect(button().getAttribute('aria-label')).toMatch(/^Expand everything/);
    expect(button().title).toMatch(/Alt\+click/);
    expect(rowFor(container, 'z').textContent).not.toContain('all');
    button().click();
    expect(keys(container)).toContain('e');
    expect(button().getAttribute('aria-label')).toMatch(/^Collapse everything/);
    button().click();
    expect(keys(container)).toEqual(['root', 'a', 'z']);
  });

  it('stays out of the copied rows text', () => {
    const { container } = draw();
    const row = rowFor(container, 'a');
    expect(row.querySelector(':scope > .row-tools > .row-fold')).not.toBeNull();
    expect(row.querySelector(':scope > .k, :scope > .preview')).not.toBeNull();
    expect(row.querySelectorAll(':scope > .punc')).toHaveLength(1);
  });
});

describe('with a filter', () => {
  it('Alt+click closes and reopens a whole subtree through filterOpen', () => {
    const { container, state } = draw({ filter: 'x' });
    expect(keys(container)).toContain('e');
    altClick(rowFor(container, 'a'));
    expect(keys(container)).not.toContain('b');
    expect(state.filterOpen.get('a')).toBe(false);
    expect(state.filterOpen.get('a' + SEP + 'b')).toBe(false);
    altClick(rowFor(container, 'a'));
    expect(keys(container)).toContain('e');
    expect(state.expanded).toEqual(new Set(['']));
  });
});

describe('Data row menu', () => {
  let DataTab;
  let payload;

  async function boot() {
    jest.resetModules();
    payload = { outer: { inner: { deepkey: 1 } }, other: 1 };
    global.chrome = {
      devtools: {
        network: { onNavigated: { addListener: () => {} } },
        inspectedWindow: {
          getResources: (callback) => callback([]),
          eval: (expression, a, b) => {
            const callback = typeof a === 'function' ? a : b;
            if (!callback) return;
            if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
            if (expression.includes('function hostFetch')) {
              callback({ ok: true, count: 1, missing: false, value: JSON.stringify(payload) });
              return;
            }
            callback({ ok: true, hosts: [{ label: 'c-a', dataLen: 10, defLen: 1, top: true }], hints: [], truncated: false });
          }
        }
      }
    };
    mountPanelMarkup();
    ({ DataTab } = await import('../../../src/ui/data-tab.js'));
    const { Targets } = await import('../../../src/ui/targets.js');
    DataTab.mount();
    Targets.mount({
      target: document.getElementById('target'),
      frame: document.getElementById('frame'),
      nested: document.getElementById('show-nested')
    });
    await new Promise((resolve) => Targets.start(() => { DataTab.read(); resolve(); }));
  }

  const rowKeys = () => [...document.querySelectorAll('#viewport .row > .k')].map((el) => el.textContent);
  const rowOf = (key) => [...document.querySelectorAll('#viewport .row')]
    .find((r) => r.querySelector(':scope > .k')?.textContent === key);
  function menuItem(key, label) {
    rowOf(key).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return [...document.querySelectorAll('.ctx-menu .ctx-item')].find((b) => b.textContent === label);
  }

  it('expands and collapses everything inside a branch', async () => {
    await boot();
    expect(rowKeys()).not.toContain('deepkey');
    menuItem('outer', 'Expand everything inside').click();
    expect(rowKeys()).toContain('deepkey');
    menuItem('outer', 'Collapse everything inside').click();
    expect(rowKeys()).not.toContain('inner');
  });

  it('works while a filter is on', async () => {
    await boot();
    const filter = document.getElementById('filter');
    filter.value = 'deepkey';
    filter.dispatchEvent(new Event('input'));
    await until(() => rowKeys().includes('deepkey'), { what: 'the filtered tree to show deepkey' });
    expect(rowKeys()).toContain('deepkey');
    menuItem('outer', 'Collapse everything inside').click();
    expect(rowKeys()).not.toContain('deepkey');
    menuItem('outer', 'Expand everything inside').click();
    expect(rowKeys()).toContain('deepkey');
  });

  it('survives a poll redraw', async () => {
    await boot();
    altClick(rowOf('outer'));
    expect(rowKeys()).not.toContain('inner');
    DataTab.read();
    expect(rowKeys()).not.toContain('inner');
    altClick(rowOf('outer'));
    expect(rowKeys()).toContain('deepkey');
    payload = { outer: { inner: { deepkey: 2 } }, other: 1 };
    DataTab.read();
    expect(rowKeys()).toContain('deepkey');
  });
});

describe('Calls detail tree', () => {
  it('Alt+click closes and reopens a whole branch of the call input', async () => {
    jest.resetModules();
    const listeners = stubChromeDevtools();
    mountPanelMarkup();
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
    const input = JSON.stringify({ outer: { inner: { deepkey: 1 } } });
    const message = JSON.stringify({ actions: [{ id: '1', descriptor: 'aura://ApexActionController/ACTION$execute',
      params: { classname: 'omnistudiocore.IPService', method: 'invokeMethod',
        params: { sClassName: 'omnistudiocore.IPService', sMethodName: 'Account_Fetch', input, options: {} } } }] });
    listeners.onRequestFinished.forEach((l) => l({
      request: { url: 'https://x.my.site.com/aura?r=1', method: 'POST', postData: { text: new URLSearchParams({ message }).toString() } },
      response: { status: 200, bodySize: 1 }, time: 1, startedDateTime: new Date().toISOString(),
      getContent: (cb) => cb(`while(1);${JSON.stringify({ actions: [{ id: '1', state: 'SUCCESS', returnValue: { returnValue: { ok: true } } }] })}`)
    }));
    document.querySelector('#log-list .log-row:not(.log-head)').click();
    const detail = document.getElementById('log-detail');
    const has = (key) => [...detail.querySelectorAll('.row > .k')].some((el) => el.textContent === key);
    const outer = [...detail.querySelectorAll('.row')].find((r) => r.querySelector(':scope > .k')?.textContent === 'outer');
    expect(has('deepkey')).toBe(true);
    altClick(outer);
    expect(has('inner')).toBe(false);
    const closed = [...detail.querySelectorAll('.row')].find((r) => r.querySelector(':scope > .k')?.textContent === 'outer');
    closed.click();
    expect(has('inner')).toBe(true);
    expect(has('deepkey')).toBe(false);
    altClick([...detail.querySelectorAll('.row')].find((r) => r.querySelector(':scope > .k')?.textContent === 'inner'));
    expect(has('deepkey')).toBe(true);
  });
});
