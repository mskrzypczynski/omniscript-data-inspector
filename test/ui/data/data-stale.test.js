'use strict';

/* The Data tab keeps the last payload on screen, marked stale, when the
 * OmniScript disappears (navigation, host removed, scan finds nothing). It used
 * to swap the tree for the "No OmniScript found" help text. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';

const PAYLOAD = JSON.stringify({ Step1: { Name: 'Ada' }, Other: 1 });

function stubPage(page) {
  const listeners = [];
  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: (fn) => listeners.push(fn) } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (!callback) return;
          if (expression.includes('function frameScan')) { callback({ ok: true, frames: [] }); return; }
          if (expression.includes('function hostScan')) {
            callback({ ok: true, hosts: page.hosts, hints: [], truncated: false });
            return;
          }
          if (expression.includes('function hostFetch')) {
            page.fetches++;
            callback({ ok: true, value: page.value });
            return;
          }
          callback({ ok: true });
        }
      }
    }
  };
  return listeners;
}

async function setup() {
  jest.resetModules();
  jest.useFakeTimers();
  const page = { hosts: [{ label: 'c-os', dataLen: 5, defLen: 5, top: true }], value: PAYLOAD, fetches: 0 };
  const navigated = stubPage(page);
  mountPanelMarkup();
  const { Targets } = await import('../../../src/ui/targets.js');
  const { DataTab } = await import('../../../src/ui/data-tab.js');
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  DataTab.mount();
  await new Promise((resolve) => Targets.start(resolve));
  DataTab.show();
  return { page, Targets, DataTab, navigated };
}

const viewport = () => document.getElementById('viewport');
const status = () => document.getElementById('status-right').textContent;

function setAutoRefresh(on) {
  const live = document.getElementById('live');
  live.checked = on;
  live.dispatchEvent(new Event('change'));
}

afterEach(() => { jest.useRealTimers(); });

describe('Data tab when the OmniScript disappears', () => {
  it('keeps the last payload, marked stale, after a navigation finds no script', async () => {
    const { page, navigated } = await setup();
    expect(viewport().textContent).toContain('Ada');

    page.hosts = [];
    navigated.forEach((fn) => fn());

    expect(viewport().textContent).toContain('Ada');
    expect(viewport().textContent).toContain('OmniScript no longer on the page');
    expect(viewport().textContent).not.toContain('No OmniScript found');
    expect(status()).toContain('Stale');
    expect(document.getElementById('status-left').textContent).toContain('last data read');
  });

  it('keeps the tree usable while stale: the filter still narrows it', async () => {
    const { page, Targets } = await setup();
    page.hosts = [];
    await new Promise((resolve) => Targets.refresh(resolve));

    const filter = document.getElementById('filter');
    filter.value = 'Ada';
    filter.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);

    expect(viewport().textContent).toContain('Ada');
    expect(viewport().textContent).not.toContain('Other');
    expect(viewport().textContent).toContain('no longer on the page');
  });

  it('does not rebuild the DOM when a poll finds nothing new while stale', async () => {
    const { page, Targets } = await setup();
    page.hosts = [];
    await new Promise((resolve) => Targets.refresh(resolve));
    const marker = viewport().firstChild;

    jest.advanceTimersByTime(3500);
    expect(viewport().firstChild).toBe(marker);
  });

  it('reads as usual when a script appears again', async () => {
    const { page, Targets } = await setup();
    page.hosts = [];
    await new Promise((resolve) => Targets.refresh(resolve));

    page.hosts = [{ label: 'c-os', dataLen: 5, defLen: 5, top: true }];
    page.value = JSON.stringify({ Fresh: true });
    await new Promise((resolve) => Targets.refresh(resolve));

    expect(viewport().textContent).toContain('Fresh');
    expect(viewport().textContent).not.toContain('no longer on the page');
    expect(status()).not.toContain('Stale');
  });

  it('with Auto-refresh off, a navigation marks the data stale without reading the page', async () => {
    const { page, navigated } = await setup();
    setAutoRefresh(false);

    page.hosts = [];
    page.fetches = 0;
    navigated.forEach((fn) => fn());

    expect(page.fetches).toBe(0);
    expect(viewport().textContent).toContain('Ada');
    expect(status()).toContain('Stale');
  });

  it('with Auto-refresh off, a background rescan that finds the script does not read it', async () => {
    const { page, Targets } = await setup();
    setAutoRefresh(false);

    page.hosts = [{ label: 'c-os', dataLen: 6, defLen: 5, top: true }];
    page.fetches = 0;
    await new Promise((resolve) => Targets.refresh(resolve));

    expect(page.fetches).toBe(0);
  });
});
