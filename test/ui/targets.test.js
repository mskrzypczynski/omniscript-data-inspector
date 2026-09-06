'use strict';

/* Regression test for a real bug: hostScan finds every element exposing the
 * data property, including nested child-element hosts, and a dropdown
 * option's value is that host's position in the *global*, cumulative scan
 * order (see scanHosts in src/ui/targets.js). A hidden nested host appearing
 * between two visible hosts shifts the later one's index without changing
 * either visible label — so the rendered <option> values must be re-synced
 * whenever that could have happened, or an option that still reads "the
 * right OmniScript" silently selects whatever host now sits at its old
 * index once clicked. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from './support/panel-fixture.js';

function stubChromeWithScriptedHostScans(hostScanResponses) {
  let call = 0;

  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (!callback) return;

          if (expression.includes('function frameScan')) {
            callback({ ok: true, frames: [] }); // a single top frame, no iframes
            return;
          }

          const hosts = hostScanResponses[Math.min(call, hostScanResponses.length - 1)];
          call++;
          callback({ ok: true, hosts, hints: [], truncated: false });
        }
      }
    }
  };
}

async function loadTargets() {
  jest.resetModules();
  const { Targets } = await import('../../src/ui/targets.js');
  return Targets;
}

function mountTargets(Targets) {
  mountPanelMarkup();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
}

function optionLabelled(select, text) {
  return [...select.options].find((option) => option.textContent === text);
}

describe('Targets host selection across a rescan', () => {
  it('keeps an unselected dropdown option pointing at the right host once a hidden nested host shifts its index', async () => {
    const Targets = await loadTargets();
    stubChromeWithScriptedHostScans([
      // First scan: two top-level hosts. Selection defaults to index 0 (A).
      [
        { label: 'c-quote-A', dataLen: 10, defLen: 5, top: true },
        { label: 'c-quote-B', dataLen: 10, defLen: 5, top: true }
      ],
      // Second scan: a nested child host now sits between them in scan
      // order. A (selected) is still first, so its index — and therefore
      // state.selected — doesn't change. B's index shifts from 1 to 2.
      [
        { label: 'c-quote-A', dataLen: 10, defLen: 5, top: true },
        { label: 'c-quote-A-child', dataLen: 1, defLen: 0, top: false },
        { label: 'c-quote-B', dataLen: 10, defLen: 5, top: true }
      ]
    ]);
    mountTargets(Targets);

    await new Promise((resolve) => Targets.start(resolve));
    expect(Targets.selected().label).toBe('c-quote-A'); // default selection

    // A rescan runs, exactly as the periodic poll or the Rescan button
    // would, while the selected host (A) never moves.
    await new Promise((resolve) => Targets.refresh(resolve));
    expect(Targets.selected().label).toBe('c-quote-A'); // still correct internally

    const targetSelect = document.getElementById('target');
    const optionForB = optionLabelled(targetSelect, 'c-quote-B');
    expect(optionForB).toBeDefined();

    targetSelect.value = optionForB.value;
    targetSelect.dispatchEvent(new Event('change'));

    // The option still labelled "c-quote-B" must resolve to the actual
    // c-quote-B host — not the nested host that now sits at its old index.
    expect(Targets.selected().label).toBe('c-quote-B');
  });
});
