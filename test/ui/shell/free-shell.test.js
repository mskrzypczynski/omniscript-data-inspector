'use strict';

/* The Free build of the shell: booted through src/ui/app.js with the Free
 * markup of panel.html and no gate registered. Compare JSON and debug
 * bundles are not there, nor are the Settings rows of a gated feature of
 * another tab. What is Free still works. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

let Features;

async function boot({ free = false } = {}) {
  jest.resetModules();
  mountPanelMarkup({ free });
  stubChromeDevtools();
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
  Features = (await import('../../../src/ui/features.js')).Features;
}

const helpTitles = () => [...document.querySelectorAll('#help-body dt')].map((dt) => dt.textContent);
const openHelp = () => { if ($('help-overlay').hidden) $('help').click(); };
const press = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('the Free shell', () => {
  beforeEach(() => boot({ free: true }));

  it('registers no gate', () => {
    expect(Features.registered()).toEqual([]);
  });

  it('shell.compare-json: no button, no dialog, and the chord does nothing', () => {
    expect($('compare-json')).toBeNull();
    expect($('compare-json-overlay')).toBeNull();
    press(document.body, 'L', { ctrlKey: true, shiftKey: true });
    press(document.body, 'l', { metaKey: true, shiftKey: true });
    expect($('compare-json-overlay')).toBeNull();
    $('settings').click();
    expect($('settings-compare-json')).toBeNull();
  });

  it('shell.bundle: no session bar, and no Save a debug bundle or Open bundle…', () => {
    expect($('session-bar')).toBeNull();
    $('settings').click();
    expect($('settings-debug-bundle')).toBeNull();
    expect($('settings-open-bundle')).toBeNull();
    expect($('settings-bundle-file')).toBeNull();
  });

  it('keeps out the Settings rows that only serve a gated feature of another tab', () => {
    $('settings').click();
    expect($('settings-allow-test-calls')).toBeNull(); // calls.test
    expect($('settings-slow-ms')).toBeNull(); // calls.analysis
    expect(document.body.textContent).not.toContain('Allow test calls');
  });

  it('keeps the Free settings and Copy report', () => {
    $('settings').click();
    ['settings-clear-on-reload', 'settings-time-format', 'settings-frame-row', 'settings-refresh-rate', 'settings-designer',
      'settings-mask-at-start', 'remember-settings', 'settings-copy-report', 'settings-restore'].forEach((id) => {
      expect($(id)).not.toBeNull();
    });
    expect($('settings-copy-report').title).not.toBe('');
  });

  it('hides the help entries and the shortcut line of the gated shell features', () => {
    openHelp();
    const titles = helpTitles();
    ['Debug bundle', 'Open bundle', 'Compare JSON'].forEach((title) => expect(titles).not.toContain(title));
    ['Settings', 'Copy report', 'Theme'].forEach((title) => expect(titles).toContain(title));
    const keys = [...document.querySelectorAll('#help-body table.keys tr')].map((tr) => tr.textContent);
    expect(keys.some((text) => text.includes('Compare JSON'))).toBe(false);
  });

  it('adds no line at the end of Settings or of Start here', () => {
    $('settings').click();
    expect(document.querySelector('.settings-pointer')).toBeNull();
    openHelp();
    expect(document.querySelector('.help-pointer')).toBeNull();
    const last = document.querySelector('#help-body .help-start ol').lastElementChild;
    expect(last.textContent).not.toMatch(/https?:/);
  });

  it('opens the one coffee address from the status bar without a menu, and keeps it in the help foot', () => {
    expect($('status-coffee')).not.toBeNull();
    const opened = [];
    window.open = (...args) => { opened.push(args); return null; };
    $('status-coffee').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 900, clientY: 780, detail: 1 }));
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(opened).toEqual([['https://buycoffee.to/mskrz', '_blank', 'noopener']]);
    openHelp();
    const foot = [...document.querySelectorAll('.help-foot .help-coffee a')].map((a) => a.href);
    expect(foot).toEqual(['https://buycoffee.to/mskrz']);
  });

  it('does not point to debug bundles, which the Free build has none of', () => {
    $('tab-actions').click();
    const notes = document.querySelector('#log-notes').textContent;
    expect(notes).toContain('No calls captured yet');
    expect(notes).not.toContain('debug bundle');
  });

  it('still does what is Free: the gear opens Settings, a setting changes, h opens the help, 2 switches tab', () => {
    $('settings').click();
    expect($('settings-overlay').hidden).toBe(false);
    $('settings-refresh-rate').querySelector('[data-seg="settings-refresh-rate:fast"]').click();
    expect($('settings-refresh-rate').querySelector('.is-on').textContent).toBe('Fast');
    $('settings-close').click();
    press(document.body, 'h');
    expect($('help-overlay').hidden).toBe(false);
    $('help-close').click();
    press(document.body, '2');
    expect($('view-structure').hidden).toBe(false);
  });
});

describe('the coffee texts of the Free build', () => {
  beforeEach(() => boot({ free: true }));

  it('name no other site, no currency and no payment method', () => {
    openHelp();
    const shown = [document.getElementById('status-coffee').title, document.getElementById('help-body').textContent].join('\n');
    expect(shown).toContain('buycoffee.to');
    expect(shown).not.toMatch(/ko-fi|\bPLN\b|\bEUR\b|BLIK|by card|PayPal/i);
  });
});
