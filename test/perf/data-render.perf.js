'use strict';

/* Budget: the Data tab takes a payload of about 3 MB from the page to the
 * screen (read, parse, windowed tree) in the time allowed, and a second poll
 * that finds the same payload is cheap. The correctness of the render (the
 * window, no rebuild) is test/ui/data/data-perf.test.js; this is the clock. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../ui/support/panel-fixture.js';
import { BUDGET_MS, timed } from './budget.js';

function bigPayload(targetBytes) {
  const items = [];
  let size = 0;
  for (let i = 0; size < targetBytes; i++) {
    const item = { id: i, name: `Element ${i}`, value: 'x'.repeat(40), nested: { a: i, b: [i, i + 1], c: 'text' } };
    size += JSON.stringify(item).length + 1;
    items.push(item);
  }
  return JSON.stringify({ items });
}

async function boot(host) {
  jest.resetModules();
  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, a, b) => {
          const callback = typeof a === 'function' ? a : b;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          callback((0, eval)(expression));
        }
      }
    }
  };
  mountPanelMarkup();
  Object.assign(document.body.appendChild(document.createElement('c-omni')), host);
  const { DataTab } = await import('../../src/ui/data-tab.js');
  const { Targets } = await import('../../src/ui/targets.js');
  DataTab.mount();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  await new Promise((resolve) => Targets.start(resolve));
  DataTab.show();
  return DataTab;
}

const readOnce = (DataTab) => new Promise((resolve) => { DataTab.read(); setTimeout(resolve, 0); });

afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

describe('Data tab with a 3 MB payload', () => {
  it('shows the tree within the budget, and a poll of the same payload costs little', async () => {
    const payload = bigPayload(3 * 1024 * 1024);
    expect(payload.length).toBeGreaterThan(3 * 1024 * 1024);
    const DataTab = await boot({ jsonDataStr: payload, jsonDef: '{}' });

    const first = await timed(() => readOnce(DataTab));
    expect(document.querySelectorAll('#viewport .row').length).toBeGreaterThan(0);
    expect(first).toBeLessThan(BUDGET_MS);

    const again = await timed(() => readOnce(DataTab));
    expect(again).toBeLessThan(BUDGET_MS);
    process.stderr.write(`Data tab, 3 MB: first read ${Math.round(first)} ms, unchanged poll ${Math.round(again)} ms\n`);
  });
});
