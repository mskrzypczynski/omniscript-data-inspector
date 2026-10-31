'use strict';

import { SEP, subtreeBranches, subtreePaths } from '../../../src/core/shared/json-tree-model.js';

describe('subtreeBranches', () => {
  it('lists non-empty branches only, not leaves or empty containers', () => {
    const value = { a: { b: 1, c: [1, 2] }, d: {}, e: [], f: 'x' };
    expect(subtreeBranches(value, '').paths).toEqual(['', 'a', `a${SEP}c`]);
    expect(subtreeBranches(value, '').capped).toBe(false);
    expect(subtreePaths(value.a, 'a')).toEqual(['a', `a${SEP}c`]);
  });

  it('says so when more than 20,000 branches are cut short', () => {
    const value = { rows: Array.from({ length: 21000 }, () => ({ x: { y: 1 } })) };
    const { paths, capped } = subtreeBranches(value, '');
    expect(capped).toBe(true);
    expect(paths).toHaveLength(20000);
  });

  it('does not count leaves against the limit', () => {
    const value = { rows: Array.from({ length: 30000 }, (_, i) => i) };
    const { paths, capped } = subtreeBranches(value, '');
    expect(capped).toBe(false);
    expect(paths).toEqual(['', 'rows']);
  });
});
