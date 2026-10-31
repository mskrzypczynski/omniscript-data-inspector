'use strict';

/* The Auto-refresh checkbox: with it off the payload is read only on an
 * explicit action. A rescan that notices a host's data changed (it did, every
 * time the payload length moved) or a tab switch must not read it again. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';

function stubChrome(counter) {
  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} }, onRequestFinished: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (!callback) return;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          if (expression.includes('function hostFetch')) {
            counter.fetches++;
            callback({ ok: true, count: 1, missing: false, value: '{"a":1}' });
            return;
          }
          counter.scans++; // each scan also reports one more nested host, so the host list "changed" while the script stays
          callback({ ok: true, hosts: [{ label: 'c-a', dataLen: 10, defLen: 1, top: true },
            { label: 'c-child' + counter.scans, dataLen: 1, defLen: 0, top: false }], hints: [], truncated: false });
        }
      }
    }
  };
}

async function boot() {
  jest.resetModules();
  const counter = { fetches: 0, scans: 0 };
  stubChrome(counter);
  mountPanelMarkup();
  const { DataTab } = await import('../../../src/ui/data-tab.js');
  const { Targets } = await import('../../../src/ui/targets.js');
  DataTab.mount();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  await new Promise((resolve) => Targets.start(() => { DataTab.read(); resolve(); }));
  return { DataTab, Targets, counter };
}

const rescan = (Targets) => new Promise((resolve) => Targets.refresh(resolve));

describe('Auto-refresh off', () => {
  it('does not read on a background rescan, a tab show or the panel coming back', async () => {
    const { DataTab, Targets, counter } = await boot();
    const live = document.getElementById('live');
    live.checked = false;
    live.dispatchEvent(new Event('change'));
    const baseline = counter.fetches;

    await rescan(Targets);
    DataTab.hide();
    DataTab.show();
    DataTab.setVisible(false);
    DataTab.setVisible(true);

    expect(counter.fetches).toBe(baseline);
    expect(document.getElementById('status-right').textContent).toContain('Manual mode');
  });

  it('reads when Refresh is pressed', async () => {
    const { counter } = await boot();
    const live = document.getElementById('live');
    live.checked = false;
    live.dispatchEvent(new Event('change'));
    const baseline = counter.fetches;
    document.getElementById('refresh').click();
    expect(counter.fetches).toBe(baseline + 1);
  });

  it('still reads after a rescan when Auto-refresh is on', async () => {
    const { Targets, counter } = await boot();
    const baseline = counter.fetches;
    await rescan(Targets);
    expect(counter.fetches).toBeGreaterThan(baseline);
  });
});

describe('the Rescan button with Auto-refresh off', () => {
  it('finds hosts again but never reads the payload', async () => {
    jest.resetModules();
    const counter = { fetches: 0, scans: 0 };
    stubChrome(counter);
    mountPanelMarkup();
    const { Targets } = await import('../../../src/ui/targets.js');
    // the Data reader passes an options object without maxAge; Structure asks differently
    let dataReads = 0;
    const realFetch = Targets.fetch;
    Targets.fetch = (which, callback, opts) => {
      if (opts && !opts.maxAge) dataReads++;
      return realFetch(which, callback, opts);
    };
    await import('../../../src/ui/app.js');
    const live = document.getElementById('live');
    live.checked = false;
    live.dispatchEvent(new Event('change'));
    const reads = dataReads;
    const scans = counter.scans;

    document.getElementById('rescan').click();

    expect(counter.scans).toBeGreaterThan(scans);
    expect(dataReads).toBe(reads);
  });
});

describe('a hidden panel', () => {
  it('reads nothing on a background rescan, and reads again when it comes back', async () => {
    const { DataTab, Targets, counter } = await boot();
    DataTab.setVisible(false);
    const baseline = counter.fetches;
    await rescan(Targets);
    DataTab.refreshIfActive();
    expect(counter.fetches).toBe(baseline);
    DataTab.setVisible(true);
    expect(counter.fetches).toBeGreaterThan(baseline);
  });
});
