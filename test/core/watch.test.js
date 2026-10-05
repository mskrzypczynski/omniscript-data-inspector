'use strict';

import { SEP } from '../../src/core/json-tree-model.js';
import { watchRows } from '../../src/core/watch.js';
import { omniPath } from '../../src/core/path-links.js';

const p = (...parts) => parts.join(SEP);
const data = { StepA: { Name: 'Ada', Rows: [{ Code: 'a' }, { Code: 'b' }], Age: 30 } };

describe('watchRows', () => {
  it('shows each watched path with its current value', () => {
    const rows = watchRows(data, [p('StepA', 'Name'), p('StepA', 'Age'), p('StepA', 'Rows')]);
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['StepA › Name', '"Ada"'], ['StepA › Age', '30'], ['StepA › Rows', '[2]']
    ]);
  });

  it('labels a repeat-block path without the index, and flags a missing one', () => {
    const [row, gone] = watchRows(data, [p('StepA', 'Rows', '1', 'Code'), p('StepA', 'Nope')]);
    expect(row.label).toBe('StepA › Rows › Code');
    expect(gone.present).toBe(false);
    expect(gone.text).toMatch(/not in the data/);
  });

  it('copes with no data at all', () => {
    expect(watchRows(undefined, [p('a')])[0].present).toBe(false);
  });
});

describe('omniPath', () => {
  it('writes colons between keys and |N (from 1) for repeat positions', () => {
    expect(omniPath(data, p('StepA', 'Rows', '1', 'Code'))).toBe('StepA:Rows|2:Code');
    expect(omniPath(data, p('StepA', 'Name'))).toBe('StepA:Name');
    expect(omniPath(data, '')).toBe('');
  });
});
