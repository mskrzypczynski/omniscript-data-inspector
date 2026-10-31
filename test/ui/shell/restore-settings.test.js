'use strict';

/* "Restore default settings" and the list of custom settings in the help
 * dialog: everything returns to its default live, without reloading, and what
 * is not a setting (captured calls, filter text) stays. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { viewOn } from '../support/structure-menus.js';

const $ = (id) => document.getElementById(id);
const fire = (id, type = 'change') => $(id).dispatchEvent(new Event(type));

afterEach(() => {
  document.querySelectorAll('.toast').forEach((node) => node.remove());
});

const CUSTOM = {
  showFrameRow: true, showNested: true, dataView: 'raw', dataProp: 'myData', dataChanges: true, defProp: 'myDef',
  structFollow: false, structAutoCollapse: true, structHover: true, structVisibleOnly: true, structShowValues: true,
  clearOnReload: true, logShowAll: true, logErrorsOnly: true, logSlowMs: 300, timeFormat: 'human'
};

async function boot(initial) {
  jest.resetModules();
  await seedSettings(initial);
  const listeners = stubChromeDevtools();
  const evalSpy = jest.fn(global.chrome.devtools.inspectedWindow.eval);
  global.chrome.devtools.inspectedWindow.eval = evalSpy;
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  return { listeners, evalSpy };
}

const openHelp = () => { $('settings').click(); };
function restoreAll() {
  openHelp();
  $('settings-restore').click();
  $('settings-confirm').click();
}

describe('Restore default settings', () => {
  it('is then really the default: a later change counts as custom again', async () => {
    await boot(CUSTOM);
    restoreAll();
    expect($('settings').querySelector('.custom-count').hidden).toBe(true);
    $('struct-follow').checked = false;
    $('struct-follow').dispatchEvent(new Event('change'));
    expect($('settings').querySelector('.custom-count').hidden).toBe(false);
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');
    $('view-raw').click(); // Data view is kept (Remember my settings is on by default), so it counts too
    expect($('settings').querySelector('.custom-count').textContent).toBe('2');
  });

  it('re-reads like a property change when a property name goes back', async () => {
    const { evalSpy } = await boot({ dataProp: 'myData', defProp: 'myDef' });
    const before = evalSpy.mock.calls.length;
    restoreAll();
    expect(evalSpy.mock.calls.length).toBeGreaterThan(before);
    expect($('settings-data-prop').value).toBe('jsonDataStr');
    expect($('settings-def-prop').value).toBe('jsonDef');
  });

  it('does not re-read when the properties were already the defaults', async () => {
    const { evalSpy } = await boot({ structFollow: false });
    const before = evalSpy.mock.calls.length;
    restoreAll();
    expect(evalSpy.mock.calls.length).toBe(before);
  });

  it('asks inline first: Cancel changes nothing, and window.confirm is never used', async () => {
    await boot(CUSTOM);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    openHelp();
    $('settings-restore').click();
    expect($('settings-restore')).toBeNull();
    expect($('settings-confirm').textContent).toBe('Confirm restore');
    $('settings-cancel').click();
    expect($('settings').querySelector('.custom-count').hidden).toBe(false);
    expect($('settings-restore').textContent).toBe('Restore default settings');
    expect($('settings-data-prop').value).toBe('myData');
    expect(confirm).not.toHaveBeenCalled();
    expect(document.querySelector('.toast')).toBeNull();
  });
});

describe('custom settings list', () => {
  it('says everything is default, and disables the button, when nothing differs', async () => {
    await boot();
    openHelp();
    expect($('settings-body').textContent).toContain('Everything is at its default');
    expect($('settings-restore').disabled).toBe(true);
    expect(document.querySelector('#settings-body table')).toBeNull();
  });

  it('lists label, current and default value, in the order of the panel', async () => {
    await boot({ dataProp: 'myData', structFollow: false });
    $('mask-values').checked = true; fire('mask-values');
    openHelp();
    const rows = [...document.querySelectorAll('#settings-body tr[data-setting]')];
    expect(rows.map((row) => row.dataset.setting)).toEqual(['mask', 'dataProp', 'structFollow']);
    const cells = (row) => [...row.children].map((c) => c.textContent);
    expect(cells(rows[0]).slice(0, 3)).toEqual(['Mask values', 'on', 'off']);
    expect(cells(rows[1]).slice(0, 3)).toEqual(['Data property', 'myData', 'jsonDataStr']);
    expect(cells(rows[2]).slice(0, 3)).toEqual(['Follow current step', 'off', 'on']);
    expect($('settings-restore').disabled).toBe(false);
  });

  it('resets just one setting live, and refreshes the list', async () => {
    await boot({ dataView: 'raw', structFollow: false });
    openHelp();
    document.querySelector('#settings-body tr[data-setting="structFollow"] button').click();
    expect($('struct-follow').checked).toBe(true);
    expect($('view-raw').classList.contains('is-on')).toBe(true);
    // Remember my settings is on by default, so the Data view it keeps is left in the list
    expect([...document.querySelectorAll('#settings-body tr[data-setting]')].map((r) => r.dataset.setting)).toEqual(['dataView']);
  });

  it('resets Auto-refresh from its row', async () => {
    await boot();
    $('live').checked = false; fire('live');
    openHelp();
    document.querySelector('#settings-body tr[data-setting="dataLive"] button').click();
    expect($('live').checked).toBe(true);
    expect($('settings-body').textContent).toContain('Everything is at its default');
  });

  it('does not list an old stored `advanced`, which is no setting any more', async () => {
    await boot({ advanced: true });
    openHelp();
    expect(document.querySelector('#settings-body tr[data-setting="advanced"]')).toBeNull();
    expect($('settings-body').textContent).toContain('Everything is at its default');
    expect($('settings').querySelector('.custom-count').hidden).toBe(true);
  });

  it('lists Time format among the custom settings, and the help names it among the defaults', async () => {
    await boot({ timeFormat: 'human' });
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');
    openHelp();
    expect($('settings-body').textContent).toMatch(/Time format\s*human/);
    $('settings-close').click();
    const { COMMON_HELP } = await import('../../../src/ui/help/common.js');
    const settings = COMMON_HELP[1].find(([title]) => title === 'Settings');
    expect(settings[2].more).toContain('Time format ms');
  });

  it('a restore puts Failed only and Highlight on hover back', async () => {
    await boot({ logErrorsOnly: true, structHover: true });
    restoreAll();
    expect($('log-errors-only').checked).toBe(false);
    expect(viewOn('Highlight on hover')).toBe(false);
  });
});

describe('Custom settings link', () => {
  it('is always shown, with no count at the defaults; counts what differs, and opens Help at the Settings section', async () => {
    await boot();
    expect($('settings').querySelector('.custom-count').hidden).toBe(true);

    $('struct-follow').checked = false; fire('struct-follow');
    expect($('settings').querySelector('.custom-count').hidden).toBe(false);
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');

    $('mask-values').checked = true; fire('mask-values');
    expect($('settings').querySelector('.custom-count').textContent).toBe('2');

    const link = $('settings');
    expect(link.getAttribute('aria-label')).toBe('Settings: 2 settings differ from their defaults');
    expect(link.title).toBe('2 settings differ from their defaults. Open Settings (,)');
    expect(link.querySelector('.custom-count').getAttribute('aria-hidden')).toBe('true');

    link.click();
    expect(document.getElementById('settings-overlay').hidden).toBe(false);
    expect(document.getElementById('help-overlay').hidden).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('#settings-overlay .settings-card'));
  });

  it('counts a property name typed into its field, and goes away after a restore', async () => {
    await boot();
    openHelp();
    $('settings-data-prop').value = 'other'; fire('settings-data-prop');
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');
    restoreAll();
    expect($('settings').querySelector('.custom-count').hidden).toBe(true);
  });

  it('counts a custom setting made before the panel opened', async () => {
    await boot({ showFrameRow: true, showNested: true });
    expect($('settings').querySelector('.custom-count').textContent).toBe('2');
  });
});
