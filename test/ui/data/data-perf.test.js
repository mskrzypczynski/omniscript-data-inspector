'use strict';

/* A multi-megabyte payload through the real Data tab: it renders, and a poll
 * that finds the same payload changes nothing in the DOM. Asserted with a
 * mutation counter, not wall time; the time bound is only a generous guard. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';

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
  const { DataTab } = await import('../../../src/ui/data-tab.js');
  const { Targets } = await import('../../../src/ui/targets.js');
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

describe('Data tab with a large payload', () => {
  it('renders ~3 MB in a window and rebuilds nothing when the payload is unchanged', async () => {
    const payload = bigPayload(3 * 1024 * 1024);
    expect(payload.length).toBeGreaterThan(3 * 1024 * 1024);
    const DataTab = await boot({ jsonDataStr: payload, jsonDef: '{}' });

    const started = Date.now();
    await readOnce(DataTab);
    const viewport = document.getElementById('viewport');
    const rows = viewport.querySelectorAll('.row').length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(1500); // windowed, not 100k rows
    expect(viewport.querySelector('.vwin')).not.toBeNull();

    const added = [];
    const observer = new MutationObserver((records) => records.forEach((r) => added.push(r)));
    observer.observe(viewport, { childList: true, subtree: true });
    await readOnce(DataTab);
    await readOnce(DataTab);
    added.push(...observer.takeRecords());
    observer.disconnect();

    expect(added).toHaveLength(0); // no DOM rebuild for an unchanged payload
    expect(Date.now() - started).toBeLessThan(30000); // generous: only catches pathologies
  }, 20000); // a 3 MB render on a loaded machine needs more than the 5 s default
});
