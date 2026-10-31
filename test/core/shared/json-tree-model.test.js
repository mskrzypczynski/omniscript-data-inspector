'use strict';

/* Characterization tests for src/core/shared/json-tree-model.js — deciding which
 * rows a filtered/collapsed JSON tree should show, independent of drawing
 * any of it. */

import { SEP, isBranchOpen, isContainer, entriesOf, summarise, collectMatches, addAllPaths, joinPath, subtreePaths, setSubtreeOpen, lineSize, childLines, closingLine } from '../../../src/core/shared/json-tree-model.js';

describe('isContainer', () => {
  it('treats objects and arrays as containers, and everything else as a leaf', () => {
    expect(isContainer({})).toBe(true);
    expect(isContainer([])).toBe(true);
    expect(isContainer(null)).toBe(false);
    expect(isContainer('text')).toBe(false);
    expect(isContainer(0)).toBe(false);
  });
});

describe('entriesOf', () => {
  it('pairs an array with its stringified index', () => {
    expect(entriesOf(['a', 'b'])).toEqual([['0', 'a'], ['1', 'b']]);
  });

  it('pairs an object with its own keys', () => {
    expect(entriesOf({ x: 1, y: 2 })).toEqual([['x', 1], ['y', 2]]);
  });
});

describe('summarise', () => {
  it('describes an array by item count, singular for exactly one', () => {
    expect(summarise([1], 'p', null, null)).toBe(' [1 item]');
    expect(summarise([1, 2], 'p', null, null)).toBe(' [2 items]');
  });

  it('describes an object by key count, singular for exactly one', () => {
    expect(summarise({ a: 1 }, 'p', null, null)).toBe(' {1 key}');
    expect(summarise({ a: 1, b: 2 }, 'p', null, null)).toBe(' {2 keys}');
  });

  it('appends a dot when a change is hidden inside this collapsed branch', () => {
    const changedBranch = new Set(['p']);
    const changed = new Set(['p' + SEP + 'a']);
    expect(summarise({ a: 1 }, 'p', changedBranch, changed)).toBe(' {1 key} •');
  });

  it('adds no dot when nothing actually changed', () => {
    expect(summarise({ a: 1 }, 'p', new Set(['p']), new Set())).toBe(' {1 key}');
  });
});

describe('addAllPaths', () => {
  it('collects the root and every descendant path', () => {
    const out = new Set();
    addAllPaths({ a: { b: 1 }, c: 2 }, '', out, 0);
    expect(out).toEqual(new Set(['', 'a', 'a' + SEP + 'b', 'c']));
  });

  it('stops recursing once a leaf is reached', () => {
    const out = new Set();
    addAllPaths('leaf', 'root', out, 0);
    expect(out).toEqual(new Set(['root']));
  });
});

describe('collectMatches', () => {
  it('matches a leaf value and records its path', () => {
    const out = new Set();
    const hit = collectMatches({ name: 'Ada' }, '', '', 'ada', out);
    expect(hit).toBe(true);
    expect(out.has('name')).toBe(true);
    expect(out.has('')).toBe(true); // the root is included so the row stays visible
  });

  it('reveals the whole subtree when the match is on a container’s own key', () => {
    const out = new Set();
    collectMatches({ account: { id: 1, name: 'Ada' } }, '', 'account', 'account', out);
    expect(out.has('account')).toBe(true);
    expect(out.has('account' + SEP + 'id')).toBe(true);
    expect(out.has('account' + SEP + 'name')).toBe(true);
  });

  it('finds nothing for a query that matches no key or value', () => {
    const out = new Set();
    const hit = collectMatches({ a: 1 }, '', '', 'zzz', out);
    expect(hit).toBe(false);
    expect(out.size).toBe(0);
  });
});

describe('line numbering', () => {
  const data = { a: 1, list: [1, { x: 2 }], empty: [], z: null };

  it('sizes a value like JSON.stringify(value, null, 2) lays it out', () => {
    expect(lineSize(1)).toBe(1);
    expect(lineSize({})).toBe(1);
    expect(lineSize(data)).toBe(JSON.stringify(data, null, 2).split('\n').length);
  });

  it('places each child and the closing brace on its real line', () => {
    const text = JSON.stringify(data, null, 2).split('\n');
    const lines = childLines(data, 1);
    expect(lines.map((n) => text[n - 1].trim().split(':')[0])).toEqual(['"a"', '"list"', '"empty"', '"z"']);
    expect(text[closingLine(data, 1) - 1]).toBe('}');
    expect(text[closingLine(data.list, lines[1]) - 1].trim()).toBe('],');
  });
});

describe('isBranchOpen', () => {
  const expanded = new Set(['a']);

  it('uses the expanded set when not filtering', () => {
    expect(isBranchOpen({ filtering: false, expanded, filterOpen: new Map([['b', true]]) }, 'a')).toBe(true);
    expect(isBranchOpen({ filtering: false, expanded, filterOpen: null }, 'b')).toBe(false);
  });

  it('opens matches by default while filtering, and lets the user\'s toggles win', () => {
    const filterOpen = new Map([['a', false]]);
    expect(isBranchOpen({ filtering: true, expanded, filterOpen }, 'a')).toBe(false);
    expect(isBranchOpen({ filtering: true, expanded, filterOpen }, 'b')).toBe(true);
    expect(isBranchOpen({ filtering: true, expanded, filterOpen: null }, 'b')).toBe(true);
  });
});

describe('subtreePaths', () => {
  const value = { a: { b: { c: 1 }, d: [1, { e: 2 }] }, f: 1, g: {} };

  it('lists the branch and every non-empty container beneath it, not leaves', () => {
    expect(subtreePaths(value, '')).toEqual(['', 'a', 'a' + SEP + 'b', 'a' + SEP + 'd', 'a' + SEP + 'd' + SEP + '1']);
  });

  it('starts from the given path', () => {
    expect(subtreePaths(value.a, 'a')).toEqual(['a', 'a' + SEP + 'b', 'a' + SEP + 'd', 'a' + SEP + 'd' + SEP + '1']);
  });

  it('is empty for a leaf or an empty container', () => {
    expect(subtreePaths(1, 'x')).toEqual([]);
    expect(subtreePaths({}, 'x')).toEqual([]);
  });

  it('is bounded on a huge payload', () => {
    const big = { list: Array.from({ length: 30000 }, () => ({ k: 1 })) };
    expect(subtreePaths(big, '').length).toBeLessThanOrEqual(20000);
  });
});

describe('setSubtreeOpen', () => {
  const value = { a: { b: { c: 1 } } };

  it('opens and closes the expanded set without a filter', () => {
    const expanded = new Set(['']);
    setSubtreeOpen({ filtering: false, expanded, filterOpen: null }, value, '', true);
    expect(expanded).toEqual(new Set(['', 'a', 'a' + SEP + 'b']));
    setSubtreeOpen({ filtering: false, expanded, filterOpen: null }, value.a, 'a', false);
    expect(expanded).toEqual(new Set(['']));
  });

  it('writes the filterOpen overrides while filtering and leaves expanded alone', () => {
    const expanded = new Set(['']);
    const filterOpen = new Map();
    expect(setSubtreeOpen({ filtering: true, expanded, filterOpen }, value.a, 'a', false)).toBe(true);
    expect([...filterOpen]).toEqual([['a', false], ['a' + SEP + 'b', false]]);
    expect(expanded).toEqual(new Set(['']));
    expect(setSubtreeOpen({ filtering: true, expanded, filterOpen: null }, value.a, 'a', false)).toBe(false);
  });
});

describe('list positions and empty keys', () => {
  it('does not match the position of an item in a list as a key', () => {
    const out = new Set();
    collectMatches({ Rows: [{ Code: 'a' }, { Code: 'b' }] }, '', '', '1', out);
    expect(out.size).toBe(0);
    const keyed = new Set();
    collectMatches({ Rows: [{ '1': 'a' }] }, '', '', '1', keyed);
    expect([...keyed]).toEqual(expect.arrayContaining([['Rows', '0', '1'].join(SEP)]));
  });

  it('still finds a value inside a list, and the list\'s own key', () => {
    const out = new Set();
    collectMatches({ Rows: ['x1', 'y2'] }, '', '', 'y2', out);
    expect([...out].sort()).toEqual(['', 'Rows', ['Rows', '1'].join(SEP)].sort());
  });

  it('gives what lies below a key called "" its own paths, apart from its siblings', () => {
    const data = { '': { a: 1 }, a: 2 };
    const out = new Set();
    collectMatches(data, '', '', 'a', out);
    expect(out.has(`${SEP}a`)).toBe(true); // below the empty key
    expect(out.has('a')).toBe(true); // the sibling
    const all = new Set();
    addAllPaths(data, '', all, 0);
    expect([...all].sort()).toEqual(['', `${SEP}a`, 'a'].sort());
  });
});

describe('joinPath', () => {
  it('names a child by its key under the root and by the chain below it', () => {
    expect(joinPath('', 'a', 0)).toBe('a');
    expect(joinPath('a', 'b', 1)).toBe(`a${SEP}b`);
  });

  it('gives what lies below an unnamed key its own separator (the key itself shares the root\'s path: a known limit)', () => {
    expect(joinPath('', '', 0)).toBe('');
    expect(joinPath('', 'x', 1)).toBe(`${SEP}x`);
    expect(joinPath('', 'x', 1)).not.toBe(joinPath('', 'x', 0));
  });
});
