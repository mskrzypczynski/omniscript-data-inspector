'use strict';

/* Calls: fixes from the review round that need the real panel
 * markup: the remembered filters, a stored Time format
 * that is not one, Shift+D with Caps Lock, and a chain that is gone. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: review fixes', () => {
  let RemoteActions;
  let Settings;
  let Shared;
  let listeners;
  let seq;

  async function boot({ before } = {}) {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    ({ Settings } = await import('../../../src/ui/settings.js'));
    ({ Shared } = await import('../../../src/ui/shared.js'));
    if (before) before();
    RemoteActions.mount();
    RemoteActions.show();
    seq = 0;
  }

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const tab = (name) => [...detail().querySelectorAll('.seg-btn')].find((button) => button.textContent === name);
  const call = (extra = {}) => {
    seq += 1;
    fire(auraNetworkEntry({
      actionId: String(seq), method: 'Order_Place', input: JSON.stringify({ Order: 'one' }),
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, seq)).toISOString(), ...extra
    }));
  };
  const key = (k, init = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

  describe('the filters', () => {
    beforeEach(() => boot());

    it('shows Failed only beside All Apex calls', () => {
      const errorsOnly = document.getElementById('log-errors-only');
      expect(errorsOnly.closest('.adv')).toBeNull();
      errorsOnly.checked = true;
      errorsOnly.dispatchEvent(new Event('change'));
      call({ errorInAction: 'boom', time: 900 });
      call({ method: 'Fine_Call' });
      expect(rows()).toHaveLength(1);
    });
  });

  describe('a stored Time format that is not one', () => {
    it('is read as ms, so times are always written one way', async () => {
      await boot({ before: () => Settings.set('timeFormat', 'weeks') });
      call({ time: 1240 });
      expect(rows()[0].querySelector('.log-ms').textContent).toBe('1,240 ms');
    });
  });

  describe('Shift+D', () => {
    beforeEach(() => boot());

    function failedAfterSuccess() {
      call({ method: 'Same_Place' });
      call({ method: 'Same_Place', errorInAction: 'boom' });
      rows()[1].click();
    }

    it('is the Shift key, not the capital letter: a plain d with Caps Lock on does not compare', () => {
      failedAfterSuccess();
      key('D', { shiftKey: false }); // Caps Lock, d alone
      expect(tab('Compare')).toBeUndefined();
    });
  });

  describe('the pane with nothing selected', () => {
    beforeEach(() => boot());

    it('says what to do once there are calls, and stays empty for an empty list', () => {
      expect(detail().textContent).toBe('');
      call();
      expect(detail().textContent).toBe('Select a call to see its input, output and timing.');
      rows()[0].click();
      expect(detail().textContent).not.toContain('Select a call');
    });
  });

  describe('chains', () => {
    beforeEach(() => boot());

    const hops = () => {
      call({ options: { chainable: true } });
      call({ options: { chainable: true } });
      call({ options: {} });
    };

    it('let go of the selection when the chain is gone', () => {
      hops();
      rows()[0].click();
      expect(Shared.dumps((value) => value).actions.selectedId).toMatch(/^chain-/);
      RemoteActions.hide();
      // The 500-call cap pushes the chain's hops out.
      for (let i = 0; i < 500; i++) call({ method: `Other_${i}` });
      RemoteActions.show();
      expect(Shared.dumps((value) => value).actions.selectedId).toBeNull();
      expect(detail().textContent).toContain('Select a call');
    });
  });
});
