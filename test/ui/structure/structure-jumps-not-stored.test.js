'use strict';

/* Only a click on the tab strip is a pick that Remember my settings keeps. A
 * jump (the verdict chip in the head, a link in the summary) shows the tab
 * without storing it, and Settings that differ reports what is stored. Names
 * are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });
const steps = () => [{ name: 'Intro', elements: [
  { name: 'Kind', type: 'Text', propSetMap: { required: true } },
  { name: 'Company', type: 'Text', propSetMap: { label: 'Company name', show: rule('Intro:Kind', '=', 'Business') } }
] }];

const activeTab = () => document.querySelector('#struct-detail .seg-btn.is-on .btn-label').textContent;
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.querySelector('.btn-label').textContent.startsWith(label));

let Settings;
async function open() {
  await bootStructure({
    scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Kind: 'Person' } } }],
    seed: async () => { ({ Settings } = await import('../../../src/ui/settings.js')); Settings.set('rememberSettings', true); }
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a jump to a tab', () => {
  it('shows the tab without storing it, and the setting stays what was clicked', async () => {
    await open();
    clickRow('Company');
    tabButton('Properties').click();
    expect(Settings.get('structDetailTab')).toBe('props');

    document.querySelector('#struct-detail .detail-head .detail-chip').click(); // the verdict chip: a jump
    expect(activeTab()).toBe('Visibility');
    expect(Settings.get('structDetailTab')).toBe('props');
    expect(Settings.current().structDetailTab).toBe('props'); // what Settings that differ reports
  });

  it('is stored when it is a click on the strip', async () => {
    await open();
    clickRow('Company');
    tabButton('Properties').click();
    tabButton('Visibility').click(); // a click on the strip is a pick
    expect(Settings.current().structDetailTab).toBe('conditions');
  });
});
