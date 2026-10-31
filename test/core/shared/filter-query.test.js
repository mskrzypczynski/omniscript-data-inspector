'use strict';

import { parseFilter, queryMatches, mergeField, filterForKey } from '../../../src/core/shared/filter-query.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const p = (...parts) => parts.join(SEP);

const data = {
  Step1: { Name: 'Ada', Age: 36, Rows: [{ Code: 'a1', Note: 'x' }, { Code: 'b2', Note: 'y' }, { Code: 'c3' }] },
  Step2: { Name: 'Bea', Contact: { Email: 'bea@example.com' } }
};

describe('parseFilter', () => {
  it('leaves ordinary text alone', () => {
    expect(parseFilter('Ada')).toEqual({ kind: 'text', text: 'Ada' });
    expect(parseFilter('')).toEqual({ kind: 'text', text: '' });
    expect(parseFilter(undefined)).toEqual({ kind: 'text', text: '' });
    expect(parseFilter('two words')).toEqual({ kind: 'text', text: 'two words' });
  });

  it('reads an OmniScript path with a 1-based position', () => {
    expect(parseFilter('Step1:Rows|2:Code')).toEqual({
      kind: 'path',
      segments: [{ name: 'Step1', index: null }, { name: 'Rows', index: 2 }, { name: 'Code', index: null }]
    });
    expect(parseFilter(' Step1 : Name ').segments.map((s) => s.name)).toEqual(['Step1', 'Name']);
    expect(parseFilter('Rows|3').segments).toEqual([{ name: 'Rows', index: 3 }]);
  });

  it('reads key=value, with the value optionally quoted', () => {
    expect(parseFilter('Name=Ada')).toEqual({ kind: 'keyValue', segments: [{ name: 'Name', index: null }], value: 'Ada' });
    expect(parseFilter('Name = "Ada Lovelace"').value).toBe('Ada Lovelace');
    expect(parseFilter('Time=10:30').value).toBe('10:30');
    expect(parseFilter('Step1:Name=Ada').segments).toHaveLength(2);
    expect(parseFilter('Name=').value).toBe('');
  });

  it('treats anything that only looks like a query as text', () => {
    expect(parseFilter('http://example.com').kind).toBe('path'); // parses; finding nothing falls back to text in queryMatches
    expect(parseFilter('=x').kind).toBe('text');
    expect(parseFilter('a||b').kind).toBe('text');
    expect(parseFilter('Rows|0').kind).toBe('text');
    expect(parseFilter('Rows|x').kind).toBe('text');
    expect(parseFilter('a::b').kind).toBe('text');
  });
});

describe('queryMatches', () => {
  it('finds a path, a row by its position and a field in it', () => {
    const hit = queryMatches(data, parseFilter('Step1:Rows|2:Code'));
    expect(hit.paths).toEqual([p('Step1', 'Rows', 1, 'Code')]);
    expect(hit.visible.has(p('Step1', 'Rows', 1))).toBe(true);
    expect(hit.visible.has(p('Step1', 'Rows', 0))).toBe(false);
    expect(hit.visible.has('')).toBe(true);
  });

  it('shows everything under a matched branch', () => {
    const hit = queryMatches(data, parseFilter('Step1:Rows|1'));
    expect(hit.visible.has(p('Step1', 'Rows', 0, 'Note'))).toBe(true);
  });

  it('looks in every row when the path has more steps after an array', () => {
    const hit = queryMatches(data, parseFilter('Step1:Rows:Code'));
    expect(hit.paths).toHaveLength(3);
  });

  it('ignores letter case in names', () => {
    expect(queryMatches(data, parseFilter('step1:name')).paths).toEqual([p('Step1', 'Name')]);
  });

  it('finds key=value at any depth, value compared whole and without regard to case', () => {
    expect(queryMatches(data, parseFilter('Name=ada')).paths).toEqual([p('Step1', 'Name')]);
    expect(queryMatches(data, parseFilter('Code=b2')).paths).toEqual([p('Step1', 'Rows', 1, 'Code')]);
    expect(queryMatches(data, parseFilter('Age=36')).paths).toEqual([p('Step1', 'Age')]);
    expect(queryMatches(data, parseFilter('Name=Ad'))).toBe(null);
  });

  it('with an empty value lists every place that key appears', () => {
    expect(queryMatches(data, parseFilter('Name=')).paths).toHaveLength(2);
  });

  it('takes a path as the key of key=value', () => {
    expect(queryMatches(data, parseFilter('Step2:Name=Bea')).paths).toEqual([p('Step2', 'Name')]);
    expect(queryMatches(data, parseFilter('Step1:Name=Bea'))).toBe(null);
  });

  it('is null for plain text and for a query that finds nothing, so the caller searches text', () => {
    expect(queryMatches(data, parseFilter('Ada'))).toBe(null);
    expect(queryMatches(data, parseFilter('Step9:Name'))).toBe(null);
    expect(queryMatches(data, parseFilter('Step1:Rows|9'))).toBe(null);
    expect(queryMatches(undefined, parseFilter('a:b'))).toBe(null);
  });

  it('does not match through an array position written as a key', () => {
    expect(queryMatches({ Rows: [{ Code: 'x' }] }, parseFilter('Rows:0'))).toBe(null);
  });
});

describe('mergeField', () => {
  it('writes %Step:Field%', () => {
    expect(mergeField(data, p('Step1', 'Name'))).toBe('%Step1:Name%');
  });

  it('writes the position inside an array, counted from 1', () => {
    expect(mergeField(data, p('Step1', 'Rows', 1, 'Code'))).toBe('%Step1:Rows|2:Code%');
  });

  it('has nothing for the root', () => {
    expect(mergeField(data, '')).toBe('');
  });
});

describe('a key called "" in the data', () => {
  const odd = { '': { Name: 'x' }, A: { Name: 'x' } };

  it('gives what lies below it a path of its own, apart from its siblings', () => {
    expect(queryMatches(odd, parseFilter('Name=x')).paths).toEqual([p('', 'Name'), p('A', 'Name')]);
  });
});

describe('filterForKey', () => {
  it('makes a key search of an ordinary key, and leaves the rest as text', () => {
    expect(filterForKey('Name')).toBe('Name=');
    expect(filterForKey('a:b')).toBe('a:b');
    expect(filterForKey('a|b')).toBe('a|b');
    expect(filterForKey('a=b')).toBe('a=b');
    expect(filterForKey('$x')).toBe('$x');
    expect(filterForKey('')).toBe('');
    expect(filterForKey(' pad')).toBe(' pad');
  });

  it('gives a filter that lists every place the key appears', () => {
    const parsed = parseFilter(filterForKey('Name'));
    expect(parsed.kind).toBe('keyValue');
    expect(queryMatches({ A: { Name: 'x' }, B: { Name: 'y', Other: 'Name' } }, parsed).paths).toHaveLength(2);
  });
});
