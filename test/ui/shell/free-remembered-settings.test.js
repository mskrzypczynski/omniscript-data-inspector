'use strict';

/* A setting that only a gated feature reads can still be sitting in the
 * settings (a remembered value, or a seed). In Free it must not count on the
 * gear or be listed under "Settings that differ": the person has no row to
 * reset it with. Names are invented. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools, seedSettings } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const SEEDS = { allowTestCalls: true, logSlowMs: 800, structAutoCollapse: true };

async function boot({ free = false } = {}) {
  jest.resetModules();
  mountPanelMarkup({ free });
  stubChromeDevtools();
  await seedSettings(SEEDS);
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('settings of a gated feature that are set in the Free build', () => {
  it('give the gear no count and are not listed as differing', async () => {
    await boot({ free: true });
    const badge = document.querySelector('#settings .custom-count');
    expect(badge.hidden).toBe(true);
    expect($('settings').getAttribute('aria-label')).toBe('Settings');
    $('settings').click();
    const dialog = $('settings-overlay').textContent;
    ['Allow test calls', 'Slow call threshold', 'Collapse done steps'].forEach((label) => expect(dialog).not.toContain(label));
    expect(dialog).toContain('Everything is at its default');
  });
});
