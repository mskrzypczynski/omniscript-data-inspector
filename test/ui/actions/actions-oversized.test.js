'use strict';

/* Calls: the hint on a call that sends a large input. The sizes
 * themselves are tested in test/core/actions/input-size.test.js. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: oversized input', () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const chip = () => detail().querySelector('.size-chip');

  /* An input of about `bytes` of compact JSON: a big Account, a smaller Items list. */
  const inputOf = (bytes) => JSON.stringify({
    Account: { Notes: 'a'.repeat(Math.round(bytes * 0.8)) },
    Items: ['b'.repeat(Math.round(bytes * 0.15))],
    Id: '001'
  });

  function addCall(id, input, second = id) {
    fire(auraNetworkEntry({
      actionId: String(id), method: `Call_${id}`, input,
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 10, 42, second)).toISOString()
    }));
  }

  const open = (index) => rows()[index].click();

  it('keeps the list calm: the chip is in the detail pane only', () => {
    addCall(1, inputOf(2 * 1024 * 1024));
    expect(document.querySelector('#log-list .size-chip')).toBeNull();
    expect(document.querySelector('#log-list .log-row:not(.log-head)').textContent).not.toMatch(/MB/);
  });

  it('does not rebuild the pane when a call arrives and nothing it shows changed', () => {
    addCall(1, inputOf(150 * 1024));
    open(0);
    const before = chip();
    addCall(2, '{"Id":"002"}', 9);
    expect(chip()).toBe(before);
  });
});
