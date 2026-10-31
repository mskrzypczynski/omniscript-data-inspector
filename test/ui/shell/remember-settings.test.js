'use strict';

/* Remember my settings: on by default, written through stored.js only while it is on,
 * restored before the tabs mount, removed when it is turned off. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

/* chrome.storage.local as it answers: copies, asynchronously. */
function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const calls = { set: 0, remove: 0 };
  global.chrome.storage = {
    local: {
      get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, copy(storage[name])])),
      set: async (values) => { calls.set += 1; Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { calls.remove += 1; [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
  return calls;
}

async function boot(storage = {}) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  const calls = stubStorage(storage);
  await import('../../../src/ui/app.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  return { storage, calls, Settings };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function openHelp() {
  $('settings').click();
  return $('remember-settings');
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('Remember my settings', () => {
  it('does not claim that nothing is sent anywhere, now that test calls exist: what is kept never leaves this computer', async () => {
    await boot();
    const note = openHelp().closest('#settings-remember').querySelector('.settings-note').textContent;
    expect(note).toContain('Never values or data; nothing leaves this computer.');
    expect(note).not.toContain('Nothing is sent anywhere');
  });

  it('is on by default and stores the settings from the first change', async () => {
    const { storage, Settings } = await boot();
    expect(openHelp().checked).toBe(true);
    expect(Settings.get('rememberSettings')).toBe(true);
    Settings.set('dataView', 'raw');
    await flush();
    expect(storage.settings).toEqual({ rememberSettings: true, dataView: 'raw' });
  });

  it('writes the settings on every change, but never the tab order or Mask values', async () => {
    const { storage, Settings } = await boot();
    Settings.set('logSlowMs', 250);
    Settings.set('tabOrder', 'Calls, Data, Structure');
    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    await flush();
    expect(storage.settings).toEqual({ rememberSettings: true, logSlowMs: 250 });
  });

  it('never writes Failed only, Visible only, Data property or Definition property, though they change in the session', async () => {
    const { storage, Settings } = await boot();
    Settings.set('logErrorsOnly', true);
    Settings.set('structVisibleOnly', true);
    Settings.set('dataProp', 'otherData');
    Settings.set('defProp', 'otherDef');
    Settings.set('structFollow', false);
    await flush();
    expect(storage.settings).toEqual({ rememberSettings: true, structFollow: false });
    expect(Settings.get('dataProp')).toBe('otherData');
  });

  it('ignores a stored value of those four at boot', async () => {
    const { Settings } = await boot({ settings: {
      rememberSettings: true, logErrorsOnly: true, structVisibleOnly: true, dataProp: 'x', defProp: 'y', structFollow: false
    } });
    expect(Settings.get('logErrorsOnly')).toBe(false);
    expect(Settings.get('structVisibleOnly')).toBe(false);
    expect(Settings.get('dataProp')).toBe('jsonDataStr');
    expect(Settings.get('defProp')).toBe('jsonDef');
    expect(Settings.get('structFollow')).toBe(false);
  });

  it('ignores a profile stored by an earlier version, and still opens', async () => {
    const { Settings } = await boot({ settings: { rememberSettings: true, profile: 'expert', logSlowMs: 500 } });
    expect(Settings.get('profile', 'none')).toBe('none');
    expect(Settings.get('logSlowMs')).toBe(500);
  });

  it('puts the settings back at boot, before the tabs read them', async () => {
    const { Settings } = await boot({ settings: { rememberSettings: true, dataView: 'raw', defProp: 'myDef', bogus: 1 } });
    expect(Settings.get('dataView')).toBe('raw');
    expect($('view-raw').getAttribute('aria-pressed')).toBe('true');
    expect(Settings.get('rememberSettings')).toBe(true);
    expect(Settings.get('bogus', 0)).toBe(0);
    expect(openHelp().checked).toBe(true);
  });

  it('ignores stored settings that do not say the switch was on', async () => {
    const { Settings } = await boot({ settings: { dataView: 'raw' } });
    expect(Settings.get('dataView')).toBe('tree');
  });

  it('stays off at the next boot once it was turned off, with nothing else put back', async () => {
    const { Settings } = await boot({ settings: { rememberSettings: false, dataView: 'raw' } });
    expect(Settings.get('rememberSettings')).toBe(false);
    expect(Settings.get('dataView')).toBe('tree');
    expect(openHelp().checked).toBe(false);
  });

  it('removes what it kept when it is turned off, and stops writing', async () => {
    const { storage, calls, Settings } = await boot({ settings: { rememberSettings: true, dataView: 'raw' } });
    const box = openHelp();
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush();
    expect(storage.settings).toEqual({ rememberSettings: false }); // only the choice itself survives
    const writes = calls.set;
    Settings.set('logSlowMs', 100);
    await flush();
    expect(calls.set).toBe(writes);
    expect(storage.settings).toEqual({ rememberSettings: false });
  });

  it('removes the entries a tab keeps only while remembering is on (pins) too', async () => {
    const { storage } = await boot({ settings: { rememberSettings: true }, pins: { 'a:b': ['Step:Field'] }, tabOrder: 'structure,data,actions' });
    const box = openHelp();
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush();
    expect(storage.pins).toBeUndefined();
    expect(storage.tabOrder).toBe('structure,data,actions'); // the tab order has its own switch-free entry
  });

  it('stays on, and writes the defaults, when Restore default settings runs from the default state', async () => {
    const { storage, Settings } = await boot();
    Settings.set('dataView', 'raw');
    Settings.reset();
    await flush();
    expect(Settings.get('rememberSettings')).toBe(true);
    expect(storage.settings).toEqual({ rememberSettings: true });
  });

  it('keeps the choice, and writes the defaults, when Restore default settings runs', async () => {
    const { storage, Settings } = await boot({ settings: { rememberSettings: true, dataView: 'raw' } });
    Settings.reset();
    await flush();
    expect(Settings.get('dataView')).toBe('tree');
    expect(storage.settings).toEqual({ rememberSettings: true });
  });

  it('does not break a setting when storage fails', async () => {
    const { Settings } = await boot({ settings: { rememberSettings: true } });
    global.chrome.storage.local.set = async () => { throw new Error('quota'); };
    expect(() => Settings.set('dataView', 'raw')).not.toThrow();
    await flush();
    expect(Settings.get('dataView')).toBe('raw');
  });

  it('boots without extension storage', async () => {
    jest.resetModules();
    mountPanelMarkup();
    stubChromeDevtools();
    await import('../../../src/ui/app.js');
    const { Settings } = await import('../../../src/ui/settings.js');
    expect(Settings.get('rememberSettings')).toBe(true);
  });
});
