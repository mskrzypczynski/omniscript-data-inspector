'use strict';

/* Reordering the tabs: by keyboard and by drag, kept in extension storage,
 * followed by the 1–4 shortcuts, and put back by a reset. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { until } from '../support/until.js';

const $ = (selector) => document.querySelector(selector);
const shown = () => [...document.querySelectorAll('[role=tablist] .tab')].map((tab) => tab.id.replace('tab-', ''));
const press = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

/* Extension storage as chrome.storage.local answers: copies, asynchronously. */
function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  global.chrome.storage = {
    local: {
      get: async (key) => {
        const keys = key == null ? Object.keys(storage) : [].concat(key);
        return Object.fromEntries(keys.filter((name) => name in storage).map((name) => [name, copy(storage[name])]));
      },
      set: async (values) => { Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
}

async function boot(storage = {}) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  stubStorage(storage);
  await import('../../../src/ui/app.js');
  const { TabOrder } = await import('../../../src/ui/tab-order.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  return { storage, TabOrder, Settings };
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('tab order', () => {
  it('moves the focused tab with Alt+Shift+arrows, keeps the order, and the number keys follow it', async () => {
    const { storage } = await boot();
    $('#tab-actions').focus();
    press($('#tab-actions'), 'ArrowLeft', { altKey: true, shiftKey: true });
    press($('#tab-actions'), 'ArrowLeft', { altKey: true, shiftKey: true });
    expect(shown()).toEqual(['actions', 'data', 'structure']);
    expect(document.activeElement).toBe($('#tab-actions'));
    await until(() => storage.tabOrder === 'Calls, Data, Structure', { what: 'the order to be saved' });

    press(document.body, '1');
    expect($('#view-actions').hidden).toBe(false);
    $('#tab-data').focus();
    press($('#tab-data'), 'ArrowLeft');
    expect(document.activeElement).toBe($('#tab-actions'));
  });

  it('moves a tab by dragging it onto the right half of another', async () => {
    await boot();
    const data = null; // jsdom has no DataTransfer; the handlers cope without one
    const fire = (node, type, clientX) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.clientX = clientX;
      ev.dataTransfer = data;
      node.dispatchEvent(ev);
      return ev;
    };
    $('#tab-actions').getBoundingClientRect = () => ({ left: 200, width: 100 });
    fire($('#tab-data'), 'dragstart');
    expect(fire($('#tab-actions'), 'dragover', 290).defaultPrevented).toBe(true);
    expect($('#tab-actions').classList.contains('drop-after')).toBe(true);
    fire($('#tab-actions'), 'drop', 290);
    fire($('#tab-data'), 'dragend');
    expect(shown()).toEqual(['structure', 'actions', 'data']);
    expect($('.drop-after')).toBeNull();
  });

  it('opens with the saved order, lists it as a custom setting, and a reset puts it back', async () => {
    const { storage, Settings } = await boot({ tabOrder: 'Calls, Data, Structure' });
    await until(() => shown()[0] === 'actions', { what: 'the saved order' });
    expect(Settings.current().tabOrder).toBe('Calls, Data, Structure');
    Settings.resetKey('tabOrder');
    expect(shown()).toEqual(['data', 'structure', 'actions']);
    await until(() => !('tabOrder' in storage), { what: 'the saved order to be removed' });
  });

  it('opens an order saved while the tab was called Remote actions', async () => {
    await boot({ tabOrder: 'Remote actions, Data, Structure' });
    await until(() => shown()[0] === 'actions', { what: 'the saved order' });
    expect(shown()).toEqual(['actions', 'data', 'structure']);
  });

  it('opens an order saved while Replay was a tab without it', async () => {
    await boot({ tabOrder: 'Replay, Calls, Data, Structure' });
    await until(() => shown()[0] === 'actions', { what: 'the saved order' });
    expect(shown()).toEqual(['actions', 'data', 'structure']);
  });
});
