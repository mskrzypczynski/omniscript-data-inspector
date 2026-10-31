'use strict';

/* Calls 1.6 in the DOM: calls that never got an answer, batched
 * requests, call order, the 500-call cap, masking on screen, keyboard use,
 * and the filter box prefixes, step column and timing details. The decisions
 * behind them are tested in test/core/actions-*.test.js. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls 1.6', () => {
  let RemoteActions;
  let Shared;
  let Mask;
  let listeners;
  let copied;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
    });
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    ({ Shared } = await import('../../../src/ui/shared.js'));
    ({ Mask } = await import('../../../src/ui/mask-setting.js'));
    Mask.mount(document.getElementById('mask-values'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  afterEach(() => { delete navigator.clipboard; });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const statusRight = () => document.getElementById('status-right').textContent;
  const button = (label) => [...detail().querySelectorAll('button')].find((b) => b.textContent.includes(label));
  const tab = (name) => [...detail().querySelectorAll('.seg-btn')].find((b) => b.textContent === name);
  const setMask = (on) => {
    const box = document.getElementById('mask-values');
    box.checked = on;
    box.dispatchEvent(new Event('change'));
  };

  describe('a call that never got an answer', () => {
    it('is not shown as a success', () => {
      fire(auraNetworkEntry({ status: 0, content: '' }));
      const pill = rows()[0].querySelector('.pill:not(.is-code)');
      expect(pill.textContent).toBe('No response');
      expect(pill.classList.contains('is-neutral')).toBe(true);
      expect(pill.classList.contains('is-good')).toBe(false);
      expect(pill.title).toMatch(/^No response\nNo response\nHTTP /);
      expect(rows()[0].classList.contains('is-failed')).toBe(true);
    });

    it('shows a body that is not JSON as an error, with the raw text in the Output tab', () => {
      fire(auraNetworkEntry({ content: '<html>Down for maintenance</html>' }));
      const pill = rows()[0].querySelector('.pill:not(.is-code)');
      expect(pill.textContent).toBe('Failed');
      expect(pill.classList.contains('is-bad')).toBe(true);
      rows()[0].click();
      tab('Output').click();
      expect(detail().querySelector('.raw-response').textContent).toBe('<html>Down for maintenance</html>');
      expect(detail().textContent).not.toContain('Nothing captured');
    });

    it('withholds the raw text while Mask values is on', () => {
      fire(auraNetworkEntry({ content: '<html>Account Acme</html>' }));
      rows()[0].click();
      tab('Output').click();
      setMask(true);
      expect(detail().querySelector('.raw-response')).toBeNull();
      expect(detail().textContent).toContain('hidden while Mask values is on');
      expect(detail().textContent).not.toContain('Acme');
    });

    it('reports an Aura system error and an expired session', () => {
      fire(auraNetworkEntry({ actionId: '1', content: '*/{"exceptionEvent":true}/*ERROR*/' }));
      fire(auraNetworkEntry({ actionId: '2', startedDateTime: '2024-01-01T00:00:01Z', content: '{"event":{"descriptor":"markup://aura:clientOutOfSync"}}' }));
      expect(rows()[0].querySelector('.pill:not(.is-code)').title).toMatch(/^Failed\nAura system error\n/);
      expect(rows()[1].querySelector('.pill:not(.is-code)').title).toMatch(/^Failed\nSession expired \/ client out of sync\n/);
    });
  });

  describe('unknown durations', () => {
    it('leaves Took blank for -1', () => {
      fire(auraNetworkEntry({ time: -1 }));
      expect(rows()[0].querySelector('.log-ms').textContent).toBe('');
      rows()[0].click();
      expect(detail().querySelector('.detail-meta').textContent).not.toMatch(/-1|undefined/);
    });
  });

  describe('order', () => {
    it('keeps the list in the order the requests started, whatever order they finished in', () => {
      fire(auraNetworkEntry({ actionId: '2', method: 'Second_Call', startedDateTime: '2024-01-01T00:00:05Z' }));
      fire(auraNetworkEntry({ actionId: '1', method: 'First_Call', startedDateTime: '2024-01-01T00:00:01Z' }));
      expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['First_Call', 'Second_Call']);
    });
  });

  describe('the 500-call cap', () => {
    it('drops the oldest, forgets what pointed at them and says so once', () => {
      fire(auraNetworkEntry({ actionId: 'a', method: 'Oldest_Call', startedDateTime: '2024-01-01T00:00:00Z', errorInAction: 'boom' }));
      rows()[0].click();
      expect(detail().textContent).toContain('Oldest_Call');
      RemoteActions.hide(); // no list redraws while the calls pour in
      for (let i = 0; i < 500; i++) {
        fire(auraNetworkEntry({ actionId: `n${i}`, method: `Call_${i}`, startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, 1 + i)).toISOString() }));
      }
      RemoteActions.show();
      expect(rows()).toHaveLength(500);
      expect(rows()[0].querySelector('.log-name').textContent).toBe('Call_0');
      expect(rows().some((row) => row.classList.contains('is-selected'))).toBe(false);
      expect(detail().textContent).toContain('Select a call');
      expect(statusRight().match(/oldest calls dropped/g)).toHaveLength(1);
    });
  });

  describe('selecting a call again', () => {
    it('leaves the open trees and the filter as they were', () => {
      jest.useFakeTimers();
      fire(auraNetworkEntry({ input: '{"Outer":{"Inner":{"deep":1}},"Other":2}' }));
      rows()[0].click();
      const outer = [...detail().querySelectorAll('.detail-body .row')].find((row) => row.textContent.includes('Outer'));
      outer.querySelector('.twisty').click();
      const collapsed = detail().querySelector('.detail-body').textContent;
      expect(collapsed).not.toContain('deep');

      rows()[0].click();
      expect(detail().querySelector('.detail-body').textContent).toBe(collapsed);
      jest.useRealTimers();
    });
  });

  describe('masking what is on screen', () => {
    it('masks values in the failure banner and the pill tooltip', () => {
      fire(auraNetworkEntry({ errorInAction: 'Account Acme Corp is closed' }));
      rows()[0].click();
      expect(detail().querySelector('.detail-error').textContent).toContain('Acme');
      setMask(true);
      expect(detail().querySelector('.detail-error').textContent).not.toContain('Acme');
      expect(rows()[0].querySelector('.pill:not(.is-code)').title).not.toContain('Acme');
      expect(rows()[0].querySelector('.log-name').title).not.toContain('Acme');
    });

    it('masks a plain value shown in a tab', () => {
      fire(auraNetworkEntry({ output: 'Secret text' }));
      rows()[0].click();
      tab('Output').click();
      expect(detail().querySelector('.detail-body').textContent).toContain('Secret text');
      setMask(true);
      expect(detail().querySelector('.detail-body').textContent).not.toContain('Secret');
    });
  });

  describe('export', () => {
    it('says so when there is nothing to export', () => {
      document.getElementById('log-export').click();
      expect(document.querySelector('.toast').textContent).toBe('Nothing to export');
    });
  });

  describe('the list for keyboard and screen reader users', () => {
    it('says recording is paused when the list is empty and recording is off', () => {
      document.getElementById('log-record').click();
      RemoteActions.show();
      expect(document.getElementById('log-notes').textContent).toContain('Recording is paused');
      expect(document.getElementById('log-notes').textContent).not.toContain('No calls captured yet');
    });
  });

  describe('Copy input', () => {
    it('copies the bare input of any call, masked when asked', async () => {
      fire(auraNetworkEntry({ method: 'doWork', remoteClass: 'MyCompany.Service', input: '{"Name":"Ada"}' }));
      rows()[0].click();
      button('Copy input').click();
      await Promise.resolve();
      expect(JSON.parse(copied[0])).toEqual({ Name: 'Ada' });

      setMask(true);
      button('Copy input').click();
      await Promise.resolve();
      expect(JSON.parse(copied[1])).toEqual({ Name: '<string>' });
    });
  });

  describe('compare with last success', () => {
    function threeCalls() {
      fire(auraNetworkEntry({ actionId: '1', output: { v: 1 }, startedDateTime: '2024-01-01T00:00:00Z' }));
      fire(auraNetworkEntry({ actionId: '2', errorInAction: 'boom', startedDateTime: '2024-01-01T00:00:01Z' }));
      fire(auraNetworkEntry({ actionId: '3', errorInAction: 'again', startedDateTime: '2024-01-01T00:00:02Z' }));
    }

    it('is not offered on a call that worked', () => {
      threeCalls();
      rows()[0].click();
      expect(button('Compare with last success')).toBeUndefined();
    });
  });

  describe('the filter box', () => {
    const filter = (text) => {
      jest.useFakeTimers();
      const box = document.getElementById('log-filter');
      box.value = text;
      box.dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(300);
      jest.useRealTimers();
    };
    const names = () => rows().map((row) => row.querySelector('.log-name').firstChild.textContent);

    beforeEach(() => {
      fire(auraNetworkEntry({ actionId: '1', method: 'Alpha_Fetch', input: '{"OrderId":"801xyz"}', startedDateTime: '2024-01-01T00:00:00Z' }));
      fire(auraNetworkEntry({ actionId: '2', method: 'Beta_Fetch', input: '{"Other":"nothing"}', startedDateTime: '2024-01-01T00:00:01Z' }));
    });

    it('does not match the URL on a plain word', () => {
      filter('aura');
      expect(rows()).toHaveLength(0);
      filter('url:aura');
      expect(rows()).toHaveLength(2);
    });

    it('searches payloads after in:, and shows the hit under the name', () => {
      filter('in:801');
      expect(names()).toEqual(['Alpha_Fetch']);
      expect(rows()[0].querySelector('.log-snippet').textContent).toContain('"OrderId":"801xyz"');
    });

    it('opens the detail trees already filtered by the search', () => {
      filter('in:801');
      rows()[0].click();
      expect(detail().querySelector('.detail-find').value).toBe('801');
      expect(detail().querySelector('.detail-body').textContent).toContain('801xyz');
    });

    it('does not let in: reveal values while masked', () => {
      setMask(true);
      filter('in:801');
      expect(rows()).toHaveLength(0);
      filter('in:orderid');
      expect(rows()).toHaveLength(1);
      expect(rows()[0].querySelector('.log-snippet').textContent).not.toContain('801');
    });

    it('narrows by step after step:', () => {
      const t0 = Date.UTC(2024, 0, 1, 0, 0, 0);
      Shared.setStep(() => ({ key: 's2', name: 'Review', asIndex: 1, visits: [
        { key: 's1', name: 'Account Info', from: t0 - 1000, to: t0 + 500 },
        { key: 's2', name: 'Review', from: t0 + 500, to: null }
      ] }));
      filter('step:review');
      expect(names()).toEqual(['Beta_Fetch']);
      filter('step:"account info"');
      expect(names()).toEqual(['Alpha_Fetch']);
    });
  });

  describe('step and timing', () => {
    const t0 = Date.UTC(2024, 0, 1, 0, 0, 0);
    const timings = { blocked: 2, dns: -1, connect: -1, send: 1, wait: 1500, receive: 110 };

    beforeEach(() => {
      Shared.setStep(() => ({ key: 's1', name: 'Account Info', asIndex: 0, visits: [{ key: 's1', name: 'Account Info', from: t0 - 1000, to: null }] }));
      fire(auraNetworkEntry({ time: 1840, timings }));
    });

    it('shows no Step column, no timing bar and no server time, ', () => {
      [false].forEach(() => {
        expect(document.querySelector('#log-list .log-head .log-step')).toBeNull();
        expect(rows()[0].querySelector('.log-step')).toBeNull();
        expect(rows()[0].querySelector('.log-bar')).toBeNull();
        expect(rows()[0].querySelector('.log-ms').textContent).toBe('1,840 ms');
      });
    });

    it('still names the step in the row tooltip and the detail line, and breaks the time down in the tooltip of Took', () => {
      expect(rows()[0].querySelector('.log-name').title).toContain('Step: Account Info');
      rows()[0].click();
      expect(detail().querySelector('.detail-meta').textContent).toContain('step Account Info');
      expect(rows()[0].querySelector('.log-ms').title).toContain('Server share: 1,610 ms');
    });
  });

  describe('Integration Procedure REST calls', () => {
    it('are listed as Integration Procedures named by the key in the URL', () => {
      listeners.onRequestFinished.forEach((listener) => listener({
        request: {
          url: 'https://x.my.salesforce.com/services/apexrest/vlocity_ins/v1/integrationprocedure/Order_Place',
          method: 'POST', postData: { text: '{"Id":"001"}' }
        },
        response: { status: 200, bodySize: 5 },
        time: 20,
        startedDateTime: '2024-01-01T00:00:00Z',
        getContent: (callback) => callback('{"ok":true}')
      }));
      expect(rows()).toHaveLength(1);
      expect(rows()[0].querySelector('.log-name').textContent).toBe('Order_Place');
      expect(rows()[0].querySelector('.tag').textContent).toBe('IP');
    });
  });
});
