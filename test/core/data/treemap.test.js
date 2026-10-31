'use strict';

import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { treemapLayout, planTreemap, stableSlots, cellLabel, treemapCrumbs, treemapParent, TREEMAP_SLOTS } from '../../../src/core/data/treemap.js';
import { sizeTree } from '../../../src/core/data/sizes.js';

const EPS = 1e-6;
const area = (cell) => cell.w * cell.h;

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > EPS && h > EPS ? w * h : 0;
}

function checkTiling(cells, box) {
  cells.forEach((cell) => {
    expect(cell.x).toBeGreaterThan(box.x - EPS);
    expect(cell.y).toBeGreaterThan(box.y - EPS);
    expect(cell.x + cell.w).toBeLessThan(box.x + box.w + EPS);
    expect(cell.y + cell.h).toBeLessThan(box.y + box.h + EPS);
  });
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j])).toBe(0);
  }
}

describe('treemapLayout', () => {
  const sample = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: `k${i}`, value }));

  it('gives every item an area in proportion to its value', () => {
    const cells = treemapLayout(sample, 600, 400);
    const total = sample.reduce((sum, item) => sum + item.value, 0);
    expect(cells).toHaveLength(sample.length);
    cells.forEach((cell) => {
      expect(area(cell) / (600 * 400)).toBeCloseTo(cell.value / total, 6);
    });
  });

  it('fills the box exactly, without overlap and inside its bounds', () => {
    const cells = treemapLayout(sample, 600, 400);
    checkTiling(cells, { x: 0, y: 0, w: 600, h: 400 });
    expect(cells.reduce((sum, cell) => sum + area(cell), 0)).toBeCloseTo(600 * 400, 4);
  });

  it('holds for tall, wide, tiny and lopsided inputs', () => {
    const cases = [
      [[{ value: 1 }], 100, 50],
      [Array.from({ length: 40 }, (_, i) => ({ value: (i % 7) + 1 })), 90, 700],
      [Array.from({ length: 40 }, (_, i) => ({ value: (i % 5) + 1 })), 900, 60],
      [[{ value: 1000 }, { value: 1 }, { value: 1 }, { value: 0.01 }], 321, 123]
    ];
    cases.forEach(([items, w, h]) => {
      const cells = treemapLayout(items, w, h);
      expect(cells).toHaveLength(items.length);
      checkTiling(cells, { x: 0, y: 0, w, h });
      const total = items.reduce((sum, item) => sum + item.value, 0);
      cells.forEach((cell) => expect(area(cell) / (w * h)).toBeCloseTo(cell.value / total, 6));
    });
  });

  it('lists the largest first, keeps ties in input order and carries the item along', () => {
    const cells = treemapLayout([{ id: 'a', value: 1 }, { id: 'b', value: 3 }, { id: 'c', value: 1 }], 100, 100);
    expect(cells.map((cell) => cell.id)).toEqual(['b', 'a', 'c']);
  });

  it('keeps cells reasonably square', () => {
    const cells = treemapLayout(Array.from({ length: 12 }, () => ({ value: 5 })), 480, 480);
    cells.forEach((cell) => expect(Math.max(cell.w / cell.h, cell.h / cell.w)).toBeLessThan(2.5));
  });

  it('leaves out items without a positive value and copes with an empty box', () => {
    expect(treemapLayout([{ value: 0 }, { value: -2 }, { value: NaN }], 100, 100)).toEqual([]);
    expect(treemapLayout([{ value: 3 }], 0, 100)).toEqual([]);
    expect(treemapLayout([], 100, 100)).toEqual([]);
    expect(treemapLayout([{ value: 3 }, { value: 0 }], 100, 40)).toHaveLength(1);
  });
});

describe('planTreemap', () => {
  const payload = {
    Alpha: { Rows: Array.from({ length: 30 }, (_, i) => ({ Id: i, Name: 'x'.repeat(10) })), Note: 'short', Tiny: 1 },
    Beta: 'y'.repeat(500),
    Gamma: { A: 'z'.repeat(80), B: 'z'.repeat(60) },
    Delta: 1
  };

  it('lays the top-level keys out with their share of the payload', () => {
    const tree = sizeTree(payload);
    const cells = planTreemap(tree, 640, 360);
    expect(cells.map((cell) => cell.key).sort()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    checkTiling(cells, { x: 0, y: 0, w: 640, h: 360 });
    cells.forEach((cell) => expect(cell.percent).toBe(Math.round((cell.size / tree.total) * 1000) / 10));
  });

  it('colours by the key position in the payload, not by size', () => {
    const cells = planTreemap(sizeTree(payload), 640, 360);
    const slot = Object.fromEntries(cells.map((cell) => [cell.key, cell.slot]));
    expect(slot).toEqual({ Alpha: 1, Beta: 2, Gamma: 3, Delta: 4 });
    const swapped = planTreemap(sizeTree({ ...payload, Beta: 'y' }), 640, 360);
    expect(Object.fromEntries(swapped.map((cell) => [cell.key, cell.slot]))).toEqual(slot);
  });

  it('nests the children of a roomy cell inside it, below the header, and they add up to the parent', () => {
    const cells = planTreemap(sizeTree(payload), 640, 360);
    const alpha = cells.find((cell) => cell.key === 'Alpha');
    expect(alpha.header).toBeGreaterThan(0);
    expect(alpha.children.length).toBeGreaterThan(0);
    const inner = { x: alpha.x, y: alpha.y + alpha.header, w: alpha.w, h: alpha.h - alpha.header };
    checkTiling(alpha.children, inner);
    expect(alpha.children.reduce((sum, child) => sum + child.size, 0)).toBe(alpha.size);
  });

  it('gives a child only when it holds 2% of its parent, and sums the rest as other', () => {
    const tree = sizeTree({ Big: { Main: 'm'.repeat(1000), Small: 's'.repeat(5), Other: 'o'.repeat(300) } });
    const [group] = tree.groups;
    expect(group.children.map((child) => child.key)).toEqual(['Main', 'Other']);
    expect(group.other).toBe(group.size - group.children.reduce((sum, child) => sum + child.size, 0));
    const [cell] = planTreemap(tree, 400, 300);
    const other = cell.children.find((child) => child.other);
    expect(other).toMatchObject({ key: 'other', path: 'Big' });
    expect(other.size).toBe(group.other);
  });

  it('draws a cell too small for children, or with none, as one block', () => {
    const cells = planTreemap(sizeTree(payload), 640, 360);
    const delta = cells.find((cell) => cell.key === 'Delta');
    expect(delta.header).toBe(0);
    expect(delta.children).toEqual([]);
    const crowded = planTreemap(sizeTree(payload), 60, 40).filter((cell) => cell.children.length);
    expect(crowded).toEqual([]);
  });

  it('folds the keys past the limit into one cell that points nowhere', () => {
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'.repeat(10 + i)]));
    const tree = sizeTree(wide);
    expect(tree.groups).toHaveLength(16);
    expect(tree.rest.count).toBe(14);
    const cells = planTreemap(tree, 640, 360);
    const rest = cells.find((cell) => cell.rest);
    expect(rest).toMatchObject({ key: '14 more', path: null, slot: 0 });
    checkTiling(cells, { x: 0, y: 0, w: 640, h: 360 });
  });

  it('shares the neutral slot between every key past the eighth', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'v'.repeat(20)]));
    const slots = planTreemap(sizeTree(many), 640, 360).map((cell) => cell.slot);
    expect(Math.max(...slots)).toBe(TREEMAP_SLOTS);
    expect(slots.filter((slot) => slot === 0)).toHaveLength(4);
  });

  it('plans nothing for a payload without values', () => {
    expect(planTreemap(sizeTree({}), 640, 360)).toEqual([]);
    expect(planTreemap(sizeTree(5), 640, 360)).toEqual([]);
  });
});

describe('cellLabel', () => {
  it('writes key and size when they fit, the key when only it fits, else a cut key', () => {
    expect(cellLabel('Name', '12 B', 200, 30)).toBe('Name · 12 B');
    expect(cellLabel('Name', '12 B', 50, 30)).toBe('Name');
    expect(cellLabel('LongKeyName', '12 B', 50, 30)).toBe('LongKe…');
    expect(cellLabel('Name', '12 B', 12, 30)).toBe('');
    expect(cellLabel('Name', '12 B', 200, 8)).toBe('');
  });
});

describe('zooming', () => {
  const tree = sizeTree({ Plan: { A: 'a'.repeat(300), B: 'b'.repeat(200) }, Flat: 'f'.repeat(100), Tiny: [] });

  it('marks the cells that have children to zoom into', () => {
    const cells = planTreemap(tree, 600, 300);
    const byKey = Object.fromEntries(cells.map((cell) => [cell.key, cell.zoomable]));
    expect(byKey).toEqual({ Plan: true, Flat: false, Tiny: false });
  });

  it('keeps a key zoomable even when its cell is too small to show its children', () => {
    const cells = planTreemap(tree, 40, 20);
    expect(cells.find((cell) => cell.key === 'Plan').zoomable).toBe(true);
    expect(cells.find((cell) => cell.key === 'Plan').children).toEqual([]);
  });

  it('never makes the "more" cell zoomable', () => {
    const many = {};
    for (let i = 0; i < 20; i++) many[`K${i}`] = { v: 'x'.repeat(10 + i) };
    const rest = planTreemap(sizeTree(many), 800, 400).find((cell) => cell.rest);
    expect(rest.zoomable).toBe(false);
  });
});

describe('treemapCrumbs', () => {
  const S = '/';

  it('is just the root without a path', () => {
    expect(treemapCrumbs('', S)).toEqual([{ label: 'Data', path: '' }]);
  });

  it('adds one crumb per key, each leading back to its path', () => {
    expect(treemapCrumbs('Plan/Items/0', S)).toEqual([
      { label: 'Data', path: '' },
      { label: 'Plan', path: 'Plan' },
      { label: 'Items', path: 'Plan/Items' },
      { label: '0', path: 'Plan/Items/0' }
    ]);
  });

  it('names a step as the rows below name it: a repeat-block position counts from 1', () => {
    const data = { Step: { One: { Matrix: [{ Code: 'a' }, { Code: 'b' }] } } };
    const path = ['Step', 'One', 'Matrix', '1', 'Code'].join(SEP);
    expect(treemapCrumbs(path, SEP, 'Data', data).map((crumb) => crumb.label)).toEqual(['Data', 'Step', 'One', 'Matrix', '|2', 'Code']);
    /* the raw keys, as before, when no data is given */
    expect(treemapCrumbs(path, SEP).map((crumb) => crumb.label)).toEqual(['Data', 'Step', 'One', 'Matrix', '1', 'Code']);
    expect(treemapCrumbs(path, SEP, 'Data', data).map((crumb) => crumb.path)[4]).toBe(['Step', 'One', 'Matrix', '1'].join(SEP));
  });

  it('keeps a step of a path that is gone readable', () => {
    expect(treemapCrumbs(['Gone', '3'].join(SEP), SEP, 'Data', {}).map((crumb) => crumb.label)).toEqual(['Data', 'Gone', '3']);
  });

  it('names the root as asked, and finds the parent path', () => {
    expect(treemapCrumbs('', S, 'Everything')[0].label).toBe('Everything');
    expect(treemapParent('Plan/Items', S)).toBe('Plan');
    expect(treemapParent('Plan', S)).toBe('');
    expect(treemapParent('', S)).toBe('');
  });
});

describe('stableSlots', () => {
  it('gives the first eight keys their rank, and the rest the neutral slot', () => {
    const keys = Array.from({ length: 10 }, (_, i) => `k${i}`);
    const slots = stableSlots(keys, new Map());
    expect(keys.map((key) => slots.get(key))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0, 0]);
  });

  it('keeps a key\'s colour when other keys grow past it or come and go', () => {
    const remembered = new Map();
    stableSlots(['Plan', 'Rows', 'Notes'], remembered);
    const later = stableSlots(['Rows', 'Extra', 'Plan'], remembered);
    expect(later.get('Plan')).toBe(1);
    expect(later.get('Rows')).toBe(2);
    expect(later.get('Extra')).toBe(3); // a new key takes a slot nobody on screen holds
  });

  it('frees the slot of a key that is no longer shown', () => {
    const remembered = new Map();
    stableSlots(['a', 'b'], remembered);
    const later = stableSlots(['b', 'c'], remembered);
    expect(later.get('b')).toBe(2);
    expect(later.get('c')).toBe(1);
  });

  it('is what planTreemap colours the cells by, when given', () => {
    const tree = { total: 30, groups: [
      { path: 'A', key: 'A', size: 20, index: 0, children: [], other: 0 },
      { path: 'B', key: 'B', size: 10, index: 1, children: [], other: 0 }
    ], rest: { count: 0, size: 0 } };
    const slots = new Map([['A', 5], ['B', 3]]);
    expect(planTreemap(tree, 200, 100, slots).map((cell) => cell.slot)).toEqual([5, 3]);
    expect(planTreemap(tree, 200, 100).map((cell) => cell.slot)).toEqual([1, 2]);
  });
});
