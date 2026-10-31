'use strict';

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

/* The panel in Firefox: the same code with Firefox's DevTools, which runs an
 * expression in the top document only (no frameURL, no getResources) and
 * names its light theme 'light'. Firefox is told apart by
 * browser.runtime.getBrowserInfo, which Chromium does not have. */

const $ = (id) => document.getElementById(id);

async function bootFirefox({ theme = 'light' } = {}) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  const calls = [];
  const eval_ = global.chrome.devtools.inspectedWindow.eval;
  global.chrome.devtools.inspectedWindow.eval = (expression, ...rest) => {
    if (rest.length > 1) throw new Error('Firefox does not support the options of eval');
    calls.push(expression);
    return eval_(expression, ...rest);
  };
  delete global.chrome.devtools.inspectedWindow.getResources;
  const themeListeners = [];
  global.chrome.devtools.panels = { themeName: theme, onThemeChanged: { addListener: (fn) => themeListeners.push(fn) } };
  global.browser = { runtime: { getBrowserInfo: () => Promise.resolve({ name: 'Firefox' }) } };
  await import('../../../src/ui/app.js');
  return { calls, themeListeners };
}

afterEach(() => { delete global.browser; });

describe('the panel in Firefox', () => {
  it('boots without eval options or getResources and reads the top document', async () => {
    const { calls } = await bootFirefox();
    const { Page } = await import('../../../src/ui/page.js');
    expect(Page.browser).toBe('firefox');
    expect(Page.can).toMatchObject({ frames: false, resources: false });
    expect(calls.length).toBeGreaterThan(0);
  });

  it('has no Frame picker', async () => {
    await bootFirefox();
    expect($('frame').closest('label').hidden).toBe(true);
    expect($('show-nested').closest('label').hidden).not.toBe(true);
  });

  it('follows Firefox\'s light and dark themes', async () => {
    const { themeListeners } = await bootFirefox({ theme: 'light' });
    expect(document.documentElement.dataset.theme).toBe('light');
    themeListeners.forEach((listener) => listener('dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('the panel in Chromium', () => {
  it('keeps the Frame picker', async () => {
    jest.resetModules();
    mountPanelMarkup();
    stubChromeDevtools();
    await import('../../../src/ui/app.js');
    const { Page } = await import('../../../src/ui/page.js');
    expect(Page.browser).toBe('chromium');
    expect($('frame').closest('label').hidden).not.toBe(true);
  });
});
