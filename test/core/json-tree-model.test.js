'use strict';

/* Characterization tests for src/core/json-tree-model.js — deciding which
 * rows a filtered/collapsed JSON tree should show, independent of drawing
 * any of it. */

import { SEP, isContainer, entriesOf, summarise, collectMatches, addAllPaths } from '../../src/core/json-tree-model.js';

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
