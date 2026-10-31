'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* The status bar's right end (version, Buy me a coffee), its
 * tooltips for text that gets cut, and one fixed height on every tab. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const css = readFileSync('panel.css', 'utf8');

async function boot({ version, free = false } = {}) {
  jest.resetModules();
  stubChromeDevtools();
  if (version) global.chrome.runtime = { getManifest: () => ({ version }) };
  mountPanelMarkup({ free });
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
}

describe('status bar, right end', () => {
  it('shows the version from the manifest', async () => {
    await boot({ version: '1.6.0' });
    expect($('status-version').textContent).toBe('v1.6.0');
    expect($('status-version').hidden).toBe(false);
  });

  it('leaves the version out where the manifest cannot be read', async () => {
    await boot();
    expect($('status-version').textContent).toBe('');
    expect($('status-version').hidden).toBe(true);
  });

  it('tells every platform how to open DevTools and links the guide in the popup', () => {
    const popup = readFileSync('popup.html', 'utf8');
    expect(popup).toContain('<kbd>F12</kbd>');
    expect(popup).toContain('<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>I</kbd>');
    expect(popup).toContain('<kbd>⌥</kbd><kbd>⌘</kbd><kbd>I</kbd>');
    expect(popup).toContain('Firefox');
    expect(popup).toMatch(/href="https:\/\/mskrzypczynski\.github\.io\/omniscript-data-inspector\/guides\/get-started\.html" target="_blank" rel="noopener"/);
    expect(popup).toContain('Unofficial · not affiliated with Salesforce');
  });

  it('keeps the unofficial note out of the status bar', async () => {
    await boot({ version: '1.6.0' });
    expect(document.querySelector('.status .disclaimer')).toBeNull();
  });

  it('keeps the coffee icon out of the screen-reader text and the words for narrow panels to drop', async () => {
    await boot({ free: true });
    expect($('status-coffee').querySelector('[aria-hidden="true"]').textContent).toBe('☕');
    expect($('status-coffee').querySelector('.status-coffee-text').textContent.trim()).toBe('Buy me a coffee');
    expect(css).toMatch(/@media \(max-width: 620px\)\s*\{[^}]*\.status-coffee-text/);
  });
});

describe('status bar, text that does not fit', () => {
  it('cuts both sides with an ellipsis and has one fixed height', () => {
    expect(css).toMatch(/#status-left, #status-right\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.status\s*\{[^}]*\bheight:\s*24px/);
  });

  it('carries the full text of each side as its tooltip', async () => {
    await boot();
    const { StatusLine } = await import('../../../src/ui/status-line.js');
    StatusLine.set('3 calls of 40 captured', 'Recording · filters: all Apex calls');
    expect($('status-left').title).toBe('3 calls of 40 captured');
    expect($('status-right').title).toBe('Recording · filters: all Apex calls');
    StatusLine.left('2 calls');
    expect($('status-left').title).toBe('2 calls');
  });

  it('adds a tab\'s own note to the left tooltip, and drops it again', async () => {
    await boot();
    const { StatusLine } = await import('../../../src/ui/status-line.js');
    StatusLine.set('1 OmniScript', '');
    StatusLine.title('2,000 rows, drawn a window at a time');
    expect($('status-left').title).toBe('1 OmniScript\n2,000 rows, drawn a window at a time');
    StatusLine.title('');
    expect($('status-left').title).toBe('1 OmniScript');
  });
});

describe('the status of the Data tab while nothing is found', () => {
  it('does not say Live', async () => {
    await boot();
    const text = $('status-right').textContent;
    expect(text).not.toContain('Live');
    expect(text).toContain('Waiting for an OmniScript');
  });
});
