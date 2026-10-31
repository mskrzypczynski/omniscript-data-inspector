'use strict';

/* A filter that starts with $ is a path query over the payload: matching rows
 * with their parents, a count in the status bar, a notice when nothing
 * matches, and plain text when it does not parse. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';

const $ = (id) => document.getElementById(id);
const host = {
  id: 'a', tag: 'c-os',
  data: {
    Step: { Name: 'Ada', Rows: [{ Code: 'a1', Qty: 1 }, { Code: 'b2', Qty: 2 }, { Code: 'c3', Qty: 3 }] },
    Other: { Name: 'Bea', Price: '$1,000' }
  }
};

/* A previous test's read loop must not keep running into this test's page. */
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); document.body.innerHTML = ''; });

const keys = () => [...viewport().querySelectorAll('.row[data-path] > .k')].map((node) => node.textContent);

function filter(text) {
  $('filter').value = text;
  $('filter').dispatchEvent(new Event('input'));
  jest.advanceTimersByTime(200);
}

describe('$ query in the filter box', () => {
  it('searches a $ that is not a query as text', async () => {
    await bootData({ hosts: [host] });
    filter('$1,000');
    expect(viewport().querySelectorAll('mark')[0].textContent).toBe('$1,000');
    expect(keys()).toEqual(['Data', 'Other', 'Price']);
    filter('$');
    expect(viewport().querySelectorAll('mark').length).toBeGreaterThan(0);
    filter('$..[?(@.Qty>1)]');
    expect(viewport().textContent).toContain('No rows match');
    expect(viewport().textContent).not.toContain('Nothing matches');
  });
});
