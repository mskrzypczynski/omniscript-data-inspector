'use strict';

/* Calls: the hint on a repeat that sent the same input as a call
 * that succeeded. What counts is decided in actions-repeats.js (see
 * test/core/actions/actions-repeats.test.js). */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: same input as an earlier call', () => {
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

  const call = (id, { second = id, input = '{"Id":"001","Qty":2}', errorInAction } = {}) => {
    const entry = auraNetworkEntry({
      actionId: String(id), method: 'Order_Place', input, errorInAction,
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 10, 42, second)).toISOString()
    });
    listeners.onRequestFinished.forEach((listener) => listener(entry));
  };
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const hint = () => document.querySelector('#log-detail .detail-same');
  const clockOf = (second) => new Date(Date.UTC(2024, 0, 1, 10, 42, second)).toLocaleTimeString();

  it('names the earlier call and its result, and selects it on click', () => {
    call(1, { second: 3 });
    call(2, { second: 4 });
    rows()[1].click();
    expect(hint().textContent).toBe(`Same input as the call at ${clockOf(3)} (Succeeded)`);
    expect(hint().querySelector('button').getAttribute('data-help')).toBe('Repeated calls');

    hint().querySelector('button').click();
    expect(rows()[0].classList.contains('is-selected')).toBe(true);
    expect(hint()).toBeNull(); // the first call repeats nothing
  });

  it('says nothing on the first call or on a call that is not a repeat', () => {
    call(1, { second: 1 });
    call(2, { second: 2, input: '{"Id":"002"}' });
    rows()[0].click();
    expect(hint()).toBeNull();
    rows()[1].click();
    expect(hint()).toBeNull();
  });

  it('says nothing when the same values came in another key order', () => {
    call(1, { second: 1, input: '{"Id":"001","Qty":2}' });
    call(2, { second: 2, input: '{"Qty":2,"Id":"001"}' });
    expect(document.querySelectorAll('.tags-wide .tag-repeat')).toHaveLength(1);
    rows()[1].click();
    expect(hint()).toBeNull();
  });

  it('says nothing when the earlier call failed', () => {
    call(1, { second: 1, errorInAction: 'boom' });
    call(2, { second: 2 });
    expect(document.querySelectorAll('.tags-wide .tag-repeat')).toHaveLength(1);
    rows()[1].click();
    expect(hint()).toBeNull();
  });

  it('keeps the hint while a new call arrives', () => {
    call(1, { second: 1 });
    call(2, { second: 2 });
    rows()[1].click();
    const before = hint();
    call(3, { second: 30, input: '{"Id":"009"}' });
    expect(hint()).toBe(before);
  });
});
