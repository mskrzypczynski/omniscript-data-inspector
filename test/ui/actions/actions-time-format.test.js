'use strict';

/* The Time format setting on the Calls tab (the ms / s switch of the
 * Settings dialog, tested in test/ui/shell/settings-remote-actions.test.js), and
 * every duration the tab shows following it. The wording of
 * each time is tested in test/core/. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: Time format', () => {
  let RemoteActions;
  let Settings;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    ({ Settings } = await import('../../../src/ui/settings.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  /* The switch is in the Settings dialog; choosing there is Settings.apply. */
  const button = (format) => ({ click: () => Settings.apply({ timeFormat: format }) });
  const tookCells = () => rows().map((row) => row.querySelector('.log-ms').textContent);

  function addCalls() {
    fire(auraNetworkEntry({ actionId: '1', method: 'Alpha_Fetch', time: 640, startedDateTime: '2024-01-01T00:00:00.000Z' }));
    fire(auraNetworkEntry({
      actionId: '2', method: 'Beta_Fetch', time: 1240, startedDateTime: '2024-01-01T00:00:01.000Z',
      timings: { blocked: 4, connect: 6, send: 1, wait: 1100, receive: 100 }
    }));
    fire(auraNetworkEntry({ actionId: '3', method: 'Gamma_Fetch', time: 1000, startedDateTime: '2024-01-01T00:00:36.000Z', errorInAction: 'boom' }));
  }

  it('is milliseconds by default, and the toolbar holds no switch for it', () => {
    expect(Settings.get('timeFormat')).toBe('ms');
    expect(document.getElementById('log-time-format')).toBeNull();
  });

  it('writes the times in milliseconds by default', () => {
    addCalls();
    expect(tookCells()).toEqual(['640 ms', '1,240 ms', '1,000 ms']);
  });

  it('keeps the format once chosen', async () => {
    addCalls();
    button('human').click();
    expect(tookCells()[1]).toBe('1.2 s');
    expect(Settings.get('timeFormat')).toBe('human');
  });

  it('goes back to milliseconds on Reset and Restore default settings', () => {
    addCalls();
    button('human').click();
    expect(Settings.current().timeFormat).toBe('human');

    Settings.resetKey('timeFormat');
    expect(tookCells()[1]).toBe('1,240 ms');

    button('human').click();
    Settings.reset();
    expect(tookCells()[1]).toBe('1,240 ms');
  });
});
