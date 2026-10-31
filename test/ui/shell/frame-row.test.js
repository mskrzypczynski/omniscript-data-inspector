'use strict';

/* Settings, Reading, Show the Frame row: the top bar's second row (Frame,
 * Embedded scripts and Inspect element) shows when the setting is on, and not
 * otherwise. The rules of panel.css that decide it are put in the page, so
 * what is visible is what the stylesheet says. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const sheet = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
/* The rules that decide what the second row shows, taken from panel.css as written
 * (jsdom does not read the whole sheet reliably). */
const css = [...sheet.matchAll(/^body[^{\n]*(?:\.adv|\.scope-extra)[^{\n]*\{[^}]*\}/gm)].map((match) => match[0]).join('\n');

async function boot(initial) {
  jest.resetModules();
  await seedSettings(initial);
  stubChromeDevtools();
  mountPanelMarkup();
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  await import('../../../src/ui/app.js');
}

afterEach(() => { document.head.innerHTML = ''; });

const shown = (id) => {
  for (let node = $(id); node; node = node.parentElement) {
    if (node.hidden || getComputedStyle(node).display === 'none') return false;
  }
  return true;
};

describe('Show the Frame row', () => {
  it('hides Frame, Embedded scripts and Inspect element with the setting off', async () => {
    await boot();
    expect(shown('frame')).toBe(false);
    expect(shown('show-nested')).toBe(false);
    expect(shown('select')).toBe(false);
  });

  it('shows the whole row, Inspect element included, with the setting on', async () => {
    await boot({ showFrameRow: true });
    ['frame', 'show-nested', 'select'].forEach((id) => expect(shown(id)).toBe(true));
  });

  it('shows the row as soon as the setting is ticked', async () => {
    await boot();
    ['frame', 'show-nested', 'select'].forEach((id) => expect(shown(id)).toBe(false));
    $('settings').click();
    $('settings-frame-row').click();
    ['frame', 'show-nested', 'select'].forEach((id) => expect(shown(id)).toBe(true));
  });

  it('is a checkbox in the Reading another page fold of Data with a tooltip that follows at once, and is listed under Settings that differ', async () => {
    await boot();
    $('settings').click();
    const box = $('settings-frame-row');
    expect(box.closest('label').title).toContain('Frame, Embedded scripts');
    expect([...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent)).toContain('Data');
    expect(box.closest('details#settings-reading')).not.toBeNull();
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(shown('frame')).toBe(true);
    const row = document.querySelector('#settings-body [data-setting="showFrameRow"]');
    expect(row.querySelector('th').textContent).toBe('Show the Frame row');
    expect($('settings').querySelector('.custom-count').textContent).toBe('1');

    row.querySelector('button').click(); // Reset
    expect(shown('frame')).toBe(false);
    expect($('settings-frame-row').checked).toBe(false);
  });

  it('is kept with Remember my settings like the rest, and put back by Restore default settings', async () => {
    const { rememberedToWrite } = await import('../../../src/core/shared/remembered-settings.js');
    const { DEFAULTS } = await import('../../../src/ui/settings.js');
    expect(DEFAULTS.showFrameRow).toBe(false);
    expect(css).toContain('.has-frame-row');
    expect(rememberedToWrite({ rememberSettings: true, showFrameRow: true }, DEFAULTS, {})).toMatchObject({ showFrameRow: true });

    await boot({ showFrameRow: true });
    $('settings').click();
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(shown('frame')).toBe(false);
  });
});

describe('Embedded scripts and Frame follow the row', () => {
  const tick = (id) => { $(id).checked = true; $(id).dispatchEvent(new Event('change')); };
  const addFrame = () => {
    const option = document.createElement('option');
    option.value = 'https://x.example/frame';
    option.textContent = 'frame';
    $('frame').appendChild(option);
  };

  it('puts a remembered Embedded scripts in force when the row shows', async () => {
    await boot({ showFrameRow: true, showNested: true });
    expect($('show-nested').checked).toBe(true);
  });

  it('does not put a remembered Embedded scripts in force while the row is hidden', async () => {
    await boot({ showNested: true });
    expect(shown('show-nested')).toBe(false);
    expect($('show-nested').checked).toBe(false);
  });

  it('keeps Embedded scripts and Frame while the row shows, whatever tab is opened', async () => {
    await boot({ showFrameRow: true });
    addFrame();
    tick('show-nested');
    $('frame').value = 'https://x.example/frame';
    $('frame').dispatchEvent(new Event('change'));
    $('tab-structure').click();
    $('tab-data').click();
    expect($('show-nested').checked).toBe(true);
    expect($('frame').value).toBe('https://x.example/frame');
  });

  it('puts both back to off / All frames when the row is hidden again', async () => {
    await boot({ showFrameRow: true });
    addFrame();
    tick('show-nested');
    $('frame').value = 'https://x.example/frame';
    $('frame').dispatchEvent(new Event('change'));
    $('settings').click();
    $('settings-frame-row').click(); // off
    expect(shown('show-nested')).toBe(false);
    expect($('show-nested').checked).toBe(false);
    expect($('frame').value).toBe('');
  });
});
