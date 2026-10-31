'use strict';

/* The search box at the top of the help (h). */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const press = (key, target = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const search = () => document.getElementById('help-search');
const overlay = () => document.getElementById('help-overlay');
const type = (text) => {
  search().value = text;
  search().dispatchEvent(new Event('input', { bubbles: true }));
};
const headings = () => Array.from(document.querySelectorAll('#help-body h3')).map((h) => h.textContent);

describe('help filter', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  beforeEach(() => {
    if (!overlay().hidden) document.getElementById('help-close').click();
    document.getElementById('help').click();
  });

  it('focuses the search box when the help opens', () => {
    expect(overlay().hidden).toBe(false);
    expect(document.activeElement).toBe(search());
  });

  it('narrows entries across sections to those containing every word', () => {
    const before = document.querySelectorAll('#help-body dt').length;
    type('MASK values');
    const terms = Array.from(document.querySelectorAll('#help-body dt')).map((dt) => dt.textContent);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.length).toBeLessThan(before);
    expect(terms).toContain('Mask values');
  });

  it('hides sections left empty, Start here and the footer while filtering', () => {
    type('Raw search');
    expect(headings()).toEqual(['This tab']);
    expect(document.querySelector('#help-body .help-start')).toBeNull();
    expect(document.querySelector('#help-body .help-foot')).toBeNull();
  });

  it('filters the keyboard table rows too', () => {
    type('previous');
    const rows = Array.from(document.querySelectorAll('#help-body table.keys tr'));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => expect(row.textContent.toLowerCase()).toContain('previous'));
  });

  it('says so when nothing matches, and restores everything when cleared', () => {
    type('zzzqqq');
    expect(document.querySelector('#help-body .help-empty').textContent).toBe('No help matches');
    expect(document.querySelectorAll('#help-body dt')).toHaveLength(0);
    type('');
    expect(document.querySelector('#help-body .help-empty')).toBeNull();
    expect(document.querySelectorAll('#help-body dt').length).toBeGreaterThan(10);
  });

  it('starts empty each time the help opens', () => {
    type('mask');
    document.getElementById('help-close').click();
    document.getElementById('help').click();
    expect(search().value).toBe('');
  });

  it('does not trigger the single-key shortcuts while typing, and Escape still closes', () => {
    const tab = () => document.getElementById('tab-structure').getAttribute('aria-selected');
    const before = tab();
    press('2', search());
    press('h', search());
    expect(tab()).toBe(before);
    expect(overlay().hidden).toBe(false);
    press('Escape', search());
    expect(overlay().hidden).toBe(true);
  });
});
