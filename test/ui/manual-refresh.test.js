'use strict';

/* With Auto-refresh off the Data tab reads only when asked: pressing Refresh or
 * Rescan, or choosing another script or property. Switching tab or the panel
 * coming back into view must not read. */

import { mountPanelMarkup } from './support/panel-fixture.js';

let payloadReads = 0;

function stubChrome() {
  global.chrome = {
    devtools: {
      network: { onRequestFinished: { addListener() {} }, onNavigated: { addListener() {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, a, b) => {
          const callback = typeof a === 'function' ? a : b;
          if (!callback) return;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          if (expression.includes('function hostScan')) {
            callback({ ok: true, hosts: [{ label: 'demo', dataLen: 7, defLen: 0, top: true }], hints: [], truncated: false });
            return;
          }
          if (expression.includes('function hostFetch')) {
            payloadReads++;
            callback({ ok: true, count: 1, missing: false, value: `{"read":${payloadReads}}` });
            return;
          }
          callback({ ok: true, props: [], value: null });
        }
      }
    }
  };
}

describe('Auto-refresh off', () => {
  beforeAll(async () => {
    stubChrome();
    mountPanelMarkup();
    await import('../../src/ui/app.js');
  });

  it('reads on load, then only when asked', () => {
    expect(payloadReads).toBeGreaterThan(0);

    const live = document.getElementById('live');
    live.checked = false;
    live.dispatchEvent(new Event('change'));
    const before = payloadReads;

    document.getElementById('tab-actions').click();
    document.getElementById('tab-data').click();
    window.OmniPanel.setVisible(false);
    window.OmniPanel.setVisible(true);
    expect(payloadReads).toBe(before);

    document.getElementById('refresh').click();
    expect(payloadReads).toBe(before + 1);

    document.getElementById('rescan').click();
    expect(payloadReads).toBeGreaterThan(before + 1);
  });
});
