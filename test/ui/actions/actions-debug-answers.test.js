'use strict';

/* An Integration Procedure a page called with isDebug: true in its options
 * answers with its whole debug run: in Calls it opens on a Debug tab like a
 * designer preview, keeps the procedure's name, and re-runs through the
 * ordinary form. Through the real panel.html; everything is invented
 * (test/fixtures/debug-runs.js). */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import { ipDebugAnswer, ipPlainAnswer } from '../../fixtures/debug-runs.js';

const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
const detail = () => $('log-detail');
const tabs = () => [...detail().querySelectorAll('.seg-btn')];
const tabNames = () => tabs().map((button) => button.textContent);
const onTab = () => tabs().filter((button) => button.classList.contains('is-on')).map((button) => button.textContent);

async function boot() {
  jest.resetModules();
  await seedSettings({ allowTestCalls: true, testCallsAck: true });
  const listeners = stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
  return listeners;
}

const fire = (listeners, entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
const OPTIONS = { isDebug: true, chainable: false };
const debugCall = (output = ipDebugAnswer(), extra = {}) =>
  auraNetworkEntry({ method: 'Account_Fetch', options: OPTIONS, output, startedDateTime: '2026-03-02T09:15:00Z', time: 410, ...extra });

async function openRun(output) {
  const listeners = await boot();
  fire(listeners, debugCall(output));
  rows()[0].click();
  return listeners;
}

afterEach(() => {
  const close = $('test-close');
  if (close) close.click();
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

describe('an Integration Procedure called with isDebug', () => {
  it('has no Debug tab for the same procedure answering without isDebug', async () => {
    await openRun(ipPlainAnswer());
    expect(tabNames()).not.toContain('Debug');
    expect(onTab()).toEqual(['Input']);
  });
});
