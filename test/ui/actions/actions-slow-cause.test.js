'use strict';

/* Calls: the sentence in the detail head that says where a slow
 * call's time went. The wording is tested in
 * test/core/actions/timing-words.test.js. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: slow-call cause', () => {
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

  const timings = { blocked: 3, send: 1, wait: 1840, receive: 20 };
  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const cause = () => document.querySelector('#log-detail .detail-slow');

  it('says nothing for a call under 2 s while no threshold is set', () => {
    fire(auraNetworkEntry({ time: 1999, timings }));
    rows()[0].click();
    expect(cause()).toBeNull();
  });

  it('says nothing when the browser gave no timings', () => {
    fire(auraNetworkEntry({ time: 5000 }));
    rows()[0].click();
    expect(cause()).toBeNull();
  });

  it('does not rebuild the pane when a call arrives and nothing it shows changed', () => {
    fire(auraNetworkEntry({ actionId: '1', time: 2500, timings }));
    rows()[0].click();
    const before = cause();
    fire(auraNetworkEntry({ actionId: '2', method: 'Other_Call', time: 20 }));
    expect(cause()).toBe(before);
  });
});
