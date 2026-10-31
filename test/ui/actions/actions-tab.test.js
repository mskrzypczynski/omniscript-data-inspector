'use strict';

/* Integration test for the Calls tab: a captured network call
 * really does turn into a rendered row, with the right pass/fail styling and
 * a working detail pane on click. The decoding rules themselves are covered
 * by test/core/actions-model.test.js — this only checks that RemoteActions
 * wires those decisions into the DOM correctly. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('RemoteActions', () => {
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

  describe('tab badge', () => {
    const badge = () => document.getElementById('actions-count');

    it('is grey and counts the calls in view while none failed', () => {
      fireNetworkEntry(auraNetworkEntry({ actionId: '1' }));
      expect(badge().classList.contains('is-bad')).toBe(false);
      expect(badge().title).toBe('1 call in view');
      expect(badge().textContent).toBe('1');
      expect(badge().hasAttribute('aria-label')).toBe(false);
      expect(badge().hasAttribute('role')).toBe(false);
    });

    it('turns red and counts the failed calls, not all of them', () => {
      fireNetworkEntry(auraNetworkEntry({ actionId: '1' }));
      fireNetworkEntry(auraNetworkEntry({ actionId: '2', method: 'Other_Call', errorInAction: 'boom' }));
      expect(badge().classList.contains('is-bad')).toBe(true);
      expect(badge().title).toBe('1 failed call of 2 captured');
      expect(badge().textContent).toBe('✕ 1');
      // The glyph and the number are one name, so the meaning does not rest on the colour.
      expect(badge().getAttribute('role')).toBe('img');
      expect(badge().getAttribute('aria-label')).toBe('1 failed call');
    });

    it('is not hidden by a filter: a failure the filter keeps off the list still reddens it', () => {
      jest.useFakeTimers();
      fireNetworkEntry(auraNetworkEntry({ actionId: '1', method: 'Fine_Call' }));
      fireNetworkEntry(auraNetworkEntry({ actionId: '2', method: 'Broken_Call', errorInAction: 'boom' }));
      const filter = document.getElementById('log-filter');
      filter.value = 'Fine';
      filter.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);
      expect(document.querySelectorAll('#log-list .log-row:not(.log-head)')).toHaveLength(1);
      expect(badge().classList.contains('is-bad')).toBe(true);
      expect(badge().textContent).toBe('✕ 1');
      expect(badge().title).toBe('1 failed call of 2 captured · 1 in view');
      filter.value = 'nothing like this';
      filter.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);
      expect(badge().hidden).toBe(false);
      expect(badge().classList.contains('is-bad')).toBe(true);
      jest.useRealTimers();
    });

    it('is absent while a filter hides every call, as with nothing captured', () => {
      jest.useFakeTimers();
      expect(badge().hidden).toBe(true);
      fireNetworkEntry(auraNetworkEntry({ actionId: '1', method: 'Fine_Call' }));
      const filter = document.getElementById('log-filter');
      filter.value = 'nothing like this';
      filter.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);
      expect(badge().hidden).toBe(true);
      expect(badge().textContent).toBe('');
      jest.useRealTimers();
    });

    it('is updated while another tab is showing', () => {
      RemoteActions.hide();
      fireNetworkEntry(auraNetworkEntry({ actionId: '1', errorInAction: 'boom' }));
      expect(badge().classList.contains('is-bad')).toBe(true);
    });
  });

  describe('Copy as Apex', () => {
    let copied;

    beforeEach(() => {
      copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
      });
    });

    afterEach(() => { delete navigator.clipboard; });

    const apexButton = () => [...document.querySelectorAll('#log-detail .detail-head button')]
      .find((button) => button.textContent.includes('Copy as Apex'));

    it('is not offered on other calls', () => {
      fireNetworkEntry(auraNetworkEntry({ method: 'doWork', remoteClass: 'MyCompany.Service' }));
      rows()[0].click();
      expect(document.querySelector('#log-detail .detail-head')).not.toBeNull();
      expect(apexButton()).toBeUndefined();
    });
  });

  describe('failure message toggle', () => {
    const LONG = 'Something went badly wrong in the Apex class '.repeat(8);

    beforeEach(() => {
      /* jsdom has no layout: report every collapsed message as cut off. */
      jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
      jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    });

    afterEach(() => jest.restoreAllMocks());

    function openFailedDetail(actionId = '1') {
      fireNetworkEntry(auraNetworkEntry({ actionId, errorInAction: LONG }));
      rows()[rows().length - 1].click();
      jest.runAllTimers();
      return document.querySelector('#log-detail .detail-error');
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('opens and closes on click, announcing the state', () => {
      const banner = openFailedDetail();
      expect(banner.getAttribute('aria-expanded')).toBe('false');
      expect(banner.textContent).toContain('Show more');

      banner.click();
      expect(banner.classList.contains('is-open')).toBe(true);
      expect(banner.getAttribute('aria-expanded')).toBe('true');
      expect(banner.textContent).toContain('Show less');

      banner.click();
      expect(banner.classList.contains('is-open')).toBe(false);
      expect(banner.getAttribute('aria-expanded')).toBe('false');
    });

    it('toggles from the keyboard with Enter and Space', () => {
      const banner = openFailedDetail();
      banner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(banner.getAttribute('aria-expanded')).toBe('true');
      banner.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(banner.getAttribute('aria-expanded')).toBe('false');
    });

    it('stays open when a new call redraws the pane', () => {
      openFailedDetail('1').click();
      fireNetworkEntry(auraNetworkEntry({ actionId: '2' }));
      jest.runAllTimers();

      const banner = document.querySelector('#log-detail .detail-error');
      expect(banner.getAttribute('aria-expanded')).toBe('true');
    });

    it('keeps the banner and the focus in it when a new call arrives', () => {
      const banner = openFailedDetail('1');
      banner.focus();
      fireNetworkEntry(auraNetworkEntry({ actionId: '2' }));
      expect(document.querySelector('#log-detail .detail-error')).toBe(banner);
      expect(document.activeElement).toBe(banner);
    });

    it('is interactive straight after the pane is drawn, without waiting for a timer', () => {
      fireNetworkEntry(auraNetworkEntry({ actionId: '1', errorInAction: LONG }));
      rows()[0].click();
      expect(document.querySelector('#log-detail .detail-error').getAttribute('role')).toBe('button');
    });

    it('is not interactive when the message fits', () => {
      jest.restoreAllMocks();
      const banner = openFailedDetail();
      expect(banner.getAttribute('role')).toBeNull();
    });
  });

  describe('detail filter', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('lets the user collapse a branch of a filtered tree', () => {
      fireNetworkEntry(auraNetworkEntry({ input: '{"Outer":{"needle":1}}' }));
      rows()[0].click();
      const find = document.querySelector('#log-detail .detail-find');
      find.value = 'needle';
      find.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);

      const body = () => document.querySelector('#log-detail .detail-body').textContent;
      expect(body()).toContain('needle');
      const outer = [...document.querySelectorAll('#log-detail .detail-body .row')]
        .find((row) => row.textContent.includes('Outer'));
      outer.querySelector('.twisty').click();
      expect(body()).not.toContain('needle');
    });
  });
});
