'use strict';

/* The help: Start here first, the keys next, long entries folded behind
 * "more", and the filter still reaching the folded text. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const body = () => $('help-body');
const type = (text) => {
  $('help-search').value = text;
  $('help-search').dispatchEvent(new Event('input', { bubbles: true }));
};
const open = () => { if ($('help-overlay').hidden) $('help').click(); };
const close = () => { if (!$('help-overlay').hidden) $('help-close').click(); };

describe('help layout', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  beforeEach(() => { close(); $('tab-data').click(); open(); });

  it('puts the keys right after Start here, folded, and not again at the end', () => {
    const headings = [...body().querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual(['What do you want to do?', 'Start here', 'Keys', 'This tab']);
    expect(body().querySelectorAll('table.keys')).toHaveLength(1);
    const keys = body().querySelector('table.keys');
    expect(keys.compareDocumentPosition(body().querySelector('dl')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const terms = [...body().querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).not.toContain('Keyboard');
  });

  describe('the Keys section', () => {
    const toggle = () => $('help-keys-toggle');
    const table = () => $('help-keys-body');

    it('is closed at first and opens and closes from its heading', () => {
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(table().hidden).toBe(true);
      toggle().click();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(table().hidden).toBe(false);
      expect(toggle().getAttribute('aria-controls')).toBe('help-keys-body');
      toggle().click();
      expect(table().hidden).toBe(true);
    });

    it('stays as it was left while the panel is open, and shows whole while searching', () => {
      toggle().click();
      close();
      open();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(table().hidden).toBe(false);
      toggle().click(); // closed again for the next test
      type('focus mode');
      expect(body().querySelector('#help-keys-toggle')).toBeNull();
      expect(body().querySelector('table.keys')).not.toBeNull();
      type('');
      expect(table().hidden).toBe(true);
    });
  });

  it('writes the Settings and No OmniScript found entries as a lead and short bullet lines', () => {
    [['Settings', 4], ['No OmniScript found', 3]].forEach(([name, lines]) => {
      const dd = [...body().querySelectorAll('dt')].find((dt) => dt.textContent === name).nextElementSibling;
      expect(dd.querySelectorAll('ul.help-list > li').length).toBeGreaterThanOrEqual(lines);
      dd.querySelectorAll('li').forEach((li) => expect(li.textContent.startsWith('-')).toBe(false));
    });
  });

  it('gives the card a scroll cue once the body is scrolled', () => {
    const card = document.querySelector('.help-card');
    expect(card.classList.contains('is-scrolled')).toBe(false);
    card.scrollTop = 40;
    card.dispatchEvent(new Event('scroll'));
    expect(card.classList.contains('is-scrolled')).toBe(true);
    card.scrollTop = 0;
    card.dispatchEvent(new Event('scroll'));
    expect(card.classList.contains('is-scrolled')).toBe(false);
  });

  it('shows a Data entry as its one line, with how opening the text in place', () => {
    const entry = [...body().querySelectorAll('dd.help-layered')][0];
    expect(entry).toBeDefined();
    const toggle = entry.querySelector('.help-more');
    const text = entry.querySelector('.help-body-text');
    expect(text.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toBe('how');
    toggle.click();
    expect(text.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('less');
    toggle.click();
    expect(text.hidden).toBe(true);
  });

  it('links to the website only for an entry that has details', () => {
    const dd = (title) => [...body().querySelectorAll('dt')].find((dt) => dt.textContent === title).nextElementSibling;
    expect(dd('Left the page').querySelector('.help-site')).toBeNull();
    expect(dd('Refresh').querySelector('.help-site')).not.toBeNull();
  });

  it('keeps every word reachable: the one line and the text are both in the page', () => {
    const entry = [...body().querySelectorAll('dd')].find((dd) => dd.textContent.includes('Show the page\'s own text'));
    expect(entry.textContent).toContain('JavaScript puts keys like 10 and 2 first');
  });

  it('searches the details too, and shows the matching entry with its text open', () => {
    type('rounds integers above');
    const dd = body().querySelector('dd');
    expect(dd).not.toBeNull();
    expect(dd.querySelector('.help-body-text').hidden).toBe(false);
    expect(dd.textContent).toContain('JavaScript puts keys like 10 and 2 first');
    expect(body().querySelector('.help-start')).toBeNull();
  });
});
