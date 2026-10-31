'use strict';

/* The settings dialog has no Structure section: the list's Value column, the one
 * option it used to hold, is gone, and a Show values kept by an earlier build is
 * ignored. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  const { Settings } = await import('../../../src/ui/settings.js');
  await import('../../../src/ui/app.js');
  return Settings;
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
  jest.restoreAllMocks();
});

describe('Structure in the settings dialog', () => {
  it('has no section and no Show values checkbox', async () => {
    await boot();
    $('settings').click();
    expect($('settings-struct-show-values')).toBeNull();
    expect([...$('settings-body').querySelectorAll('h3')].map((h) => h.textContent)).not.toContain('Structure');
    expect($('settings-body').textContent).not.toContain('Show values');
  });

  it('knows no structShowValues setting, so one kept by an earlier build is ignored', async () => {
    const Settings = await boot();
    expect('structShowValues' in Settings.defaults()).toBe(false);
    expect('structShowValues' in Settings.current()).toBe(false);
    expect($('struct-show-values')).toBeNull();
  });
});
