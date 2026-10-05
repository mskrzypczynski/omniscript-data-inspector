'use strict';

import { diffValues, formatPath } from '../../src/core/diff.js';

describe('formatPath', () => {
  it('writes keys with dots and array positions in brackets', () => {
    expect(formatPath(['StepA', 'Rows', 2, 'Code'])).toBe('StepA.Rows[2].Code');
    expect(formatPath([])).toBe('(root)');
  });
});

describe('diffValues', () => {
  it('lists changed, added and removed values by path', () => {
    const { changes } = diffValues(
      { a: 1, b: { c: 'x' }, gone: true },
      { a: 2, b: { c: 'x' }, fresh: [1] }
    );
    expect(changes).toEqual([
      { path: 'a', kind: 'changed', before: 1, after: 2 },
      { path: 'gone', kind: 'removed', before: true, after: undefined },
      { path: 'fresh', kind: 'added', before: undefined, after: [1] }
    ]);
  });

  it('compares arrays by position and reports extra items', () => {
    const { changes } = diffValues({ r: [1, 2] }, { r: [1, 3, 4] });
    expect(changes.map((c) => [c.path, c.kind])).toEqual([['r[1]', 'changed'], ['r[2]', 'added']]);
  });

  it('is empty for equal values and reports a type change as one change', () => {
    expect(diffValues({ a: [1] }, { a: [1] }).changes).toEqual([]);
    expect(diffValues({ a: [1] }, { a: { 0: 1 } }).changes).toHaveLength(1);
    expect(diffValues(1, 1).changes).toEqual([]);
  });

  it('stops at the limit and says so', () => {
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
    const other = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i + 1]));
    const result = diffValues(big, other, 5);
    expect(result.changes).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });
});
