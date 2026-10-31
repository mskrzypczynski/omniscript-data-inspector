'use strict';

/* hostSend runs inside the inspected page: tested against its real source,
 * once called directly and once as the page receives it (its text only). */

import { jest } from '@jest/globals';
import { hostSend, hostSendResult } from '../../../src/ui/targets.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('hostSend (runs inside the inspected page)', () => {
  afterEach(() => { delete window.__omniInspectorSends; delete global.fetch; });

  const REQ = { url: 'https://x.my.site.com/aura?r=1', method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Omniscript-Inspector-Test': 'tk' }, body: 'message=%7B%7D' };

  it('sends the request with the page\'s own session and returns at once', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    expect(hostSend(REQ, 'a1')).toEqual({ ok: true, started: true });
    expect(global.fetch).toHaveBeenCalledWith(REQ.url, { method: 'POST', headers: REQ.headers, credentials: 'include', body: REQ.body });
    expect(hostSendResult('a1')).toEqual({ done: false });
    await flush();
    expect(hostSendResult('a1')).toEqual({ done: true, ok: true, status: 200, text: '', truncated: false, ms: expect.any(Number) });
    expect(hostSendResult('a1').error).toBe('unknown send'); // read once, then forgotten
  });

  it('hands back the text of the answer, capped at 2 MB and flagged as cut, and writes nothing into the DOM', async () => {
    const response = { ok: true, status: 200, text: jest.fn(() => Promise.resolve('x'.repeat(3 * 1024 * 1024))), json: jest.fn(), clone: jest.fn() };
    global.fetch = jest.fn(() => Promise.resolve(response));
    const before = document.body.innerHTML;
    hostSend(REQ, 'a2');
    await flush(); await flush();
    expect(response.text).toHaveBeenCalledTimes(1);
    expect(response.json).not.toHaveBeenCalled();
    const read = hostSendResult('a2');
    expect(read.text).toHaveLength(2 * 1024 * 1024);
    expect(read.truncated).toBe(true);
    expect(document.body.innerHTML).toBe(before);
  });

  it('does not flag an answer of exactly 2 MB as cut', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('x'.repeat(2 * 1024 * 1024)) }));
    hostSend(REQ, 'a3');
    await flush(); await flush();
    expect(hostSendResult('a3').truncated).toBe(false);
  });

  it('measures the fetch itself, until the text is read, not the panel\'s polling', async () => {
    const times = [1000, 1640];
    const spy = jest.spyOn(performance, 'now').mockImplementation(() => times.shift() ?? 1640);
    try {
      global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }));
      hostSend(REQ, 'ms1');
      await flush(); await flush();
      // Polling late changes nothing: the time was taken when the text arrived.
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(hostSendResult('ms1').ms).toBe(640);
    } finally { spy.mockRestore(); }
  });

  it('keeps no more than 5 finished entries in the page, and never drops one still running', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }));
    for (let i = 0; i < 8; i++) { hostSend(REQ, `k${i}`); await flush(); await flush(); }
    expect(Object.keys(window.__omniInspectorSends)).toEqual(['k3', 'k4', 'k5', 'k6', 'k7']);
    global.fetch = jest.fn(() => new Promise(() => {})); // never answers
    hostSend(REQ, 'run1');
    expect(Object.keys(window.__omniInspectorSends)).toContain('run1');
    expect(Object.keys(window.__omniInspectorSends)).toHaveLength(5);
    expect(hostSendResult('run1')).toEqual({ done: false });
  });

  it('forgets a send the panel gave up on: the entry goes, and a late answer is not kept', async () => {
    let answer;
    global.fetch = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
    hostSend(REQ, 'f1');
    expect(hostSendResult('f1', true).error).toBe('forgotten');
    expect(window.__omniInspectorSends).toEqual({});
    answer({ ok: true, status: 200, text: () => Promise.resolve('secret answer') });
    await flush(); await flush();
    expect(window.__omniInspectorSends).toEqual({});
    expect(hostSendResult('f1').error).toBe('unknown send');
  });

  it('reports a network failure and a failing status', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Failed to fetch')));
    hostSend(REQ, 'b1');
    await flush();
    expect(hostSendResult('b1')).toEqual({ done: true, ok: false, status: 0, error: 'Failed to fetch', ms: expect.any(Number) });
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }));
    hostSend(REQ, 'b2');
    await flush();
    expect(hostSendResult('b2')).toEqual({ done: true, ok: false, status: 500, text: '', truncated: false, ms: expect.any(Number) });
  });

  it('sends no body with a GET', () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    hostSend({ ...REQ, method: 'GET' }, 'c1');
    expect(global.fetch.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('answers with the error when fetch itself throws', () => {
    global.fetch = () => { throw new Error('blocked'); };
    expect(hostSend(REQ, 'd1')).toEqual({ ok: false, started: false, error: 'blocked' });
  });

  it('is self-contained: its source text alone does the same, with nothing of this module in reach', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 204 }));
    const remote = new Function(`return (${hostSend.toString()})(${JSON.stringify(REQ)},"e1");`);
    expect(remote()).toEqual({ ok: true, started: true });
    await flush();
    const read = new Function(`return (${hostSendResult.toString()})("e1");`);
    expect(read()).toEqual({ done: true, ok: true, status: 204, text: '', truncated: false, ms: expect.any(Number) });
  });
});

describe('Targets.send', () => {
  afterEach(() => { delete window.__omniInspectorSends; delete global.fetch; delete global.chrome; });

  function stubPage() {
    global.chrome = { devtools: { network: { onNavigated: { addListener: () => {} } }, inspectedWindow: {
      getResources: (callback) => callback([]),
      eval: (expression, optionsOrCallback, maybeCallback) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        callback(window.eval(expression), undefined);
      }
    } } };
  }

  it('starts the call in the page, then reports the status once the page has it', async () => {
    stubPage();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200 }));
    const { Targets } = await import('../../../src/ui/targets.js');
    const outcome = await new Promise((resolve) => Targets.send({ url: 'https://x/aura', method: 'POST', headers: {}, body: 'a=b' }, resolve));
    expect(outcome).toEqual({ ok: true, status: 200, error: undefined, text: '', truncated: false, ms: expect.any(Number) });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('passes on the cut flag and the time of the fetch', async () => {
    stubPage();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('x'.repeat(2 * 1024 * 1024 + 5)) }));
    const { Targets } = await import('../../../src/ui/targets.js');
    const outcome = await new Promise((resolve) => Targets.send({ url: 'https://x/aura', method: 'POST', headers: {}, body: 'a=b' }, resolve));
    expect(outcome.truncated).toBe(true);
    expect(outcome.text).toHaveLength(2 * 1024 * 1024);
    expect(outcome.ms).toEqual(expect.any(Number));
  });

  it('gives up after 60 s, says so apart from a failure, and has the page forget the send', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      stubPage();
      global.fetch = jest.fn(() => new Promise(() => {})); // the server never answers
      const { Targets } = await import('../../../src/ui/targets.js');
      const done = new Promise((resolve) => Targets.send({ url: 'https://x/aura', method: 'POST', headers: {}, body: '' }, resolve));
      await jest.advanceTimersByTimeAsync(61000);
      const outcome = await done;
      expect(outcome).toMatchObject({ ok: false, status: 0, gaveUp: true });
      expect(outcome.error).toMatch(/no answer within 60 s/);
      expect(window.__omniInspectorSends).toEqual({});
    } finally { jest.useRealTimers(); }
  });

  it('sendOrigin reads the origin in the selected script\'s frame, not the top document', async () => {
    const seen = [];
    global.chrome = { devtools: { network: { onNavigated: { addListener: () => {} } }, inspectedWindow: {
      getResources: (callback) => callback([]),
      eval: (expression, optionsOrCallback, maybeCallback) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        seen.push({ expression, options: typeof optionsOrCallback === 'function' ? null : optionsOrCallback });
        callback(expression === 'location.origin' ? (typeof optionsOrCallback === 'function' ? 'https://top.my.site.com' : 'https://frame.vf.force.com') : undefined, undefined);
      }
    } } };
    const { Targets } = await import('../../../src/ui/targets.js');
    expect(await new Promise((resolve) => Targets.sendOrigin(resolve))).toBe('https://top.my.site.com');
    expect(await new Promise((resolve) => Targets.pageOrigin(resolve))).toBe('https://top.my.site.com');
  });

  it('passes on a network failure', async () => {
    stubPage();
    global.fetch = jest.fn(() => Promise.reject(new Error('Failed to fetch')));
    const { Targets } = await import('../../../src/ui/targets.js');
    const outcome = await new Promise((resolve) => Targets.send({ url: 'https://x/aura', method: 'POST', headers: {}, body: '' }, resolve));
    expect(outcome).toMatchObject({ ok: false, status: 0, error: 'Failed to fetch' });
  });
});
