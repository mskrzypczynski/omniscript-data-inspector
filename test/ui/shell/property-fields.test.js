'use strict';

/* Data property and Definition property are in Settings, under Reading. The
 * top bar's second row keeps Frame, Embedded scripts and Inspect element.
 * While a name differs from the default the Settings gear shows a count, so a
 * changed name is never hidden without a sign. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

async function boot(initial) {
  jest.resetModules();
  await seedSettings(initial);
  stubChromeDevtools();
  const evalSpy = jest.fn(global.chrome.devtools.inspectedWindow.eval);
  global.chrome.devtools.inspectedWindow.eval = evalSpy;
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  return { evalSpy };
}

function commit(id, value) {
  $(id).value = value;
  $(id).dispatchEvent(new Event('change'));
}

describe('property fields in Settings', () => {
  it('are gone from the top bar, whose second row keeps Frame, Embedded scripts and Inspect element', async () => {
    await boot();
    const row = document.querySelector('.scope-extra');
    expect(row.classList.contains('adv')).toBe(false);
    ['frame', 'show-nested', 'select'].forEach((id) => expect(row.contains($(id))).toBe(true));
    expect($('prop')).toBeNull();
    expect($('struct-prop')).toBeNull();
    expect(row.textContent).not.toContain('property');
  });

  it('are a Reading section before Structure and Calls, with the old tooltips and help names', async () => {
    await boot();
    $('settings').click();
    const headings = [...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent);
    expect(headings.indexOf('Reading')).toBeLessThan(headings.indexOf('Calls'));
    expect($('settings-data-prop').value).toBe('jsonDataStr');
    expect($('settings-def-prop').value).toBe('jsonDef');
    expect($('settings-data-prop').title).toContain('default jsonDataStr');
    expect($('settings-def-prop').title).toContain('default jsonDef');
    expect($('settings-data-prop').closest('label').textContent).toContain('Data property');
    expect($('settings-def-prop').closest('label').textContent).toContain('Definition property');
    expect($('settings-data-prop').closest('label').getAttribute('data-help')).toBe('Data property');
    expect($('settings-def-prop').closest('label').getAttribute('data-help')).toBe('Definition property');
  });

  it('commit the property, keep it in Settings and rescan with it', async () => {
    const { evalSpy } = await boot();
    $('settings').click();
    const before = evalSpy.mock.calls.length;
    commit('settings-data-prop', 'myData');
    commit('settings-def-prop', 'myDef');
    const { Settings } = await import('../../../src/ui/settings.js');
    const { Targets } = await import('../../../src/ui/targets.js');
    expect(Settings.current()).toEqual(expect.objectContaining({ dataProp: 'myData', defProp: 'myDef' }));
    expect(Targets.props()).toEqual({ data: 'myData', def: 'myDef' });
    expect(evalSpy.mock.calls.length).toBeGreaterThan(before);
    expect(evalSpy.mock.calls.some(([expression]) => String(expression).includes('"myData"'))).toBe(true);
  });

  it('keep the focus in the field while the dialog draws the parts that quote it', async () => {
    await boot();
    $('settings').click();
    $('settings-data-prop').focus();
    commit('settings-data-prop', 'myData');
    expect(document.activeElement).toBe($('settings-data-prop'));
    expect(document.querySelector('#settings-body [data-setting="dataProp"]')).not.toBeNull();
  });

  it('start the Data and Structure tabs with the kept names though the dialog was never opened', async () => {
    const { evalSpy } = await boot({ dataProp: 'myData', defProp: 'myDef' });
    const { Targets } = await import('../../../src/ui/targets.js');
    expect(Targets.props()).toEqual({ data: 'myData', def: 'myDef' });
    expect(evalSpy.mock.calls.some(([expression]) => String(expression).includes('"myData"') && String(expression).includes('"myDef"'))).toBe(true);
    $('settings').click();
    expect($('settings-data-prop').value).toBe('myData');
    expect($('settings-def-prop').value).toBe('myDef');
  });

  it('are kept when an old stored `advanced` value comes with them', async () => {
    await boot({ advanced: true, dataProp: 'myData', defProp: 'myDef' });
    expect($('advanced')).toBeNull();
    $('settings').click();
    expect($('settings-data-prop').value).toBe('myData');
    expect($('settings-def-prop').value).toBe('myDef');
  });

  it('make the Settings gear count while one is not the default, and clear at the default', async () => {
    await boot();
    const badge = () => $('settings').querySelector('.custom-count');
    expect(badge().hidden).toBe(true);
    expect($('settings').title).toBe('Settings (,)');
    $('settings').click();
    commit('settings-data-prop', 'other');
    expect(badge().hidden).toBe(false);
    expect($('settings').getAttribute('aria-label')).toBe('Settings: 1 setting differs from its default');
    expect($('settings').title).toBe('1 setting differs from its default. Open Settings (,)');
    commit('settings-data-prop', '  jsonDataStr ');
    expect(badge().hidden).toBe(true);
    commit('settings-def-prop', 'other');
    expect(badge().hidden).toBe(false);
    commit('settings-def-prop', '');
    expect($('settings-def-prop').value).toBe('jsonDef');
    expect(badge().hidden).toBe(true);
  });

  it('are listed under Settings that differ with their own names, and Reset puts one back', async () => {
    await boot({ dataProp: 'myData' });
    $('settings').click();
    const row = document.querySelector('#settings-body [data-setting="dataProp"]');
    expect(row.querySelector('th').textContent).toBe('Data property');
    row.querySelector('button').click();
    expect($('settings-data-prop').value).toBe('jsonDataStr');
    const { Targets } = await import('../../../src/ui/targets.js');
    expect(Targets.props().data).toBe('jsonDataStr');
  });
});

describe('the empty notice of the tabs', () => {
  it('is one line on the Data tab, whose More help opens the No OmniScript found entry (test/ui/data/data-empty-state.test.js)', async () => {
    await boot();
    $('rescan').click();
    expect($('viewport').querySelector('.data-empty')).not.toBeNull();
    expect($('viewport').querySelector('#change-data-property')).toBeNull();
  });

  it('is one line on the Structure tab, with a Rescan button and a link to the help', async () => {
    await boot();
    $('tab-structure').click();
    const list = $('struct-list');
    expect(list.textContent).toContain('No OmniScript found');
    expect(list.querySelector('.struct-empty').title).toContain('jsonDef');
    expect(list.querySelector('#struct-empty-rescan')).not.toBeNull();
    expect(list.querySelector('#struct-empty-help').textContent).toBe('More help');
  });
});
