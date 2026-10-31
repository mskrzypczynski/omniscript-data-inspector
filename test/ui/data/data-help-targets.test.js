'use strict';

/* Each control of the Data toolbar opens the help entry that describes it, not
 * a neighbour's: the entry has to exist and has to name the control in its
 * text. A control added without a line here fails the first test. */

import { bootData } from '../support/data-page.js';

afterEach(() => { document.body.innerHTML = ''; });

/* control id -> [entry it opens, words that entry must use for it] */
const EXPECTED = {
  'view-tree': ['Tree view', ['tree']],
  'view-form': ['Form view', ['Form']],
  'view-sizes': ['Sizes', ['Treemap']],
  'view-raw': ['Tree / Form / Raw', ['Raw']],
  'view-changes': ['Changes view', ['Track changes']],
  refresh: ['Refresh', ['Refresh']],
  live: ['Auto-refresh', ['Untick it for manual mode']],
  'data-changes': ['Changes', ['Changes bar']],
  filter: ['Filter', ['key=value']],
  expand: ['Expand all / Collapse all', ['Expand all']],
  collapse: ['Expand all / Collapse all', ['Collapse all']],
  'data-export': ['Export data', ['Copy JSON', 'Save file']],
  'changed-only': ['Changed only', ['marked']],
  'prev-change': ['Previous change / Next change', ['previous', 'next']],
  'next-change': ['Previous change / Next change', ['previous', 'next']],
  'clear-changes': ['Clear marks', ['marks']],
  'compare-toggle': ['Compare data', ['Before and After']]
};

describe('the help targets of the Data toolbar', () => {
  it('are decided for every control that has one', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: 1 } }] });
    const named = [...document.querySelectorAll('#view-data .toolbar [data-help]')].map((node) => node.id || node.querySelector('input').id);
    expect(named.filter((id) => !EXPECTED[id])).toEqual([]);
  });
});
