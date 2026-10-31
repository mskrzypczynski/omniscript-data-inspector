'use strict';

/* The debug bundle and Copy report follow the list's own All Apex calls state, also
 * after Clear filter (which shows every call without changing the stored
 * setting). Names are invented. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import { tick } from '../support/structure-page.js';

const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

function readBlob(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

async function boot() {
  jest.resetModules();
  const listeners = stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  fire(auraNetworkEntry({ actionId: '1', method: 'Order_Place' }));
  fire(auraNetworkEntry({ actionId: '2', plainApex: { classname: 'LayoutController', method: 'getLayout' }, startedDateTime: '2024-01-01T00:00:05Z' }));
  return { fire };
}

async function savedBundle() {
  const blobs = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const { saveDebugBundle } = await import('../../../src/ui/debug-bundle.js');
  saveDebugBundle();
  for (let i = 0; i < 6; i++) await tick();
  return JSON.parse(await readBlob(blobs[blobs.length - 1]));
}

afterEach(() => { jest.restoreAllMocks(); document.querySelectorAll('.toast').forEach((node) => node.remove()); });

describe('the bundle and the list agree on All Apex calls', () => {
  it('lists the OmniStudio call only, in the list and in the bundle, by default', async () => {
    await boot();
    expect(rows()).toHaveLength(1);
    const bundle = await savedBundle();
    expect(bundle.calls).toHaveLength(1);
    expect(bundle.tabs.actions.filters.onlyOmni).toBe(true);
  });
});

