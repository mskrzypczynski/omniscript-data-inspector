'use strict';

/* Integration test for the Remote actions tab: a captured network call
 * really does turn into a rendered row, with the right pass/fail styling and
 * a working detail pane on click. The decoding rules themselves are covered
 * by test/core/actions-model.test.js — this only checks that RemoteActions
 * wires those decisions into the DOM correctly. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from './support/panel-fixture.js';

function auraNetworkEntry({ actionId = '1', responseActions, errorInAction } = {}) {
  const message = JSON.stringify({
    actions: [{
      id: actionId,
      descriptor: 'aura://ApexActionController/ACTION$execute',
      params: {
        classname: 'omnistudiocore.IPService',
        method: 'invokeMethod',
        params: {
          sClassName: 'omnistudiocore.IPService',
          sMethodName: 'Account_Fetch',
          input: '{"AccountId":"001"}',
          options: {}
        }
      }
    }]
  });

  const defaultResponseAction = { id: actionId, state: 'SUCCESS', returnValue: { returnValue: { ok: true } } };
  if (errorInAction) defaultResponseAction.error = [{ message: errorInAction }];

  return {
    request: {
      url: 'https://x.my.site.com/aura?r=1',
      method: 'POST',
      postData: { text: new URLSearchParams({ message }).toString() }
    },
    response: { status: 200, bodySize: 42 },
    time: 37,
    startedDateTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    getContent: (callback) => callback(`while(1);${JSON.stringify({ actions: responseActions || [defaultResponseAction] })}`)
  };
}

describe('RemoteActions', () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  function fireNetworkEntry(entry) {
    listeners.onRequestFinished.forEach((listener) => listener(entry));
  }

  function rows() {
    return document.querySelectorAll('#log-list .log-row:not(.log-head)');
  }

  it('renders a captured Aura call as a row, named for its remote method', () => {
    fireNetworkEntry(auraNetworkEntry());

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Account_Fetch');
  });

  it('marks a row failed when the action carries a real error', () => {
    fireNetworkEntry(auraNetworkEntry({ errorInAction: 'boom' }));

    expect(rows()[0].classList.contains('is-failed')).toBe(true);
    expect(rows()[0].querySelector('.pill.is-bad')).not.toBeNull();
  });

  it('does not mark a successful row failed', () => {
    fireNetworkEntry(auraNetworkEntry());

    expect(rows()[0].classList.contains('is-failed')).toBe(false);
  });

  it('shows the selected call’s input in the detail pane on click', () => {
    fireNetworkEntry(auraNetworkEntry());

    rows()[0].click();

    expect(rows()[0].classList.contains('is-selected')).toBe(true);
    const detail = document.getElementById('log-detail');
    expect(detail.textContent).toContain('AccountId');
  });

  it('updates the badge count to the number of visible calls', () => {
    fireNetworkEntry(auraNetworkEntry({ actionId: '1' }));
    fireNetworkEntry(auraNetworkEntry({ actionId: '2' }));

    expect(document.getElementById('actions-count').textContent).toBe('2');
  });
});
