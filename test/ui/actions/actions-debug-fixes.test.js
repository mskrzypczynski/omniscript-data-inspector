'use strict';

/* Debug runs, review fixes, through the real panel.html: the head follows the
 * call's verdict, the tab a debug run opens on, the steps table and the log.
 * Everything is invented (test/fixtures/debug-runs.js). */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { ipPreviewCall, ipFullData, remotingAnswer, vfNetworkEntry, IP_ID } from '../../fixtures/debug-runs.js';

const $ = (id) => document.getElementById(id);
const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

async function boot(settings = {}) {
  jest.resetModules();
  await seedSettings(settings);
  const listeners = stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  $('tab-actions').click();
  return listeners;
}

const fire = (listeners, entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
const ipEntry = (data = ipFullData(), extra = {}) => vfNetworkEntry({ call: ipPreviewCall(), text: remotingAnswer(12, { fullDataJson: data }), ...extra });

afterEach(() => {
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

describe('an Integration Procedure preview is named by its Id', () => {
  it('lists the Id in the name, and the filter finds it', async () => {
    const listeners = await boot();
    fire(listeners, ipEntry());
    fire(listeners, vfNetworkEntry({
      call: { ...ipPreviewCall({ tid: 13 }), data: ['a0A000000000002AAA', '{}', {}] }, text: remotingAnswer(13, { fullDataJson: ipFullData() }),
      startedDateTime: '2026-03-02T09:16:00Z'
    }));
    expect(rows().map((row) => row.textContent.includes('IP preview · a0A00000000000'))).toEqual([true, true]);
    jest.useFakeTimers();
    $('log-filter').value = 'a0A000000000002AAA';
    $('log-filter').dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('a0A000000000002AAA');
    expect(rows()[0].textContent).not.toContain(IP_ID);
  });
});

describe('the stylesheet of the Debug tab', () => {
  // jsdom lays nothing out, so the rules themselves are checked.
  const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

  it('hides the query Copy with opacity, so it can take focus, and shows it on focus within the line', () => {
    const rule = /\.debug-copy \{[^}]*\}/.exec(css)[0];
    expect(rule).toContain('opacity: 0');
    expect(rule).not.toContain('visibility');
    expect(css).toMatch(/\.debug-line:focus-within \.debug-copy/);
  });

  it('styles the log list, not the section that holds it', () => {
    expect(css).toMatch(/\.debug-lines \{/);
    expect(css).not.toMatch(/(^|\n)\.debug-log \{/);
  });

  it('drops the Type column in a narrow container so Elapsed and Share stay in view', () => {
    expect(css).toMatch(/@container \(max-width: 400px\) \{[^}]*\.debug-steps td\.debug-type \{ display: none; \}/);
  });
});
