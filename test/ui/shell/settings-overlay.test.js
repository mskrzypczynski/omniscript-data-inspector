'use strict';

/* The settings dialog behind the gear in the top bar: opened by the gear and
 * by the comma key, closed by Esc with the focus given back, a count on the
 * gear while a setting differs, and its sections in order. The help (h) holds
 * none of them. */

import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const press = (target, key, init = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};
const open = () => !$('settings-overlay').hidden;
const helpOpen = () => !$('help-overlay').hidden;
const badge = () => $('settings').querySelector('.custom-count');

async function boot() {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  await import('../../../src/ui/app.js');
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('the gear', () => {
  it('sits right before the ? in the top bar, with a tooltip, a help entry and dialog semantics', async () => {
    await boot();
    const gear = $('settings');
    expect(gear.nextElementSibling).toBe($('help'));
    expect(gear.title).toBe('Settings (,)');
    expect(gear.getAttribute('data-help')).toBe('Settings');
    expect(gear.getAttribute('aria-haspopup')).toBe('dialog');
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    expect(gear.querySelector('svg.ui-icon.ic-gear')).not.toBeNull();
    expect($('custom-settings')).toBeNull();
    const card = document.querySelector('#settings-overlay [role="dialog"]');
    expect(card.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(card.getAttribute('aria-labelledby')).textContent).toBe('Settings');
  });

  it('is always visible and shows a count only while a setting differs', async () => {
    await boot();
    expect($('settings').hidden).toBe(false);
    expect(badge().hidden).toBe(true);

    $('struct-follow').checked = false;
    $('struct-follow').dispatchEvent(new Event('change'));
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe('1');
    expect($('settings').title).toBe('1 setting differs from its default. Open Settings (,)');

    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    expect(badge().textContent).toBe('2');
    expect($('settings').title).toBe('2 settings differ from their defaults. Open Settings (,)');
    expect($('settings').getAttribute('aria-label')).toBe('Settings: 2 settings differ from their defaults');
  });
});

describe('opening and closing', () => {
  it('opens with the gear, closes with Esc and gives the focus back to the gear', async () => {
    await boot();
    $('settings').focus();
    $('settings').click();
    expect(open()).toBe(true);
    expect(helpOpen()).toBe(false);
    expect($('settings').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(document.querySelector('#settings-overlay .settings-card'));

    press(document.activeElement, 'Escape');
    expect(open()).toBe(false);
    expect($('settings').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe($('settings'));
  });

  it('opens and closes with the comma key, and returns the focus to the gear', async () => {
    await boot();
    press(document.body, ',');
    expect(open()).toBe(true);
    press(document.body, ',');
    expect(open()).toBe(false);
    press(document.body, ',');
    press(document.activeElement, 'Escape');
    expect(open()).toBe(false);
    expect(document.activeElement).toBe($('settings'));
  });

  it('gives the focus back to the control that had it when the comma key opened it', async () => {
    await boot();
    $('tab-data').focus();
    press($('tab-data'), ',');
    expect(open()).toBe(true);
    press(document.activeElement, 'Escape');
    expect(document.activeElement).toBe($('tab-data'));
  });

  it('ignores the comma while typing in a field', async () => {
    await boot();
    const filter = $('filter');
    filter.focus();
    press(filter, ',');
    expect(open()).toBe(false);
  });

  it('closes with its close button and with a click on the backdrop', async () => {
    await boot();
    $('settings').click();
    $('settings-close').click();
    expect(open()).toBe(false);
    expect($('settings-close').title).toBe('Close (Esc)');
    $('settings').click();
    $('settings-overlay').click();
    expect(open()).toBe(false);
  });

  it('keeps Tab inside the dialog', async () => {
    await boot();
    $('settings').click();
    const items = Array.from(document.querySelectorAll('#settings-overlay button, #settings-overlay input'))
      .filter((node) => !node.disabled && !node.hidden && node.type !== 'file');
    const last = items[items.length - 1];
    last.focus();
    expect(press(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    expect(press(items[0], 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('swaps with the help: ? from the settings opens the help, and , from the help opens the settings', async () => {
    await boot();
    press(document.body, ',');
    press(document.activeElement, 'h');
    expect(helpOpen()).toBe(true);
    expect(open()).toBe(false);

    press($('help-overlay'), ',');
    expect(open()).toBe(true);
    expect(helpOpen()).toBe(false);
  });

  it('is on the right-click help: Help: Settings opens the help at the Settings entry', async () => {
    await boot();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
    $('settings').dispatchEvent(ev);
    document.querySelector('.ctx-menu .ctx-item').click();
    expect(helpOpen()).toBe(true);
    expect(Array.from(document.querySelectorAll('#help-body dt')).map((dt) => dt.textContent)).toEqual(['Settings']);
    expect($('help-body').textContent).toContain('The top bar gear');
  });
});

describe('what the dialog holds', () => {
  it('lists what differs with a Reset each, and Restore default settings asks first', async () => {
    await boot();
    $('struct-follow').checked = false;
    $('struct-follow').dispatchEvent(new Event('change'));
    $('settings').click();
    const rows = Array.from(document.querySelectorAll('#settings-body tr[data-setting]'));
    expect(rows.map((row) => row.dataset.setting)).toEqual(['structFollow']);
    expect(rows[0].querySelector('button').title).toContain('Put');
    expect($('settings-body').textContent).not.toContain('Everything is at its default');

    $('settings-restore').click();
    expect($('settings-confirm')).not.toBeNull();
    $('settings-confirm').click();
    expect($('struct-follow').checked).toBe(true);
    expect($('settings-body').textContent).toContain('Everything is at its default');
    expect(badge().hidden).toBe(true);
  });

  it('gives every control a tooltip', async () => {
    await boot();
    $('settings').click();
    const missing = Array.from(document.querySelectorAll('#settings-overlay button, #settings-overlay label, #settings-overlay .seg'))
      .filter((node) => !node.title && !node.closest('[title]'));
    expect(missing.map((node) => node.id || node.textContent)).toEqual([]);
  });

  it('is gone from the help, which keeps Start here, the entries, Keys and the foot', async () => {
    await boot();
    $('help').click();
    const body = $('help-body');
    ['settings-text-size', 'remember-settings', 'settings-restore', 'settings-debug-bundle',
      'settings-open-bundle', 'settings-copy-report'].forEach((id) => expect(body.querySelector(`#${id}`)).toBeNull());
    expect(body.querySelector('.help-start')).not.toBeNull();
    expect(body.querySelector('#help-tour')).not.toBeNull();
    expect(body.querySelector('.help-keys')).not.toBeNull();
    expect(body.lastElementChild.className).toBe('help-foot');
  });

  it('lists the comma key among the shortcuts', async () => {
    await boot();
    $('help').click();
    $('help-search').value = 'settings';
    $('help-search').dispatchEvent(new Event('input'));
    const rows = Array.from(document.querySelectorAll('#help-body table.keys tr'));
    expect(rows.some((row) => row.querySelector('kbd').textContent === ',')).toBe(true);
  });
});

describe('in a narrow panel', () => {
  /* CSS-text test: jsdom lays nothing out, so a rule about wrapping can only be
   * checked on the stylesheet. */
  it('lets a switch row wrap under its caption instead of being cut off', () => {
    const css = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'panel.css'), 'utf8');
    const start = css.indexOf('\n.settings-choice {');
    expect(css.slice(start, css.indexOf('}', start))).toContain('flex-wrap: wrap');
  });
});
