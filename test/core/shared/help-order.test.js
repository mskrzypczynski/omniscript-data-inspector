'use strict';

import { orderEntriesByControls } from '../../../src/core/shared/help-order.js';

const entry = (title) => [title, `About ${title}.`];
const titles = (entries) => entries.map((item) => item[0]);

describe('orderEntriesByControls', () => {
  const entries = ['Data property', 'Amber highlight', 'Inspect element', 'Refresh', 'Auto-refresh', 'Left the page'].map(entry);

  it('puts the controls first in screen order, the rest after them, and Advanced ones last', () => {
    const controls = [
      { help: 'Data property', advanced: true }, { help: 'Inspect element', advanced: true },
      { help: 'Refresh' }, { help: 'Auto-refresh' }
    ];
    expect(titles(orderEntriesByControls(entries, controls))).toEqual([
      'Refresh', 'Auto-refresh', 'Amber highlight', 'Left the page', 'Data property', 'Inspect element'
    ]);
  });

  it('matches titles in any case and counts a control that appears twice at its first place', () => {
    const controls = [{ help: 'auto-refresh' }, { help: 'REFRESH' }, { help: 'Refresh' }];
    expect(titles(orderEntriesByControls(entries, controls)).slice(0, 2)).toEqual(['Auto-refresh', 'Refresh']);
  });

  it('is Advanced only when every place of the control is', () => {
    const controls = [{ help: 'Refresh', advanced: true }, { help: 'Refresh' }, { help: 'Auto-refresh', advanced: true }];
    expect(titles(orderEntriesByControls(entries, controls))).toEqual([
      'Refresh', 'Data property', 'Amber highlight', 'Inspect element', 'Left the page', 'Auto-refresh'
    ]);
  });

  it('keeps the written order when no control is known, and does not change the list it was given', () => {
    expect(titles(orderEntriesByControls(entries, []))).toEqual(titles(entries));
    const copy = [...entries];
    orderEntriesByControls(entries, [{ help: 'Refresh' }]);
    expect(entries).toEqual(copy);
    expect(orderEntriesByControls(undefined, undefined)).toEqual([]);
  });
});
