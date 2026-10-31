'use strict';

/* Designer previews (debug runs) in Calls, through the real
 * panel.html: the list row, the Debug tab, Mask values, and a re-run through
 * the page's fetch. Everything is invented (test/fixtures/debug-runs.js). */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import {
  ipPreviewCall, drPreviewCall, ipFullData, drResult, remotingAnswer, vfNetworkEntry, ACCOUNT_ID, CTX
} from '../../fixtures/debug-runs.js';

const ORIGIN = 'https://demo.example.invalid';
const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
const detail = () => $('log-detail');
const tabs = () => [...detail().querySelectorAll('.seg-btn')];
const tabNames = () => tabs().map((button) => button.textContent);

async function boot({ settings = {} } = {}) {
  jest.resetModules();
  await seedSettings({ allowTestCalls: true, testCallsAck: true, ...settings });
  const listeners = stubChromeDevtools();
  const baseEval = global.chrome.devtools.inspectedWindow.eval;
  global.chrome.devtools.inspectedWindow.eval = (expression, optionsOrCallback, maybeCallback) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (expression === 'location.origin') { callback(ORIGIN, undefined); return; }
    if (expression.includes('hostSend')) { callback(window.eval(expression), undefined); return; }
    baseEval(expression, optionsOrCallback, maybeCallback);
  };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') }));
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
  return { listeners };
}

const fire = (listeners, entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));

const ipEntry = (extra = {}) => vfNetworkEntry({
  call: ipPreviewCall(), text: remotingAnswer(12, { fullDataJson: ipFullData() }), ...extra
});
const drEntry = (extra = {}) => vfNetworkEntry({
  call: drPreviewCall(), text: remotingAnswer(24, drResult()), startedDateTime: '2026-03-02T09:20:00Z', time: 48, ...extra
});

afterEach(async () => {
  (await import('../../../src/ui/actions/action-toast.js')).closeActionToast();
  const close = $('test-close');
  if (close) close.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  delete global.fetch;
  delete navigator.clipboard;
});

describe('the list', () => {
  it('shows a preview of each kind as an IP or DR call, without All Apex calls', async () => {
    const { listeners } = await boot();
    fire(listeners, auraNetworkEntry({ actionId: '9', plainApex: { classname: 'LayoutController', method: 'getLayout' }, startedDateTime: '2026-03-02T09:00:00Z' }));
    fire(listeners, ipEntry());
    fire(listeners, drEntry());
    expect(rows()).toHaveLength(2); // the plain Apex call stays out
    const [ip, dr] = rows();
    expect(ip.querySelector('.tag-ip').textContent).toBe('IP');
    expect(ip.querySelector('.tag-type-ip')).not.toBeNull();
    expect(ip.textContent).toContain('IP preview');
    expect(dr.querySelector('.tag-dr').textContent).toBe('DR');
    expect(dr.textContent).toContain('DRDemoGetAccount');
  });
});

describe('the Debug tab of an Integration Procedure preview', () => {
  async function open() {
    const booted = await boot();
    fire(booted.listeners, ipEntry());
    rows()[0].click();
    return booted;
  }

  it('leaves the other tabs as they were', async () => {
    await open();
    tabs().find((tab) => tab.textContent === 'Input').click();
    expect(detail().textContent).toContain(ACCOUNT_ID);
    expect(detail().querySelector('.debug-body')).toBeNull();
  });
});

describe('Re-run of a preview', () => {
  it('is not offered with Allow test calls off, and New test call does not offer it', async () => {
    const { listeners } = await boot({ settings: { allowTestCalls: false } });
    fire(listeners, ipEntry());
    rows()[0].click();
    expect($('detail-rerun')).toBeNull();
  });

  it('does not offer a re-run for an ordinary remoting call', async () => {
    const { listeners } = await boot();
    const plain = vfNetworkEntry({
      call: { action: 'MyController', method: 'invokeMethod', data: ['vlocity_ins.DRService', 'invokeInboundDR', { A: 1 }, { bundle: 'X' }], tid: 3, type: 'rpc', ctx: CTX },
      text: remotingAnswer(3, { ok: true })
    });
    fire(listeners, plain);
    rows()[0].click();
    expect($('detail-rerun')).toBeNull();
    expect(tabNames()).not.toContain('Debug');
  });
});
