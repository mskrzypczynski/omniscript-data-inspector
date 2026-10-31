'use strict';

/* Settings, "Calls": the options that left the tab's toolbar. Each
 * is a setting that the tab follows at once, put back by Restore default
 * settings, kept with Remember my settings. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  global.chrome.storage = {
    local: {
      get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, copy(storage[name])])),
      set: async (values) => { Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
}

async function boot(storage = {}) {
  jest.resetModules();
  mountPanelMarkup();
  const listeners = stubChromeDevtools();
  stubStorage(storage);
  await import('../../../src/ui/app.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  await Settings.restore();
  return { listeners, Settings, storage };
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('Settings: Calls', () => {
  it('writes the new keys into the settings the debug bundle lists', async () => {
    const { Settings } = await boot();
    expect(Settings.current()).toMatchObject({ clearOnReload: false, logShowAll: false, logSlowMs: 0, timeFormat: 'ms' });
    expect(Settings.current()).not.toHaveProperty('logPreserve');
    Settings.apply({ clearOnReload: true });
    expect(Settings.current().clearOnReload).toBe(true);
  });

  it('Clear on reload empties the list on navigation, and says so in the status bar', async () => {
    const { listeners } = await boot();
    $('tab-actions').click();
    listeners.onRequestFinished.forEach((fn) => fn(auraNetworkEntry()));
    expect($('status-right').textContent).not.toMatch(/clears on reload|preserving/);
    listeners.onNavigated.forEach((fn) => fn());
    expect(rows()).toHaveLength(1); // kept by default

    $('settings').click();
    $('settings-clear-on-reload').checked = true;
    $('settings-clear-on-reload').dispatchEvent(new Event('change'));
    expect($('status-right').textContent).toContain('clears on reload');
    listeners.onNavigated.forEach((fn) => fn());
    expect(rows()).toHaveLength(0);
  });

  it('Time format follows the switch, and pressing the side that is on redraws nothing', async () => {
    const { listeners } = await boot();
    $('tab-actions').click();
    listeners.onRequestFinished.forEach((fn) => fn(auraNetworkEntry({ time: 1240 })));
    expect(rows()[0].querySelector('.log-ms').textContent).toBe('1,240 ms');
    const before = rows()[0];
    $('settings').click();
    document.querySelector('[data-seg="settings-time-format:ms"]').click();
    expect(rows()[0]).toBe(before);
    document.querySelector('[data-seg="settings-time-format:human"]').click();
    expect(rows()[0].querySelector('.log-ms').textContent).toBe('1.2 s');
    expect(document.querySelector('[data-seg="settings-time-format:human"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('is kept with Remember my settings, and an old Preserve on reload of off comes back as Clear on reload', async () => {
    const storage = { settings: { rememberSettings: true, logPreserve: false, logSlowMs: 300 } };
    const { Settings } = await boot(storage);
    expect(Settings.get('clearOnReload')).toBe(true);
    expect(Settings.get('logSlowMs')).toBe(300);
    await flush();
    expect(storage.settings).toMatchObject({ rememberSettings: true, clearOnReload: true, logSlowMs: 300 });
    expect(storage.settings).not.toHaveProperty('logPreserve'); // the old name is dropped once it was read
  });
});
