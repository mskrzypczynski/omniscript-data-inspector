'use strict';

import { SEP } from '../../src/core/json-tree-model.js';
import {
  valueAt, orderedChanges, changedVisible, stepChange, ancestorsOf
} from '../../src/core/changes.js';

const p = (...parts) => parts.join(SEP);
const data = { a: { x: 1, y: 2 }, b: [10, 20], c: 3 };

describe('valueAt', () => {
  it('walks a SEP path and returns undefined for a missing one', () => {
    expect(valueAt(data, p('a', 'y'))).toBe(2);
    expect(valueAt(data, p('b', '1'))).toBe(20);
    expect(valueAt(data, p('a', 'nope'))).toBeUndefined();
    expect(valueAt(data, '')).toBe(data);
  });
});

describe('orderedChanges', () => {
  it('lists touched paths in tree order and drops ones that no longer exist', () => {
    const touched = new Set([p('c'), p('a', 'y'), p('gone'), p('b', '0')]);
    expect(orderedChanges(data, touched)).toEqual([p('a', 'y'), p('b', '0'), p('c')]);
  });

  it('is empty without touched paths', () => {
    expect(orderedChanges(data, new Set())).toEqual([]);
    expect(orderedChanges(data, null)).toEqual([]);
  });
});

describe('changedVisible', () => {
  it('shows each change with the way down to it', () => {
    const visible = changedVisible(data, new Set([p('a', 'y')]));
    expect([...visible].sort()).toEqual(['', 'a', p('a', 'y')].sort());
  });

  it('includes everything under a changed branch', () => {
    const visible = changedVisible(data, new Set([p('b')]));
    expect(visible.has(p('b', '0'))).toBe(true);
    expect(visible.has(p('b', '1'))).toBe(true);
    expect(visible.has(p('a', 'x'))).toBe(false);
  });

  it('is empty when nothing changed', () => {
    expect(changedVisible(data, new Set()).size).toBe(0);
  });
});

describe('stepChange', () => {
  const list = ['one', 'two', 'three'];
  it('moves forward and back, wrapping at the ends', () => {
    expect(stepChange(list, 'one', 1)).toBe('two');
    expect(stepChange(list, 'three', 1)).toBe('one');
    expect(stepChange(list, 'one', -1)).toBe('three');
  });
  it('starts at the first or last without a usable position', () => {
    expect(stepChange(list, null, 1)).toBe('one');
    expect(stepChange(list, 'zzz', -1)).toBe('three');
    expect(stepChange([], null, 1)).toBeNull();
  });
});

describe('ancestorsOf', () => {
  it('returns the root and each parent, not the path itself', () => {
    expect(ancestorsOf(p('a', 'b', 'c'))).toEqual(['', 'a', p('a', 'b')]);
    expect(ancestorsOf('')).toEqual([]);
    expect(ancestorsOf('a')).toEqual(['']);
  });
});

describe('changedPaths / branchesAbove / initialExpansion', () => {
  it('lists changed, added and removed paths', async () => {
    const { changedPaths } = await import('../../src/core/changes.js');
    const paths = changedPaths({ a: { x: 1, y: 2 }, gone: 1, same: 1 }, { a: { x: 1, y: 3 }, fresh: 1, same: 1 });
    expect([...paths].sort()).toEqual([p('a', 'y'), 'fresh', 'gone'].sort());
  });

  it('counts a branch that changed type as one change, and finds nothing in equal values', async () => {
    const { changedPaths } = await import('../../src/core/changes.js');
    expect([...changedPaths({ a: [1] }, { a: { 0: 1 } })]).toEqual(['a']);
    expect(changedPaths({ a: 1 }, { a: 1 }).size).toBe(0);
  });

  it('stops collecting past the limit', async () => {
    const { changedPaths } = await import('../../src/core/changes.js');
    const a = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 0]));
    const b = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 1]));
    expect(changedPaths(a, b, 10).size).toBeLessThan(50);
  });

  it('gives the branches above changes, and the first level to open', async () => {
    const { branchesAbove, initialExpansion } = await import('../../src/core/changes.js');
    expect([...branchesAbove(new Set([p('a', 'b', 'c')]))].sort()).toEqual(['', 'a', p('a', 'b')].sort());
    expect([...initialExpansion({ a: 1, b: { c: 1 } })].sort()).toEqual(['', 'a', 'b']);
    expect([...initialExpansion(5)]).toEqual(['']);
  });
});
