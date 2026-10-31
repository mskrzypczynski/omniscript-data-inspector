'use strict';

import { diffValues, formatPath } from '../../../src/core/shared/diff.js';
import { omniPath } from '../../../src/core/shared/path-links.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

describe('formatPath', () => {
  it('writes the path as the OmniScript does: colons between keys, positions after | counting from 1', () => {
    expect(formatPath(['StepA', 'Rows', 2, 'Code'])).toBe('StepA:Rows|3:Code');
    expect(formatPath(['StepA', 'Rows', 0])).toBe('StepA:Rows|1');
    expect(formatPath(['A', 'B', 2])).toBe('A:B|3');
    expect(formatPath([])).toBe('(root)');
  });

  it('writes a list of lists, and a payload that is a list, with the positions alone', () => {
    expect(formatPath(['Grid', 0, 1, 'Cell'])).toBe('Grid|1|2:Cell');
    expect(formatPath([2, 'Name'])).toBe('|3:Name');
  });

  it('is the same notation the right-click menu copies (omniPath)', () => {
    const data = { StepA: { Rows: [{ Code: 'a' }, { Code: 'b' }, { Code: 'c' }] } };
    expect(formatPath(['StepA', 'Rows', 2, 'Code'])).toBe(omniPath(data, ['StepA', 'Rows', '2', 'Code'].join(SEP)));
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

  it('pairs the rows that face each other and reports extra rows whole', () => {
    const { changes } = diffValues({ r: [1, 2] }, { r: [1, 3, 4] });
    expect(changes.map((c) => [c.path, c.kind])).toEqual([['r|2', 'changed'], ['r|3', 'added']]);
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
