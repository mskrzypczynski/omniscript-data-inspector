'use strict';

/* Narrow panels hide the tab names visually, so each tab must keep its name
 * for assistive technology and a tooltip with the full name. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

beforeAll(() => {
  stubChromeDevtools();
  mountPanelMarkup();
});

describe('tab names in a narrow panel', () => {
  const NAMES = { data: 'Data', structure: 'Structure', actions: 'Calls' };

  it.each(Object.entries(NAMES))('%s keeps a text label and a title', (id, name) => {
    const tab = document.getElementById(`tab-${id}`);
    expect(tab.querySelector('.tab-label').textContent).toBe(name);
    expect(tab.getAttribute('title').startsWith(name)).toBe(true);
  });

  it('keeps the top bar labels in the accessibility tree, with a short text for the box when narrow', () => {
    expect(document.querySelector('.mask-switch .label-full').textContent).toBe('Mask values');
    expect(document.querySelector('.mask-switch .label-short').textContent).toBe('Mask');
  });

  it('never leaves the Mask box with only an icon', () => {
    expect(document.querySelector('.mask-switch .narrow-icon')).toBeNull();
    expect(document.getElementById('advanced')).toBeNull();
  });
});
