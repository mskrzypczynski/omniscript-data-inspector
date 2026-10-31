'use strict';

/* Round 9 of Settings: the regrouped dialog, Mask values at start, Refresh rate and the
 * views that Remember my settings keeps. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/* chrome.storage.local as it answers: copies, asynchronously. */
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

async function boot({ settings, storage } = {}) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  if (storage) stubStorage(storage);
  await seedSettings(settings);
  await import('../../../src/ui/app.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  return Settings;
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

const open = () => { $('settings').click(); };

describe('the dialog\'s sections', () => {
  it('keep the order of the General controls: Text size, Mask values at start, Remember my settings', async () => {
    await boot();
    open();
    const ids = ['settings-text-size', 'settings-mask-at-start', 'remember-settings'];
    const positions = ids.map((id) => [...$('settings-body').querySelectorAll('*')].indexOf($(id)));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('the fold Reading another page', () => {
  const fold = () => $('settings-reading');

  it('is a details element with a summary, closed while its three settings are at their defaults', async () => {
    await boot();
    open();
    expect(fold().tagName).toBe('DETAILS');
    expect(fold().querySelector('summary').textContent).toBe('Reading another page');
    expect(fold().open).toBe(false);
    expect(fold().querySelectorAll('input').length).toBe(3);
  });

  it('opens and closes by a click on its summary, and stays as the person left it while nothing differs', async () => {
    await boot();
    open();
    fold().querySelector('summary').click();
    $('settings-text-size').querySelector('[data-seg="settings-text-size:L"]').click(); // a redraw of the dialog
    expect(fold().open).toBe(true);
  });

  ['dataProp', 'defProp', 'showFrameRow'].forEach((name) => {
    const value = name === 'showFrameRow' ? true : 'otherProp';

    it(`opens by itself while ${name} differs from its default`, async () => {
      await boot({ settings: { [name]: value } });
      open();
      expect(fold().open).toBe(true);
    });

    it(`closes again on the next open once ${name} is back at its default`, async () => {
      const Settings = await boot({ settings: { [name]: value } });
      open();
      Settings.resetKey(name);
      $('settings-close').click();
      open();
      expect(fold().open).toBe(false);
    });
  });
});

describe('Mask values at start', () => {
  it('is off by default, with a tooltip, and Mask values starts off', async () => {
    await boot();
    open();
    const box = $('settings-mask-at-start');
    expect(box.checked).toBe(false);
    expect(box.closest('label').title).toBe('Turn Mask values on every time DevTools opens.');
    expect(box.closest('label').textContent).toBe('Mask values at start');
    expect(box.closest('label').nextElementSibling.textContent)
      .toBe('Kept in this browser even with Remember my settings off; turning it off deletes it.');
    expect($('mask-values').checked).toBe(false);
    expect($('status-mask').hidden).toBe(true);
  });

  it('turns Mask values on at the start, and the switch can still be turned off', async () => {
    await boot({ settings: { maskAtStart: true } });
    expect($('mask-values').checked).toBe(true);
    expect($('status-mask').hidden).toBe(false);
    $('mask-values').checked = false;
    $('mask-values').dispatchEvent(new Event('change'));
    expect($('status-mask').hidden).toBe(true);
    open();
    expect($('settings-mask-at-start').checked).toBe(true); // the setting is not the switch
  });

  it('does not turn the switch on or off by itself while the panel is open', async () => {
    const Settings = await boot();
    open();
    $('settings-mask-at-start').checked = true;
    $('settings-mask-at-start').dispatchEvent(new Event('change'));
    expect(Settings.get('maskAtStart')).toBe(true);
    expect($('mask-values').checked).toBe(false);
  });

  it('is listed under Settings that differ, counted on the gear, and put back by Restore default settings', async () => {
    const Settings = await boot({ settings: { maskAtStart: true } });
    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    open();
    expect(document.querySelector('#settings-body tr[data-setting="maskAtStart"]').textContent).toContain('Mask values at start');
    expect(document.querySelector('#settings-body tr[data-setting="mask"]')).toBeNull(); // one choice, listed once
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(Settings.get('maskAtStart')).toBe(false);
    expect($('mask-values').checked).toBe(false);
  });

  it('is stored on its own, with Remember my settings off, and nothing else with it', async () => {
    const storage = {};
    const Settings = await boot({ storage, settings: { rememberSettings: false } });
    open();
    $('settings-mask-at-start').checked = true;
    $('settings-mask-at-start').dispatchEvent(new Event('change'));
    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    await flush();
    expect(Settings.get('rememberSettings')).toBe(false);
    expect(storage).toEqual({ maskAtStart: true, settings: { rememberSettings: false } });
  });

  it('puts Mask values on at the next boot with Remember my settings off', async () => {
    const storage = { maskAtStart: true };
    await boot({ storage });
    expect($('mask-values').checked).toBe(true);
    expect($('status-mask').hidden).toBe(false);
    open();
    expect($('settings-mask-at-start').checked).toBe(true);
  });

  it('is removed from storage when unticked, and the next boot starts unmasked', async () => {
    const storage = { maskAtStart: true };
    await boot({ storage });
    open();
    $('settings-mask-at-start').checked = false;
    $('settings-mask-at-start').dispatchEvent(new Event('change'));
    await flush();
    expect(storage.maskAtStart).toBeUndefined();
    await boot({ storage });
    expect($('mask-values').checked).toBe(false);
  });

  it('is not changed by turning Remember my settings on or off, and is not part of the remembered settings', async () => {
    const storage = { maskAtStart: true };
    const Settings = await boot({ storage });
    Settings.set('rememberSettings', true);
    await flush();
    expect(storage.maskAtStart).toBe(true);
    expect(storage.settings).toEqual({ rememberSettings: true });
    expect(storage.settings).not.toHaveProperty('mask');
    Settings.set('rememberSettings', false);
    await flush();
    expect(storage).toEqual({ maskAtStart: true, settings: { rememberSettings: false } });
    await boot({ storage });
    expect($('mask-values').checked).toBe(true);
  });

  it('is put back (and its entry deleted) by Restore default settings', async () => {
    const storage = { maskAtStart: true };
    const Settings = await boot({ storage });
    open();
    $('settings-restore').click();
    $('settings-confirm').click();
    await flush();
    expect(Settings.get('maskAtStart')).toBe(false);
    expect(storage.maskAtStart).toBeUndefined();
  });

  it('is deleted by the row\'s Reset under Settings that differ', async () => {
    const storage = { maskAtStart: true };
    await boot({ storage });
    open();
    document.querySelector('#settings-body tr[data-setting="maskAtStart"] button').click();
    await flush();
    expect(storage.maskAtStart).toBeUndefined();
  });
});

describe('Refresh rate', () => {
  const seg = (rate) => document.querySelector(`[data-seg="settings-refresh-rate:${rate}"]`);

  it('is a three-way choice in Data, Normal by default, each with a tooltip', async () => {
    await boot();
    open();
    expect(['fast', 'normal', 'gentle'].map((rate) => seg(rate).textContent)).toEqual(['Fast', 'Normal', 'Gentle']);
    expect(['fast', 'normal', 'gentle'].map((rate) => seg(rate).getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    ['fast', 'normal', 'gentle'].forEach((rate) => expect(seg(rate).title.length).toBeGreaterThan(20));
    expect($('settings-refresh-rate').querySelector('.seg').title).toContain('Data tab');
  });

  it('stores the pick, keeps the keyboard on it and lists it under Settings that differ', async () => {
    const Settings = await boot();
    open();
    seg('gentle').click();
    expect(Settings.get('refreshRate')).toBe('gentle');
    expect(seg('gentle').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(seg('gentle'));
    const row = document.querySelector('#settings-body tr[data-setting="refreshRate"]');
    expect(row.textContent).toContain('Refresh rate');
    expect([...row.querySelectorAll('td')].slice(0, 2).map((td) => td.textContent)).toEqual(['Gentle', 'Normal']);
  });

  it('is put back by the row\'s Reset', async () => {
    const Settings = await boot({ settings: { refreshRate: 'fast' } });
    open();
    document.querySelector('#settings-body tr[data-setting="refreshRate"] button').click();
    expect(Settings.get('refreshRate')).toBe('normal');
    expect(seg('normal').getAttribute('aria-pressed')).toBe('true');
  });

  it('is remembered, and a stored value that is not one of the three is dropped', async () => {
    const Settings = await boot({ storage: { settings: { rememberSettings: true, refreshRate: 'gentle' } } });
    expect(Settings.get('refreshRate')).toBe('gentle');
    const other = await boot({ storage: { settings: { rememberSettings: true, refreshRate: 'turbo' } } });
    expect(other.get('refreshRate')).toBe('normal');
  });
});

describe('Remember my settings and the views', () => {
  it('says in its tooltip that the views you last chose are kept', async () => {
    await boot();
    open();
    expect($('settings-remember').querySelector('label').title).toContain('chosen views');
    expect($('settings-remember').querySelector('.settings-note').textContent).toContain('the views you last chose');
  });

  it('writes the other views to storage too, empty meaning none picked', async () => {
    const storage = {};
    const Settings = await boot({ storage });
    Settings.set('rememberSettings', true);
    Settings.set('structValueView', 'tree');
    Settings.set('structDetailTab', 'props');
    Settings.set('structShowInternal', true);
    Settings.set('logDetailTab', 'output');
    await flush();
    expect(storage.settings).toEqual(expect.objectContaining({
      structValueView: 'tree', structDetailTab: 'props', structShowInternal: true, logDetailTab: 'output'
    }));
  });

  it('has no row for them in the dialog; Settings that differ lists them only while the settings are remembered', async () => {
    const Settings = await boot({ settings: { rememberSettings: false, structValueView: 'raw', logDetailTab: 'output', structShowInternal: true, structDetailTab: 'props' } });
    open();
    const listed = () => [...document.querySelectorAll('#settings-body tr[data-setting]')].map((row) => row.dataset.setting);
    expect(listed()).toEqual([]);
    expect($('settings').querySelector('.custom-count').textContent).toBe('0');
    $('settings-remember').querySelector('input').checked = true;
    $('settings-remember').querySelector('input').dispatchEvent(new Event('change'));
    expect(Settings.get('rememberSettings')).toBe(true);
    expect(listed()).toEqual(expect.arrayContaining(['structValueView', 'logDetailTab', 'structShowInternal', 'structDetailTab']));
    ['structValueView', 'logDetailTab', 'structShowInternal', 'structDetailTab'].forEach((name) => {
      expect(document.querySelector(`#settings-body [id*="${name}"], #settings-body [data-seg*="${name}"]`)).toBeNull();
    });
  });
});

describe('the views you last chose, in the dialog', () => {
  it('make Restore default settings reachable with Remember my settings off, without a row or a count', async () => {
    const Settings = await boot({ settings: { rememberSettings: false } });
    $('view-raw').click();
    open();
    expect(Settings.get('rememberSettings')).toBe(false);
    expect(document.querySelector('#settings-body .settings-list')).toBeNull();
    expect($('settings').querySelector('.custom-count').hidden).toBe(true);
    expect($('settings-restore').disabled).toBe(false);
    expect(document.querySelector('.settings-none').textContent).toBe('Everything is at its default except the views you last chose');
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(Settings.get('dataView')).toBe('tree');
    expect($('view-tree').getAttribute('aria-pressed')).toBe('true');
    open();
    expect($('settings-restore').disabled).toBe(true);
    expect(document.querySelector('.settings-none').textContent).toBe('Everything is at its default');
  });

  it('are listed by the names on the buttons, with Remember my settings on', async () => {
    await boot({ settings: { rememberSettings: true, dataView: 'raw', structDetailTab: 'conditions', logDetailTab: 'options' } });
    open();
    const row = (key) => [...document.querySelector(`#settings-body tr[data-setting="${key}"]`).querySelectorAll('td')].slice(0, 2).map((td) => td.textContent);
    expect(row('dataView')).toEqual(['Raw', 'Tree']);
    expect(row('structDetailTab')).toEqual(['Visibility', '(default)']);
    expect(row('logDetailTab')).toEqual(['Options', '(default)']);
  });

  it('names Form among them, as the button does', async () => {
    await boot({ settings: { rememberSettings: true, dataView: 'form' } });
    open();
    const cells = [...document.querySelector('#settings-body tr[data-setting="dataView"]').querySelectorAll('td')].slice(0, 2).map((td) => td.textContent);
    expect(cells).toEqual(['Form', 'Tree']);
  });
});
