'use strict';

import { parseFilter, queryMatches, queryPaths } from '../../../src/core/shared/filter-query.js';
import { parseQuerySteps, QUERY_MAX_MATCHES } from '../../../src/core/shared/json-query.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const p = (...parts) => parts.join(SEP);
const paths = (data, text) => queryPaths(data, parseFilter(text)).paths;

const data = {
  Step: {
    Name: 'Ada',
    Rows: [{ Code: 'a1', Qty: 1 }, { Code: 'b2', Qty: 2 }, { Code: 'c3', Qty: 3 }],
    Extra: { Code: 'deep', Inner: { Code: 'deeper' } }
  },
  Other: { Name: 'Bea' }
};

describe('parseFilter with a $ query', () => {
  it('reads a $ followed by . or [ as a query', () => {
    expect(parseFilter('$.Step.Name').kind).toBe('query');
    expect(parseFilter('$..Code').kind).toBe('query');
    expect(parseFilter('$[0]').kind).toBe('query');
    expect(parseFilter('  $.Step  ').text).toBe('$.Step');
  });

  it('takes colons, bars and equals signs inside a query', () => {
    expect(parseFilter('$.Step:Name').kind).toBe('query');
    expect(parseFilter('$["a=b"]').kind).toBe('query');
  });

  it('reads a $ that is not a query as plain text', () => {
    expect(parseFilter('$').kind).toBe('text');
    expect(parseFilter('$1,000').kind).toBe('text');
    expect(parseFilter('$.').kind).toBe('text');
    expect(parseFilter('$..').kind).toBe('text');
    expect(parseFilter('$.a.').kind).toBe('text');
    expect(parseFilter('$.[0]').kind).toBe('text');
  });

  it('does not take filters, expressions or unions', () => {
    expect(parseFilter('$..[?(@.Qty>1)]').kind).toBe('text');
    expect(parseFilter('$.Rows[?(@.Qty=1)]').kind).not.toBe('query');
    expect(parseFilter('$.Rows[0,2]').kind).toBe('text');
    expect(parseFilter('$.Rows[').kind).toBe('text');
    expect(parseFilter('$["a').kind).toBe('text');
  });

  it('leaves the other forms as they were', () => {
    expect(parseFilter('a$b').kind).toBe('text');
    expect(parseFilter('$a=b').kind).toBe('keyValue');
    expect(parseFilter('Step:Name').kind).toBe('path');
  });
});

describe('queryPaths', () => {
  it('follows keys', () => {
    expect(paths(data, '$.Step.Name')).toEqual([p('Step', 'Name')]);
    expect(paths(data, '$.Step.Nope')).toEqual([]);
  });

  it('takes every item with [*]', () => {
    expect(paths(data, '$.Step.Rows[*].Code')).toEqual([p('Step', 'Rows', 0, 'Code'), p('Step', 'Rows', 1, 'Code'), p('Step', 'Rows', 2, 'Code')]);
  });

  it('takes a key at any depth with ..', () => {
    expect(paths(data, '$..Code')).toEqual([
      p('Step', 'Rows', 0, 'Code'), p('Step', 'Rows', 1, 'Code'), p('Step', 'Rows', 2, 'Code'),
      p('Step', 'Extra', 'Code'), p('Step', 'Extra', 'Inner', 'Code')
    ]);
  });

  it('keeps tree order when a key sits beside a branch holding the same key', () => {
    expect(paths({ A: { Code: 1 }, Code: 2 }, '$..Code')).toEqual([p('A', 'Code'), 'Code']);
  });

  it('counts an index from 0, and from the end when negative', () => {
    expect(paths(data, '$.Step.Rows[2]')).toEqual([p('Step', 'Rows', 2)]);
    expect(paths(data, '$.Step.Rows[0].Code')).toEqual([p('Step', 'Rows', 0, 'Code')]);
    expect(paths(data, '$.Step.Rows[-1]')).toEqual([p('Step', 'Rows', 2)]);
    expect(paths(data, '$.Step.Rows[-3]')).toEqual([p('Step', 'Rows', 0)]);
    expect(paths(data, '$.Step.Rows[3]')).toEqual([]);
    expect(paths(data, '$.Step.Rows[-4]')).toEqual([]);
  });

  it('does not index into an object, nor name a key of a list', () => {
    expect(paths(data, '$.Step[0]')).toEqual([]);
    expect(paths(data, '$.Step.Rows.Code')).toEqual([]);
  });

  it('slices: start included, end excluded, either end optional', () => {
    expect(paths(data, '$.Step.Rows[1:3]')).toEqual([p('Step', 'Rows', 1), p('Step', 'Rows', 2)]);
    expect(paths(data, '$.Step.Rows[:1]')).toEqual([p('Step', 'Rows', 0)]);
    expect(paths(data, '$.Step.Rows[2:]')).toEqual([p('Step', 'Rows', 2)]);
    expect(paths(data, '$.Step.Rows[-2:]')).toEqual([p('Step', 'Rows', 1), p('Step', 'Rows', 2)]);
    expect(paths(data, '$.Step.Rows[1:99]')).toHaveLength(2);
    expect(paths(data, '$.Step.Rows[2:1]')).toEqual([]);
  });

  it('takes every child with a wildcard', () => {
    expect(paths(data, '$.*.Name')).toEqual([p('Step', 'Name'), p('Other', 'Name')]);
    expect(paths(data, '$.Other.*')).toEqual([p('Other', 'Name')]);
    expect(paths(data, '$.Step.Rows.*')).toHaveLength(3);
  });

  it('reaches three levels down with wildcards', () => {
    const deep = { a: { b: { c: 1, d: 2 }, e: { c: 3 } }, f: { g: { c: 4 } } };
    expect(paths(deep, '$.*.*.c')).toEqual([p('a', 'b', 'c'), p('a', 'e', 'c'), p('f', 'g', 'c')]);
    expect(paths(deep, '$.*.*.*')).toHaveLength(4);
  });

  it('takes every descendant with ..*', () => {
    expect(paths({ a: [1, { b: 2 }] }, '$..*')).toEqual(['a', p('a', 0), p('a', 1), p('a', 1, 'b')]);
  });

  it('takes an item at any depth with ..[n]', () => {
    expect(paths({ a: [[1, 2], [3]], b: [4] }, '$..[0]')).toEqual([p('a', 0), p('a', 0, 0), p('a', 1, 0), p('b', 0)]);
  });

  it('works through arrays of arrays', () => {
    const grid = { g: [[{ v: 1 }, { v: 2 }], [{ v: 3 }]] };
    expect(paths(grid, '$.g[*][*].v')).toEqual([p('g', 0, 0, 'v'), p('g', 0, 1, 'v'), p('g', 1, 0, 'v')]);
    expect(paths(grid, '$.g[1][0].v')).toEqual([p('g', 1, 0, 'v')]);
    expect(paths(grid, '$.g[-1][-1]')).toEqual([p('g', 1, 0)]);
  });

  it('takes odd keys in brackets, quoted', () => {
    const odd = { 'a.b': 1, 'with space': { 'x:y': 2 }, 'it\'s': 3, Plain: 4 };
    expect(paths(odd, '$["a.b"]')).toEqual(['a.b']);
    expect(paths(odd, '$[\'with space\']["x:y"]')).toEqual([p('with space', 'x:y')]);
    expect(paths(odd, '$["it\\\'s"]')).toEqual(['it\'s']);
    expect(paths(odd, '$.with space.x:y')).toEqual([p('with space', 'x:y')]);
    expect(paths(odd, '$..["x:y"]')).toEqual([p('with space', 'x:y')]);
  });

  it('matches a bare key ignoring case when no key is spelled so, and a quoted key exactly', () => {
    expect(paths(data, '$.step.name')).toEqual([p('Step', 'Name')]);
    expect(paths({ Name: 1, name: 2 }, '$.name')).toEqual(['name']);
    expect(paths(data, '$["step"]')).toEqual([]);
  });

  it('leaves out repeats', () => {
    expect(paths({ a: { a: { b: 1 } } }, '$..a..b')).toEqual([p('a', 'a', 'b')]);
  });

  it('matches nothing in no data, or for a text that is not a query', () => {
    expect(queryPaths(undefined, '$.a')).toEqual({ paths: [], capped: false });
    expect(queryPaths(data, 'Step')).toEqual({ paths: [], capped: false });
    expect(queryPaths(data, null)).toEqual({ paths: [], capped: false });
  });

  it('takes the query as text too', () => {
    expect(queryPaths(data, '$.Step.Name').paths).toEqual([p('Step', 'Name')]);
  });

  it('stops after 5,000 matches and says so', () => {
    const big = { Rows: Array.from({ length: QUERY_MAX_MATCHES + 50 }, (_, i) => ({ n: i })) };
    const result = queryPaths(big, '$.Rows[*].n');
    expect(result.paths).toHaveLength(QUERY_MAX_MATCHES);
    expect(result.capped).toBe(true);
    expect(queryPaths(big, '$.Rows[0:10]').capped).toBe(false);
  });
});

describe('parseQuerySteps', () => {
  it('describes each step', () => {
    expect(parseQuerySteps('$.a..b[*][-1][1:2]')).toEqual([
      { op: 'key', name: 'a', exact: false, deep: false },
      { op: 'key', name: 'b', exact: false, deep: true },
      { op: 'all', deep: false },
      { op: 'index', index: -1, deep: false },
      { op: 'slice', from: 1, to: 2, deep: false }
    ]);
  });
});

describe('queryMatches with a $ query', () => {
  it('shows each match with the way down to it and what is under it', () => {
    const hit = queryMatches(data, parseFilter('$.Step.Rows[1]'));
    expect(hit.matches).toBe(1);
    expect(hit.visible.has('')).toBe(true);
    expect(hit.visible.has(p('Step'))).toBe(true);
    expect(hit.visible.has(p('Step', 'Rows'))).toBe(true);
    expect(hit.visible.has(p('Step', 'Rows', 1))).toBe(true);
    expect(hit.visible.has(p('Step', 'Rows', 1, 'Code'))).toBe(true);
    expect(hit.visible.has(p('Step', 'Rows', 0))).toBe(false);
    expect(hit.visible.has(p('Other'))).toBe(false);
    expect(hit.capped).toBe(false);
  });

  it('comes back empty, not null, for a query that finds nothing', () => {
    const hit = queryMatches(data, parseFilter('$.Nothing.Here'));
    expect(hit.matches).toBe(0);
    expect(hit.visible.size).toBe(0);
  });

  it('passes on that the match limit was reached', () => {
    const big = { Rows: Array.from({ length: QUERY_MAX_MATCHES + 1 }, (_, i) => i) };
    expect(queryMatches(big, parseFilter('$.Rows[*]')).capped).toBe(true);
  });

  it('still gives null for plain text', () => {
    expect(queryMatches(data, parseFilter('$1,000'))).toBe(null);
  });
});

describe('a key called "" in the data', () => {
  it('gives what lies below it a path of its own, apart from its siblings', () => {
    expect(paths({ '': { Name: 'x' }, A: { Name: 'x' } }, '$..Name')).toEqual([p('', 'Name'), p('A', 'Name')]);
  });
});
