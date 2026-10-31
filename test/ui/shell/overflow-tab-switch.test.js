'use strict';

/* The "…" button of a toolbar must be there when its tab is shown, however
 * narrow the panel became while another tab was on screen: a hidden tab's
 * controls count as unavailable, so the button was left hidden until the next
 * resize. Driven through the real panel.html. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const moreOf = (view) => document.querySelector(`#${view} .overflow-btn`);
const menuItems = () => Array.from(document.querySelectorAll('.ctx-menu .ctx-item')).map((item) => item.textContent);

let overflow;

beforeEach(async () => {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  await import('../../../src/ui/app.js');
  overflow = await import('../../../src/ui/toolbar-overflow.js');
});

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  document.body.innerHTML = '';
  document.body.className = '';
  delete global.chrome;
});

describe('overflow menu when a tab is shown', () => {
  it('has its … button on the tab that was hidden when the panel became narrow', async () => {
    overflow.applyWidth(480);
    await flush();
    expect(moreOf('view-data').hidden).toBe(false);
    expect(moreOf('view-structure')).toBeNull();

    $('tab-data').click();
    await flush();
    expect(moreOf('view-data').hidden).toBe(false);
    moreOf('view-data').click();
    expect(menuItems()).toEqual(expect.arrayContaining(['Expand all', 'Collapse all']));
  });
});
