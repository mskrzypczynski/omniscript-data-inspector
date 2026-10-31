'use strict';

/* The page-side fetch and the shared payload feed, run end to end: the stub
 * eval executes the real stringified hostFetch against the jsdom document. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';
import { payloadSignature } from '../../../src/core/data/payload-sig.js';

function runInPage(expression, callback, log) {
  const result = (0, eval)(expression);
  log.push({ expression, result });
  callback(result);
}

function stubChrome(log) {
  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, a, b) => {
          const callback = typeof a === 'function' ? a : b;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          runInPage(expression, callback, log);
        }
      }
    }
  };
}

function addHost(props) {
  const host = document.createElement('c-omni');
  Object.assign(host, props);
  document.body.appendChild(host);
  return host;
}

async function boot() {
  jest.resetModules();
  const log = [];
  stubChrome(log);
  mountPanelMarkup();
  const host = addHost({
    jsonDataStr: '{"a":1}',
    jsonDef: JSON.stringify({ asIndex: 2, children: [] })
  });
  const { Targets } = await import('../../../src/ui/targets.js');
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  await new Promise((resolve) => Targets.start(resolve));
  log.length = 0;
  const fetch = (which, opts) => new Promise((resolve) =>
    Targets.fetch(which, (value, error, peek) => resolve({ value, error, peek }), opts));
  return { Targets, host, log, fetch };
}

afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; delete window.__omniPeekCache; });

describe('page-side hostFetch signature', () => {
  it('computes the same signature as src/core/data/payload-sig.js', async () => {
    const { host, log, fetch } = await boot();
    host.jsonDataStr = '{"zażółć":"x","n":[1,2,3]}';
    await fetch('jsonDataStr');
    expect(log[0].result.sig).toBe(payloadSignature(host.jsonDataStr));
  });

  it('keeps the old behaviour without a signature', async () => {
    const { Targets, log } = await boot();
    const { hostFetch } = await import('../../../src/ui/targets.js');
    expect(Targets.selected()).not.toBeNull();
    const result = hostFetch('jsonDataStr', 'jsonDef', 0, 'jsonDataStr');
    expect(result.value).toBe('{"a":1}');
    expect(result.unchanged).toBeUndefined();
    expect(log).toHaveLength(0);
  });
});

describe('Targets.fetch through the shared feed', () => {
  it('asks again with the held signature and gets "unchanged" without the string', async () => {
    const { fetch, log } = await boot();
    const first = await fetch('jsonDataStr');
    expect(first.value).toBe('{"a":1}');
    expect(log[0].result.value).toBe('{"a":1}');

    const second = await fetch('jsonDataStr');
    expect(second.value).toBe('{"a":1}');
    expect(log[1].result.unchanged).toBe(true);
    expect(log[1].result.value).toBeUndefined();
  });

  it('sends no signature with full: true, so the whole string comes back', async () => {
    const { fetch, log } = await boot();
    await fetch('jsonDataStr');
    const again = await fetch('jsonDataStr', { full: true });
    expect(again.value).toBe('{"a":1}');
    expect(log[1].result.unchanged).toBeUndefined();
    expect(log[1].result.value).toBe('{"a":1}');
  });

  it('returns the new string when the property changed', async () => {
    const { fetch, host, log } = await boot();
    await fetch('jsonDataStr');
    host.jsonDataStr = '{"a":2}';
    const next = await fetch('jsonDataStr');
    expect(next.value).toBe('{"a":2}');
    expect(log[1].result.unchanged).toBeUndefined();
  });

  it('reuses a read younger than maxAge without touching the page', async () => {
    const { fetch, log } = await boot();
    await fetch('jsonDataStr');
    const count = log.length;
    const again = await fetch('jsonDataStr', { maxAge: 500 });
    expect(again.value).toBe('{"a":1}');
    expect(log).toHaveLength(count);
  });

  it('folds the asIndex peek into the same round trip', async () => {
    const { fetch, log } = await boot();
    const read = await fetch('jsonDataStr', { maxAge: 500, peek: { prop: 'jsonDef', field: 'asIndex' } });
    expect(read.peek).toBe(2);
    expect(log).toHaveLength(1);
    const cached = await fetch('jsonDataStr', { maxAge: 500, peek: { prop: 'jsonDef', field: 'asIndex' } });
    expect(cached.peek).toBe(2);
    expect(log).toHaveLength(1);
  });

  it('does not reuse an old peek after a read that did not ask for one', async () => {
    const { fetch, host, log } = await boot();
    const peek = { prop: 'jsonDef', field: 'asIndex' };
    let clock = 1000;
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    expect((await fetch('jsonDataStr', { maxAge: 500, peek })).peek).toBe(2);
    // the definition moves on while the payload string stays the same
    host.jsonDef = JSON.stringify({ asIndex: 5, children: [] });
    clock += 400;
    await fetch('jsonDataStr'); // the Data tab's poll: "unchanged", no peek asked
    clock += 400; // the payload was confirmed 400 ms ago, the peek was read 800 ms ago
    const count = log.length;
    const next = await fetch('jsonDataStr', { maxAge: 500, peek });
    spy.mockRestore();
    expect(log.length).toBe(count + 1);
    expect(next.peek).toBe(5);
  });

  it('retries with the full string when "unchanged" arrives after the feed was cleared', async () => {
    const { Targets, fetch, log } = await boot();
    await fetch('jsonDataStr');
    log.length = 0;
    const real = global.chrome.devtools.inspectedWindow.eval;
    let cleared = false;
    global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
      const callback = typeof a === 'function' ? a : b;
      if (!cleared && expression.includes('function hostFetch')) {
        cleared = true;
        real(expression, (result) => {
          Targets.setProps('jsonDataStr', null); // clears the feed while the read is in flight
          callback(result);
        });
        return;
      }
      real(expression, a, b);
    };
    const read = await fetch('jsonDataStr');
    expect(read.value).toBe('{"a":1}');
    const fetches = log.filter((entry) => entry.expression.includes('function hostFetch'));
    expect(fetches[fetches.length - 1].result.unchanged).toBeUndefined();
  });

  it('does not serve a stale value once the host disappears', async () => {
    const { fetch, host } = await boot();
    await fetch('jsonDataStr');
    host.remove();
    const gone = await fetch('jsonDataStr');
    expect(gone.value).toBeNull();
  });

  it('reports a property that went empty as before, then reads fresh when it returns', async () => {
    const { fetch, host } = await boot();
    await fetch('jsonDataStr');
    host.jsonDataStr = '';
    host.jsonDef = '{"x":1}'; // keep it listed as a host
    expect((await fetch('jsonDataStr')).value).toBe('');
    host.jsonDataStr = '{"a":1}';
    expect((await fetch('jsonDataStr')).value).toBe('{"a":1}');
  });
});
