'use strict';

/* The Calls detail tab last picked by hand (Input, Output or Options)
 * is a Setting that Remember my settings keeps: written when picked, put back
 * at the start, and by Restore default settings. Names are invented. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
const tab = (name) => [...document.querySelectorAll('#log-detail .seg-btn')].find((button) => button.textContent === name);
const activeTab = () => document.querySelector('#log-detail .seg-btn.is-on').textContent;

async function boot(settings = {}) {
  jest.resetModules();
  mountPanelMarkup();
  const listeners = stubChromeDevtools();
  const { Settings } = await import('../../../src/ui/settings.js');
  Object.entries(settings).forEach(([name, value]) => Settings.set(name, value));
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
  listeners.onRequestFinished.forEach((fn) => {
    fn(auraNetworkEntry({ actionId: '1', method: 'Fine_One', options: { mode: 'x' } }));
    fn(auraNetworkEntry({ actionId: '2', method: 'Broken_One', errorInAction: 'Boom', options: { mode: 'y' } }));
  });
  return { Settings, listeners };
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('the Calls detail tab', () => {
  it('starts with none picked: a call opens on Input, a failed one on Output', async () => {
    const { Settings } = await boot();
    expect(Settings.get('logDetailTab')).toBe('');
    rows()[0].click();
    expect(activeTab()).toBe('Input');
    rows()[1].click();
    expect(activeTab()).toBe('Output');
    expect(Settings.get('logDetailTab')).toBe('');
  });

  it('is written when the user picks Input, Output or Options', async () => {
    const { Settings } = await boot();
    rows()[0].click();
    tab('Output').click();
    expect(Settings.get('logDetailTab')).toBe('output');
    tab('Options').click();
    expect(Settings.get('logDetailTab')).toBe('options');
    tab('Input').click();
    expect(Settings.get('logDetailTab')).toBe('input');
  });

  it('opens every call on the remembered tab, the failed one included', async () => {
    await boot({ logDetailTab: 'input' });
    rows()[1].click();
    expect(activeTab()).toBe('Input');
    rows()[0].click();
    expect(activeTab()).toBe('Input');
  });

  it('ignores a stored value that is not Input, Output or Options', async () => {
    await boot({ logDetailTab: 'hops' });
    rows()[0].click();
    expect(activeTab()).toBe('Input');
  });

  it('is put back by Restore default settings, and is listed while it differs', async () => {
    const { Settings } = await boot({ logDetailTab: 'options', rememberSettings: true });
    rows()[0].click();
    expect(activeTab()).toBe('Options');
    $('settings').click();
    expect(document.querySelector('#settings-body tr[data-setting="logDetailTab"]').textContent).toContain('Call detail tab');
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(Settings.get('logDetailTab')).toBe('');
    expect(activeTab()).toBe('Input');
    rows()[1].click();
    expect(activeTab()).toBe('Output'); // the failed call's default is back
  });
});

describe('a call without the picked tab', () => {
  async function bootWithPlainCall(settings) {
    const booted = await boot(settings);
    // A third call that carries no options, so it has no Options tab.
    booted.listeners.onRequestFinished.forEach((fn) => {
      fn(auraNetworkEntry({ actionId: '3', method: 'Plain_One', options: {} }));
    });
    return booted;
  }
  const differRow = () => document.querySelector('#settings-body tr[data-setting="logDetailTab"]');

  it('shows Input, keeps the pick, and opens on it again with the next call that has it', async () => {
    const { Settings } = await bootWithPlainCall({ logDetailTab: 'options', rememberSettings: true });
    rows()[0].click();
    expect(activeTab()).toBe('Options');
    rows()[2].click(); // no options
    expect(activeTab()).toBe('Input');
    expect(Settings.get('logDetailTab')).toBe('options');
    rows()[0].click();
    expect(activeTab()).toBe('Options');
  });

  it('is still reported as the pick by Settings that differ, and restored by Restore default settings', async () => {
    const { Settings } = await bootWithPlainCall({ logDetailTab: 'options', rememberSettings: true });
    rows()[0].click();
    rows()[2].click();
    $('settings').click();
    expect([...differRow().querySelectorAll('td')].slice(0, 2).map((td) => td.textContent)).toEqual(['Options', '(default)']);
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(Settings.get('logDetailTab')).toBe('');
    rows()[0].click();
    expect(activeTab()).toBe('Input');
  });

  it('treats a click on Input as a new pick', async () => {
    const { Settings } = await bootWithPlainCall({ logDetailTab: 'options', rememberSettings: true });
    rows()[0].click();
    rows()[2].click();
    tab('Input').click(); // an explicit pick replaces the remembered one
    expect(Settings.get('logDetailTab')).toBe('input');
    rows()[0].click();
    expect(activeTab()).toBe('Input');
  });
});
