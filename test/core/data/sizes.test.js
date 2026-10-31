'use strict';

import { topSizes, sizeTree, sizeTreeAt, rankSizes, sizesHeading, listPaging, SIZES_ALL_MAX, pathPieces, zoomWithUnused, TOP_SIZES, SIZES_STEP } from '../../../src/core/data/sizes.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

describe('topSizes', () => {
  it('measures compact JSON, the same as JSON.stringify, for every path', () => {
    const value = { a: 'hello', b: [1, 22, 333], c: { d: null, e: true, f: 'é"x' }, g: {}, h: [] };
    const { items, total } = topSizes(value, 100);
    expect(total).toBe(JSON.stringify(value).length);
    const bySize = Object.fromEntries(items.map((item) => [item.path, item.size]));
    expect(bySize.a).toBe(JSON.stringify('hello').length);
    expect(bySize.b).toBe(JSON.stringify(value.b).length);
    expect(bySize.c).toBe(JSON.stringify(value.c).length);
    expect(bySize[`c${SEP}f`]).toBe(JSON.stringify('é"x').length);
    expect(bySize.g).toBe(2);
    expect(bySize[`b${SEP}1`]).toBe(2);
  });

  it('lists the largest first with their share of the whole, and leaves the root out', () => {
    const value = { big: 'x'.repeat(900), small: 'y', mid: 'z'.repeat(80) };
    const { items, total } = topSizes(value, 2);
    expect(items.map((item) => item.path)).toEqual(['big', 'mid']);
    expect(items[0].size).toBe(902);
    expect(items[0].percent).toBe(Math.round((902 / total) * 1000) / 10);
    expect(items.some((item) => item.path === '')).toBe(false);
  });

  it('returns at most 20 by default, even for a payload with thousands of paths', () => {
    const value = { rows: Array.from({ length: 5000 }, (_, i) => ({ id: i, text: 'x'.repeat(i % 50) })) };
    const { items, nodes } = topSizes(value);
    expect(items).toHaveLength(TOP_SIZES);
    expect(nodes).toBe(1 + 1 + 5000 * 3);
    const sizes = items.map((item) => item.size);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('agrees with a brute-force ranking', () => {
    const value = { rows: Array.from({ length: 300 }, (_, i) => ({ id: i, text: 'x'.repeat((i * 7) % 31), tags: Array(i % 4).fill('t') })) };
    const brute = [];
    const walk = (node, path) => {
      if (path) brute.push({ path, size: JSON.stringify(node).length });
      if (node && typeof node === 'object') Object.keys(node).forEach((key) => walk(node[key], path ? path + SEP + key : key));
    };
    walk(value, '');
    const expected = brute.map((entry, order) => ({ ...entry, order })).sort((a, b) => b.size - a.size || a.order - b.order).slice(0, 20);
    expect(topSizes(value).items.map(({ path, size }) => ({ path, size }))).toEqual(expected.map(({ path, size }) => ({ path, size })));
  });

  it('copes with a scalar, an empty value and very deep nesting', () => {
    expect(topSizes(5)).toEqual({ items: [], total: 1, nodes: 1 });
    expect(topSizes({}).items).toEqual([]);
    let deep = 'x';
    for (let i = 0; i < 400; i++) deep = { a: deep };
    expect(() => topSizes(deep)).not.toThrow();
  });

  it('has no percent to give for an empty payload', () => {
    expect(topSizes([]).total).toBe(2);
    expect(topSizes({ a: '' }).items[0].percent).toBe(Math.round((2 / 8) * 1000) / 10);
  });
});

describe('sizeTree', () => {
  it('lists the top-level keys largest first with their payload index', () => {
    const value = { a: 'x', b: 'y'.repeat(50), c: { d: 'z'.repeat(20) } };
    const { groups, total } = sizeTree(value);
    expect(total).toBe(JSON.stringify(value).length);
    expect(groups.map((group) => group.key)).toEqual(['b', 'c', 'a']);
    expect(groups.map((group) => group.index)).toEqual([1, 2, 0]);
    expect(groups[0].size).toBe(JSON.stringify('y'.repeat(50)).length);
  });

  it('keeps children of 2% or more, largest first, and counts the rest as other', () => {
    const value = { big: { main: 'm'.repeat(400), mid: 'n'.repeat(100), tiny: 1 } };
    const [group] = sizeTree(value).groups;
    expect(group.children.map((child) => child.key)).toEqual(['main', 'mid']);
    expect(group.children[0].path).toBe(`big${SEP}main`);
    const kept = group.children.reduce((sum, child) => sum + child.size, 0);
    expect(group.other).toBe(group.size - kept);
    expect(group.other).toBeGreaterThan(0);
  });

  it('measures array items by index and limits the number of children', () => {
    const value = { rows: Array.from({ length: 20 }, () => 'v'.repeat(10)) };
    const [group] = sizeTree(value, { maxChildren: 5 }).groups;
    expect(group.children).toHaveLength(5);
    expect(group.children[0].key).toBe('0');
    expect(group.children[0].size).toBe(12);
  });

  it('has no children for a scalar key and counts keys past the limit as rest', () => {
    const value = { a: 'aaaa', b: 'bbbbbbbb', c: 'c' };
    const tree = sizeTree(value, { maxGroups: 2 });
    expect(tree.groups.map((group) => group.key)).toEqual(['b', 'a']);
    expect(tree.groups[0]).toMatchObject({ children: [], other: 0 });
    expect(tree.rest).toEqual({ count: 1, size: 3 });
  });

  it('gives nothing for a scalar or empty payload', () => {
    expect(sizeTree(5).groups).toEqual([]);
    expect(sizeTree({}).groups).toEqual([]);
    expect(sizeTree([]).total).toBe(2);
  });
});

describe('sizeTreeAt', () => {
  const plan = { Id: 'p'.repeat(40), Name: 'n'.repeat(120), Items: [{ Code: 'c'.repeat(60) }, { Code: 'd'.repeat(30) }] };
  const value = { Small: 1, PlanSelection: plan };

  it('is the whole chart for the root', () => {
    const whole = sizeTree(value);
    expect(sizeTreeAt(value, '')).toEqual({ ...whole, size: whole.total });
  });

  it('lays out the children of one key, with full tree paths', () => {
    const tree = sizeTreeAt(value, 'PlanSelection', { total: JSON.stringify(value).length });
    expect(tree.groups.map((group) => group.path)).toEqual([`PlanSelection${SEP}Name`, `PlanSelection${SEP}Items`, `PlanSelection${SEP}Id`]);
    expect(tree.size).toBe(JSON.stringify(plan).length);
    expect(tree.total).toBe(JSON.stringify(value).length);
    const items = tree.groups.find((group) => group.key === 'Items');
    expect(items.children.map((child) => child.path)).toEqual([`PlanSelection${SEP}Items${SEP}0`, `PlanSelection${SEP}Items${SEP}1`]);
  });

  it('falls back to the zoomed size as the total when none is given', () => {
    const tree = sizeTreeAt(value, 'PlanSelection');
    expect(tree.total).toBe(tree.size);
  });

  it('is null where there is nothing to zoom into', () => {
    expect(sizeTreeAt(value, 'Small')).toBeNull();
    expect(sizeTreeAt(value, 'Gone')).toBeNull();
    expect(sizeTreeAt(value, `PlanSelection${SEP}Id`)).toBeNull();
  });
});

describe('rankSizes', () => {
  const data = {
    Plan: { Name: 'n'.repeat(80), Items: [{ Code: 'c'.repeat(300), Label: 'l'.repeat(100) }, { Code: 'd'.repeat(20) }], Empty: {} },
    Small: 1
  };
  const whole = JSON.stringify(data).length;

  it('at the root ranks the top-level keys only, each with the size of everything under it', () => {
    const ranked = rankSizes(data, '', 20);
    expect(ranked.items.map((item) => item.path)).toEqual(['Plan', 'Small']);
    expect(ranked.items[0]).toMatchObject({ path: 'Plan', kids: 3, size: JSON.stringify(data.Plan).length });
    expect(ranked.items[1]).toMatchObject({ path: 'Small', kids: 0, size: 1 });
    expect(ranked.total).toBe(whole);
    expect(ranked.size).toBe(whole);
    expect(ranked.count).toBe(2);
    expect(ranked.array).toBe(false);
    expect(ranked.items.every((item) => typeof item.kids === 'number')).toBe(true);
  });

  it('never mixes depths at the root: a deep path is no row, however big', () => {
    const deep = { a: { b: { c: 'x'.repeat(900) } }, z: 'y'.repeat(20), m: 'm'.repeat(40) };
    const ranked = rankSizes(deep, '', 20);
    expect(ranked.items.map((item) => item.path)).toEqual(['a', 'm', 'z']);
    expect(ranked.items.some((item) => item.path.includes(SEP))).toBe(false);
  });

  it('lists at the root exactly what a drill into the whole data gives: the same rows, sizes and shares', () => {
    const keys = Object.keys(data);
    const root = rankSizes(data, '', 20);
    const viaChildren = keys.map((key) => ({ path: key, size: JSON.stringify(data[key]).length }))
      .sort((a, b) => b.size - a.size);
    expect(root.items.map(({ path, size }) => ({ path, size }))).toEqual(viaChildren);
    root.items.forEach((item) => expect(item.percent).toBe(Math.round((item.size / whole) * 1000) / 10));
  });

  it('cuts the root to the count asked for and keeps how many keys exist', () => {
    const ranked = rankSizes({ a: 'aaaa', b: 'bb', c: 'c' }, '', 2);
    expect(ranked.items.map((item) => item.path)).toEqual(['a', 'b']);
    expect(ranked.count).toBe(3);
  });

  it('says a list is a list, at the root and drilled', () => {
    expect(rankSizes([{ a: 1 }, { b: 2 }], '', 20).array).toBe(true);
    expect(rankSizes([{ a: 1 }, { b: 2 }], '', 20).items.map((item) => item.path)).toEqual(['0', '1']);
    expect(rankSizes({ L: [1, 2, 3] }, 'L', 20).array).toBe(true);
    expect(rankSizes(data, 'Plan', 20).array).toBe(false);
  });

  it('has no rows for a payload that is a scalar or empty, and does not throw', () => {
    expect(rankSizes(5, '', 20)).toMatchObject({ items: [], count: 0, total: 1 });
    expect(rankSizes({}, '', 20)).toMatchObject({ items: [], count: 0, total: 2 });
    expect(rankSizes(undefined, '', 20).items).toEqual([]);
  });

  it('drilled into a node ranks its direct children, with shares of the whole data', () => {
    const ranked = rankSizes(data, 'Plan', 20, whole);
    expect(ranked.items.map((item) => item.path)).toEqual([`Plan${SEP}Items`, `Plan${SEP}Name`, `Plan${SEP}Empty`]);
    expect(ranked.size).toBe(JSON.stringify(data.Plan).length);
    expect(ranked.total).toBe(whole);
    expect(ranked.count).toBe(3);
    expect(ranked.items[0].size).toBe(JSON.stringify(data.Plan.Items).length);
    expect(ranked.items[0].percent).toBe(Math.round((ranked.items[0].size / whole) * 1000) / 10);
    expect(ranked.items.map((item) => item.kids)).toEqual([2, 0, 0]);
  });

  it('measures the whole data itself when the caller does not give its size', () => {
    expect(rankSizes(data, 'Plan').total).toBe(whole);
  });

  it('cuts to the count asked for and keeps the count of what exists', () => {
    const ranked = rankSizes(data, `Plan${SEP}Items`, 1, whole);
    expect(ranked.items).toHaveLength(1);
    expect(ranked.count).toBe(2);
    expect(rankSizes(data, 'Plan', 0, whole).items).toEqual([]);
    expect(SIZES_STEP).toBe(20);
  });

  it('is null where the path is gone or holds a scalar', () => {
    expect(rankSizes(data, 'Gone')).toBeNull();
    expect(rankSizes(data, 'Small')).toBeNull();
  });
});

describe('sizesHeading', () => {
  it('says how many of the keys are listed, for the whole data, without a word about depth', () => {
    expect(sizesHeading({ shown: 20, count: 143, size: 126464, total: 126464 })).toBe('Largest 20 of 143 keys · whole data 123.5 KB');
    expect(sizesHeading({ shown: 5, count: 5, size: 900, total: 900 })).toBe('All 5 keys · whole data 900 B');
    expect(sizesHeading({ shown: 1, count: 1, size: 9, total: 9 })).toMatch(/^All 1 key ·/);
    expect(sizesHeading({ shown: 20, count: 143, size: 126464, total: 126464 })).not.toMatch(/depth/);
  });

  it('calls the children of a list items', () => {
    expect(sizesHeading({ label: 'Rows', shown: 3, count: 9, size: 90, total: 900, array: true }))
      .toBe('Largest 3 of 9 items in Rows · 90 B, 10% of the data');
    expect(sizesHeading({ shown: 1, count: 1, size: 9, total: 9, array: true })).toMatch(/^All 1 item ·/);
  });

  it('says only where it is for the treemap', () => {
    expect(sizesHeading({ size: 2048, total: 2048 })).toBe('Whole data · 2.0 KB');
    expect(sizesHeading({ label: 'Plan', size: 1024, total: 4096 })).toBe('Plan · 1.0 KB, 25% of the data');
  });

  it('names the node drilled into, its size and its share', () => {
    expect(sizesHeading({ label: 'PlanSelection:AddOns', shown: 20, count: 40, size: 1024, total: 10240 }))
      .toBe('Largest 20 of 40 keys in PlanSelection:AddOns · 1.0 KB, 10% of the data');
  });
});

describe('listPaging', () => {
  it('offers 20 more and all while rows are left, and no way back at the first 20', () => {
    expect(listPaging(20, 100)).toEqual({ more: 20, all: 100, capped: false, fewer: false, reachable: 100 });
  });

  it('offers only the rest when less than a step remains, and then all would add nothing', () => {
    expect(listPaging(20, 27)).toMatchObject({ more: 7, all: 0, fewer: false });
    expect(listPaging(20, 40)).toMatchObject({ more: 20, all: 0 });
  });

  it('offers Show fewer, and nothing else, once everything is listed', () => {
    expect(listPaging(40, 40)).toMatchObject({ more: 0, all: 0, fewer: true });
    expect(listPaging(100, 100)).toMatchObject({ more: 0, all: 0, fewer: true });
  });

  it('offers Show fewer beside the rest while some are still left', () => {
    expect(listPaging(40, 100)).toMatchObject({ more: 20, all: 100, fewer: true });
  });

  it('stops Show all at the cap and says so', () => {
    expect(listPaging(20, 2100)).toMatchObject({ more: 20, all: SIZES_ALL_MAX, capped: true });
    expect(listPaging(SIZES_ALL_MAX, 2100)).toMatchObject({ more: 0, all: 0, capped: true, fewer: true });
  });

  it('offers nothing for a short list, and counts rows listed, not the number asked for', () => {
    expect(listPaging(20, 12)).toMatchObject({ more: 0, all: 0, fewer: false });
    expect(listPaging(60, 25)).toMatchObject({ more: 0, all: 0, fewer: true }); // a drill into a smaller node keeps the old step
    expect(listPaging(60, 15)).toMatchObject({ more: 0, all: 0, fewer: false });
    expect(listPaging(0, 0)).toMatchObject({ more: 0, all: 0, fewer: false });
  });
});

describe('pathPieces', () => {
  it('cuts a path after each colon, so it wraps between keys', () => {
    expect(pathPieces('PlanSelection:AddOns|2:Options|1:Details'))
      .toEqual(['PlanSelection:', 'AddOns|2:', 'Options|1:', 'Details']);
    expect(pathPieces('Plan')).toEqual(['Plan']);
    expect(pathPieces('')).toEqual([]);
    expect(pathPieces('a::b').join('')).toBe('a::b');
  });
});

describe('zoomWithUnused', () => {
  it('leaves a drill when Unused is on, and keeps it otherwise', () => {
    const at = ['Plan', 'Items'].join(SEP);
    expect(zoomWithUnused(at, true)).toBe('');
    expect(zoomWithUnused(at, false)).toBe(at);
    expect(zoomWithUnused('', true)).toBe('');
    expect(zoomWithUnused(undefined, false)).toBe('');
  });
});
