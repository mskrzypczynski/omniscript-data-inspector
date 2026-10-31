'use strict';

/* The "This tab" entries of the help follow the order of the controls on
 * screen, with the entries about the rarely used controls last. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const terms = () => [...$('help-body').querySelectorAll('dt')].map((dt) => dt.textContent);
const open = () => { if ($('help-overlay').hidden) $('help').click(); };
const close = () => { if (!$('help-overlay').hidden) $('help-close').click(); };

describe('help order', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  const showTab = (tab) => { close(); $(tab).click(); open(); };

  it('Data: Refresh and Auto-refresh come before the property and Inspect entries', () => {
    showTab('tab-data');
    const list = terms();
    expect(list.indexOf('Refresh')).toBeGreaterThanOrEqual(0);
    expect(list.indexOf('Refresh')).toBeLessThan(list.indexOf('Auto-refresh'));
    expect(list.indexOf('Auto-refresh')).toBeLessThan(list.indexOf('Data property'));
    expect(list.indexOf('Auto-refresh')).toBeLessThan(list.indexOf('Inspect element'));
    expect(list.indexOf('Data property')).toBeGreaterThan(list.indexOf('Left the page'));
  });

  it('Calls: Record, Filter box and the other controls before the Failed only and Time format ones', () => {
    showTab('tab-actions');
    const list = terms();
    expect(list.indexOf('Recording / Paused')).toBeLessThan(list.indexOf('Filter box'));
    expect(list.indexOf('Filter box')).toBeLessThan(list.indexOf('Failed only'));
    expect(list.indexOf('Filter box')).toBeLessThan(list.indexOf('Time format'));
  });

  it('keeps every entry', () => {
    showTab('tab-structure');
    const withOrder = terms().length;
    expect(withOrder).toBeGreaterThan(30);
  });
});
