'use strict';

/* While Mask values is on, the status bar says so in a neutral chip (info
 * colour, not red), and the box reads Mask in a narrow bar. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

beforeAll(async () => {
  jest.resetModules();
  stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
});

describe('the Masking chip', () => {
  it('is hidden at first, shows while Mask values is on and goes with it', () => {
    const chip = $('status-mask');
    expect(chip.hidden).toBe(true);
    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe('Masking copies and exports');
    expect(chip.classList.contains('tag-info')).toBe(true);
    expect(chip.classList.contains('tag-error')).toBe(false);
    expect(chip.title).toContain('Mask values is on');
    $('mask-values').checked = false;
    $('mask-values').dispatchEvent(new Event('change'));
    expect(chip.hidden).toBe(true);
  });

  it('goes when the settings are restored', () => {
    $('mask-values').checked = true;
    $('mask-values').dispatchEvent(new Event('change'));
    $('settings').click();
    $('settings-restore').click();
    $('settings-confirm').click();
    expect($('mask-values').checked).toBe(false);
    expect($('status-mask').hidden).toBe(true);
  });
});

describe('the Mask label', () => {
  it('is not drawn in the error colour while masking is on', () => {
    const css = readFileSync('panel.css', 'utf8');
    const rule = css.slice(css.indexOf('.mask-switch.is-on {'), css.indexOf('}', css.indexOf('.mask-switch.is-on {')));
    expect(rule).toContain('--info-fg');
    expect(rule).not.toContain('--err-fg');
  });
});
