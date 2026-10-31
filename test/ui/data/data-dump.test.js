'use strict';

/* What the Data tab hands to the debug bundle (Shared.dumps), and the bundle
 * built from it. */

import { jest } from '@jest/globals';
import { bootData } from '../support/data-page.js';
import { until } from '../support/wait.js';

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); document.body.innerHTML = ''; });

const identity = (value) => value;
const mask = (value) => (typeof value === 'string' && value ? '<string>' : value);

describe('Data tab dump', () => {
  it('masks the filter text, which may hold a value, and keeps names', async () => {
    const { Shared } = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Name: 'Ada' } }] });
    const filter = document.getElementById('filter');
    filter.value = 'Name=Ada';
    filter.dispatchEvent(new Event('input'));
    await until(() => Shared.dumps(identity).data.filter === 'Name=Ada');
    const dump = Shared.dumps(mask).data;
    expect(dump.filter).toBe('<string>');
    expect(dump.prop).toBe('jsonDataStr');
    expect(JSON.stringify(dump)).not.toContain('Ada');
  });

  it('is empty of sizes before anything is read', async () => {
    const { Shared } = await bootData({ hosts: [] });
    expect(Shared.dumps(identity).data.sizesTop).toEqual([]);
  });
});
