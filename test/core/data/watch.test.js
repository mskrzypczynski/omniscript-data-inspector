'use strict';

import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { watchRows } from '../../../src/core/data/watch.js';
import { omniPath } from '../../../src/core/shared/path-links.js';

const p = (...parts) => parts.join(SEP);
const data = { StepA: { Name: 'Ada', Rows: [{ Code: 'a' }, { Code: 'b' }], Age: 30 } };

describe('watchRows', () => {
  it('shows each watched path with its current value', () => {
    const rows = watchRows(data, [p('StepA', 'Name'), p('StepA', 'Age'), p('StepA', 'Rows')]);
    expect(rows.map((r) => [r.label, r.text])).toEqual([
      ['StepA:Name', '"Ada"'], ['StepA:Age', '30'], ['StepA:Rows', '[2]']
    ]);
  });

  it('labels a repeat-block path the OmniScript way, with its position from 1, and flags a missing one', () => {
    const [row, gone] = watchRows(data, [p('StepA', 'Rows', '1', 'Code'), p('StepA', 'Nope')]);
    expect(row.label).toBe('StepA:Rows|2:Code');
    expect(gone.present).toBe(false);
    expect(gone.text).toMatch(/not in the data/);
  });

  it('copes with no data at all', () => {
    expect(watchRows(undefined, [p('a')])[0].present).toBe(false);
    expect(watchRows(undefined, [p('a', 'b')])[0].label).toBe('a:b');
  });
});

describe('omniPath', () => {
  it('writes colons between keys and |N (from 1) for repeat positions', () => {
    expect(omniPath(data, p('StepA', 'Rows', '1', 'Code'))).toBe('StepA:Rows|2:Code');
    expect(omniPath(data, p('StepA', 'Name'))).toBe('StepA:Name');
    expect(omniPath(data, '')).toBe('');
  });
});

describe('watchRows with a mask', () => {
  const hide = (value) => (typeof value === 'string' ? '<string>' : value);

  it('shows the masked value but keeps the real text, which tells whether the value changed', () => {
    const [name, age] = watchRows(data, [p('StepA', 'Name'), p('StepA', 'Age')], hide);
    expect(name.text).toBe('"Ada"');
    expect(name.shown).toBe('"<string>"');
    expect(age.shown).toBe('30');
  });

  it('shows the real text when there is no mask, and the "not in the data" line either way', () => {
    expect(watchRows(data, [p('StepA', 'Name')])[0].shown).toBe('"Ada"');
    expect(watchRows(data, [p('StepA', 'Nope')], hide)[0].shown).toMatch(/not in the data/);
  });
});
