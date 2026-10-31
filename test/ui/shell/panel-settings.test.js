'use strict';

/* Settings are held in memory: the controls and the state agree from mount on,
 * nothing reaches browser storage, and the Calls filters are never
 * hidden from the user. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';

function auraEntry(actionId, sClassName) {
  const message = JSON.stringify({
    actions: [{
      id: actionId,
      descriptor: 'aura://ApexActionController/ACTION$execute',
      params: {
        classname: sClassName, method: 'run',
        params: sClassName.startsWith('omni') ? { sClassName, sMethodName: 'run', input: '{}', options: {} } : {}
      }
    }]
  });
  return {
    request: { url: 'https://x.my.site.com/aura?r=1', method: 'POST', postData: { text: new URLSearchParams({ message }).toString() } },
    response: { status: 200, bodySize: 1 },
    time: 5,
    startedDateTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    getContent: (cb) => cb(`while(1);${JSON.stringify({ actions: [{ id: actionId, state: 'SUCCESS', returnValue: { returnValue: {} } }] })}`)
  };
}

async function boot(initial) {
  jest.resetModules();
  await seedSettings(initial);
  const listeners = stubChromeDevtools();
  global.chrome.devtools.inspectedWindow.reload = jest.fn();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  return listeners;
}

const $ = (id) => document.getElementById(id);
const click = (id) => $(id).click();

describe('settings at mount', () => {
  it('writes nothing to browser storage', async () => {
    await boot();
    click('view-raw');
    $('mask-values').checked = true; $('mask-values').dispatchEvent(new Event('change'));
    $('filter').value = 'abc'; $('filter').dispatchEvent(new Event('input'));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('starts with Mask values off on the next open', async () => {
    await boot();
    $('mask-values').checked = true; $('mask-values').dispatchEvent(new Event('change'));
    await boot();
    expect($('mask-values').checked).toBe(false);
  });
});

describe('Calls filters', () => {
  it('shows the no-match line instead of a blank list when every call is filtered out', async () => {
    const listeners = await boot();
    click('tab-actions');
    listeners.onRequestFinished.forEach((fn) => fn(auraEntry('9', 'my.Custom')));
    expect($('log-notes').textContent).toBe('No calls to showClear filter');
    // The notice is the first thing inside the list pane; there are no rows.
    expect([...$('log-list').children].filter((node) => node !== $('log-notes'))).toHaveLength(0);
    // Nothing to select: the detail pane does not ask for it.
    expect($('log-detail').textContent).toBe('');
  });

  it('explains the empty list and offers a reload', async () => {
    await boot();
    click('tab-actions');
    const empty = document.querySelector('#log-notes .notice.is-empty');
    expect(empty.querySelector('h2').textContent).toBe('No calls captured yet');
    expect(empty.textContent).toContain('only while DevTools is open');
    expect(empty.textContent).toContain('Reload with the panel open');
    expect(empty.querySelectorAll('button')).toHaveLength(1);
    // The notice is the first thing inside the list pane; there are no rows.
    expect([...$('log-list').children].filter((node) => node !== $('log-notes'))).toHaveLength(0);
    click('log-reload');
    expect(global.chrome.devtools.inspectedWindow.reload).toHaveBeenCalled();
  });
});

describe('labels', () => {
  it('renders shortcuts as a table of kbd keys in the help', async () => {
    await boot();
    click('help');
    const rows = document.querySelectorAll('#help-body table.keys tr');
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows[0].querySelector('kbd').textContent).toBe('/');
  });
});
