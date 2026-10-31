'use strict';

/* The help at three depths: a layered entry shows its short line, opens its
 * text with "how" and links the details on the website; the control's tooltip
 * is the same short line; "What do you want to do?" folds open to steps and
 * a guide link. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const body = () => $('help-body');
const type = (text) => {
  $('help-search').value = text;
  $('help-search').dispatchEvent(new Event('input', { bubbles: true }));
};
const open = () => { if ($('help-overlay').hidden) $('help').click(); };
const close = () => { if (!$('help-overlay').hidden) $('help-close').click(); };
const ddOf = (title) => {
  const dt = [...body().querySelectorAll('dt')].find((node) => node.textContent === title);
  return dt ? dt.nextElementSibling : null;
};

describe('layered help', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  beforeEach(() => { close(); $('tab-data').click(); open(); });

  it('takes the control tooltip from the entry short line', () => {
    expect($('rescan').title).toBe('Look for OmniScripts and frames on the page again.');
  });

  it('shows the short line, keeps the text folded behind how, and links the details', () => {
    const dd = ddOf('Rescan');
    expect(dd.querySelector('.help-short').textContent).toMatch(/^Look for OmniScripts and frames on the page again\./);
    const text = dd.querySelector('.help-body-text');
    expect(text.hidden).toBe(true);
    const how = dd.querySelector('.help-more');
    expect(how.textContent).toBe('how');
    how.click();
    expect(text.hidden).toBe(false);
    expect(how.getAttribute('aria-expanded')).toBe('true');
    const link = text.querySelector('a.help-site');
    expect(link.href).toBe('https://mskrzypczynski.github.io/omniscript-data-inspector/reference.html#everywhere-rescan');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');
  });

  it('opens the text at once when the help is filtered, and finds words only the details hold', () => {
    type('every few seconds');
    const dd = ddOf('Rescan');
    expect(dd).not.toBeNull();
    expect(dd.querySelector('.help-body-text').hidden).toBe(false);
  });

  it('lists the questions with steps and a guide link, before Start here', () => {
    const tasks = body().querySelector('.help-tasks');
    expect(tasks.querySelector('h3').textContent).toBe('What do you want to do?');
    const first = tasks.querySelector('details');
    expect(first.querySelector('summary').textContent).toBe('Why is this field hidden?');
    expect(first.querySelectorAll('li').length).toBeGreaterThan(1);
    expect(first.querySelector('a.help-site').href).toBe('https://mskrzypczynski.github.io/omniscript-data-inspector/guides/why-is-this-field-hidden.html');
    expect(tasks.compareDocumentPosition(body().querySelector('.help-start')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the questions out while the help is filtered', () => {
    type('rescan');
    expect(body().querySelector('.help-tasks')).toBeNull();
  });
});

describe('tooltips of shared titles', () => {
  it('reads the entry of the tab a control is on', () => {
    const dataRefresh = document.getElementById('refresh');
    const structRefresh = document.getElementById('struct-refresh');
    expect(dataRefresh.title).not.toBe('');
    expect(structRefresh.title).not.toBe(dataRefresh.title);
  });

  it('keeps a title a control names for itself', () => {
    expect(document.getElementById('struct-expand').title).toBe('Open every section of the list');
    expect(document.getElementById('struct-collapse').title).toBe('Fold the list to the top level');
  });

  it('ends a tooltip with its keys without a full stop before them', () => {
    expect(document.getElementById('struct-filter').title).toMatch(/[^.] \(\/\)$/);
  });
});
