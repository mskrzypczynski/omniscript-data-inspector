'use strict';

/* Ticking several calls in the Calls tab: the boxes, the summary bar
 * and what Export writes. The sums themselves are tested in
 * test/core/actions-selection.test.js. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: selecting calls', () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));

  function addCalls() {
    // 0-100 ms, 50-250 ms (overlaps the first), 1000-1300 ms (a failure).
    fire(auraNetworkEntry({ actionId: '1', method: 'Alpha_Fetch', time: 100, startedDateTime: '2024-01-01T00:00:00.000Z' }));
    fire(auraNetworkEntry({ actionId: '2', method: 'Beta_Fetch', time: 200, startedDateTime: '2024-01-01T00:00:00.050Z' }));
    fire(auraNetworkEntry({ actionId: '3', method: 'Gamma_Fetch', time: 300, startedDateTime: '2024-01-01T00:00:01.000Z', errorInAction: 'boom' }));
  }

  describe('Export', () => {
    let written;

    beforeEach(() => {
      written = [];
      URL.createObjectURL = jest.fn((blob) => { written.push(blob); return 'blob:test'; });
      URL.revokeObjectURL = jest.fn();
      HTMLAnchorElement.prototype.click = jest.fn();
    });

    const readBlob = (blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(JSON.parse(reader.result));
      reader.readAsText(blob);
    });

    it('writes the visible calls when none is ticked', async () => {
      addCalls();
      document.getElementById('log-export').click();
      const rowsOut = await readBlob(written[0]);
      expect(rowsOut).toHaveLength(3);
    });
  });
});
