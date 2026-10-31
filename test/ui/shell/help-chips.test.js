'use strict';

/* A control named in the help is drawn as a chip: a small button-like word,
 * never as the [[mark]] it is written with, and never as something to click. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const body = () => document.getElementById('help-body');
const type = (text) => {
  const box = document.getElementById('help-search');
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('control names in the help', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  beforeEach(() => {
    if (!document.getElementById('help-overlay').hidden) document.getElementById('help-close').click();
    document.getElementById('help').click();
  });

  it('draws the names in Start here and in the entries as chips, with no mark left showing', () => {
    type('');
    expect(body().querySelector('.help-start .ctl-chip')).not.toBeNull();
    expect(body().textContent).not.toContain('[[');
    expect(body().textContent).not.toContain(']]');
  });

  it('draws a chip as plain text for the eye: not a button, not focusable', () => {
    const chip = body().querySelector('.ctl-chip');
    expect(chip.tagName).toBe('SPAN');
    expect(chip.hasAttribute('tabindex')).toBe(false);
    expect(chip.closest('button')).toBeNull();
  });

  it('still finds an entry by the name inside a mark', () => {
    type('rescan');
    const terms = [...body().querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toContain('No OmniScript found');
  });

  it('is styled like a button, from the theme tokens, in the panel stylesheet', () => {
    const css = readFileSync(fileURLToPath(new URL('../../../panel.css', import.meta.url)), 'utf8');
    const rule = /\.ctl-chip\s*\{([^}]*)\}/.exec(css)[1];
    expect(rule).toContain('border: 1px solid var(--line)');
    expect(rule).toContain('border-radius: 3px');
    expect(rule).toContain('background: var(--bg-alt)');
    expect(rule).toContain('color: var(--fg)');
    expect(rule).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
