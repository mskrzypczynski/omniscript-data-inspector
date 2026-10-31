'use strict';

/* Refresh rate (Settings, Reading): the Data tab's poll period comes from the
 * setting, read at every tick, and a change takes effect without waiting for
 * the pending tick. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';

function stubChrome() {
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
            callback({ ok: true, count: 1, missing: false, value: '{"a":1}' });
            return;
          }
          callback({ ok: true, hosts: [{ label: 'c-a', dataLen: 10, defLen: 1, top: true }], hints: [], truncated: false });
        }
      }
    }
  };
}

/* Boots the Data tab with a Refresh rate and returns the delays the poller
 * scheduled (setTimeout calls with a period of the poll's size). */
async function boot(rate) {
  jest.resetModules();
  stubChrome();
  mountPanelMarkup();
  const { Settings } = await import('../../../src/ui/settings.js');
  if (rate) Settings.set('refreshRate', rate);
  const delays = [];
  const real = global.setTimeout;
  jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...rest) => {
    if (typeof ms === 'number' && ms >= 400) delays.push(ms);
    return real(fn, ms, ...rest);
  });
  const { DataTab } = await import('../../../src/ui/data-tab.js');
  const { Targets } = await import('../../../src/ui/targets.js');
  DataTab.mount();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  await new Promise((resolve) => Targets.start(() => { DataTab.read(); resolve(); }));
  return { Settings, DataTab, delays };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('Refresh rate', () => {
  it.each([['fast', 500], ['normal', 1000], ['gentle', 3000]])('%s polls every %i ms right after a change', async (rate, ms) => {
    const { delays } = await boot(rate);
    expect(delays).toContain(ms);
    [500, 1000, 3000].filter((other) => other !== ms).forEach((other) => expect(delays).not.toContain(other));
  });

  it('is Normal until the setting says otherwise', async () => {
    const { delays } = await boot();
    expect(delays).toContain(1000);
  });

  it('takes a change at once, rescheduling the pending tick', async () => {
    const { Settings, delays } = await boot();
    delays.length = 0;
    Settings.apply({ refreshRate: 'gentle' });
    expect(delays).toContain(3000);
    delays.length = 0;
    Settings.resetKey('refreshRate');
    expect(delays).toContain(1000);
  });

  it('leaves the poll alone while Auto-refresh is off', async () => {
    const { Settings, delays } = await boot();
    const live = document.getElementById('live');
    live.checked = false;
    live.dispatchEvent(new Event('change'));
    delays.length = 0;
    Settings.apply({ refreshRate: 'fast' });
    expect(delays).toEqual([]);
  });
});
