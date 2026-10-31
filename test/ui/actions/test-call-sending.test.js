'use strict';

/* Sending a test call, round six: one press sends one call, Paused sends
 * nothing and drops nothing, Re-run as it was asks first and says how it
 * landed, a filter that hides the new row says so, a give-up is not a failure,
 * a cut answer is not an error, the origin is the script's own frame, and a
 * closed form keeps the edits. fetch is a mock; the page is jsdom. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const ORIGIN = 'https://x.my.site.com';

const $ = (id) => document.getElementById(id);
const rows = () => document.querySelectorAll('#log-list .log-row:not(.log-head)');

async function boot({ origin = ORIGIN, evalDelay = 0, settings = {} } = {}) {
  jest.resetModules();
  await seedSettings({ allowTestCalls: true, testCallsAck: true, ...settings });
  const listeners = stubChromeDevtools();
  const baseEval = global.chrome.devtools.inspectedWindow.eval;
  global.chrome.devtools.inspectedWindow.eval = (expression, optionsOrCallback, maybeCallback) => {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    const later = (fn) => (evalDelay ? setTimeout(fn, evalDelay) : fn());
    if (expression === 'location.origin') { later(() => callback(origin, undefined)); return; }
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

afterEach(async () => {
  (await import('../../../src/ui/actions/action-toast.js')).closeActionToast(); // its 8 s timer must not outlive the test
  const close = $('test-close');
  if (close) close.click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  jest.useRealTimers();
  delete global.fetch;
});

describe('a request the parser reads nothing from', () => {
  it('is listed with a note of its size and start, never the session token', async () => {
    const { listeners } = await boot();
    const entry = auraNetworkEntry();
    fire(listeners, {
      ...entry,
      request: {
        ...entry.request,
        headers: [{ name: 'X-Omniscript-Inspector-Test', value: 'tk-undecoded' }],
        postData: { text: 'message=%7B%22nothing%22%3Atrue%7D&aura.context=%7B%22mode%22%3A%22PROD%22%7D&aura.token=SECRETTOKEN' }
      }
    });
    expect(rows()).toHaveLength(1);
    rows()[0].click();
    const detail = $('log-detail').textContent;
    expect(detail).toContain('request not decoded');
    expect(detail).not.toContain('SECRETTOKEN');
    const { Shared } = await import('../../../src/ui/shared.js');
    expect(JSON.stringify(Shared.calls())).not.toContain('SECRETTOKEN');
  });
});
