'use strict';

import { stickyAncestors, STICKY_MAX } from '../../../src/core/shared/sticky-path.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

/* A small tree written as the rows the view lists:
 *   Payload                          0
 *     A                              1
 *       B                            2
 *         C                          3
 *           x                        4
 *           y                        4
 *         }                          (closing of C)
 *       z                            3 ... */
const row = (path, depth, closing = false) => ({ path, depth, closing });
const rows = [
  row('', 0), // 0 root
  row('A', 1), // 1
  row(`A${SEP}B`, 2), // 2
  row(`A${SEP}B${SEP}C`, 3), // 3
  row(`A${SEP}B${SEP}C${SEP}D`, 4), // 4
  row(`A${SEP}B${SEP}C${SEP}D${SEP}x`, 5), // 5
  row(`A${SEP}B${SEP}C${SEP}D${SEP}x`, 5, true), // 6 (a fake closing line of a leaf, as a nested end)
  row(`A${SEP}B${SEP}C${SEP}D`, 4, true), // 7 closes D
  row(`A${SEP}B${SEP}C`, 3, true), // 8 closes C
  row(`A${SEP}B${SEP}Z`, 3), // 9 sibling of C under B
  row(`A${SEP}B`, 2, true), // 10 closes B
  row('A', 1, true), // 11 closes A
  row('K', 1), // 12 second top-level key
  row(`K${SEP}m`, 2), // 13
  row('', 0, true) // 14 closes the root
];
const paths = (list) => list.map((entry) => entry.path);

describe('stickyAncestors', () => {
  it('lists the ancestors of the top row, outermost first, without the root', () => {
    expect(paths(stickyAncestors(rows, 3))).toEqual(['A', `A${SEP}B`]);
  });

  it('keeps only the nearest three', () => {
    expect(STICKY_MAX).toBe(3);
    expect(paths(stickyAncestors(rows, 5))).toEqual([`A${SEP}B`, `A${SEP}B${SEP}C`, `A${SEP}B${SEP}C${SEP}D`]);
    expect(paths(stickyAncestors(rows, 5, 2))).toEqual([`A${SEP}B${SEP}C`, `A${SEP}B${SEP}C${SEP}D`]);
  });

  it('is empty for a top-level row, the root and anything out of range', () => {
    expect(stickyAncestors(rows, 1)).toEqual([]);
    expect(stickyAncestors(rows, 12)).toEqual([]);
    expect(stickyAncestors(rows, 0)).toEqual([]);
    expect(stickyAncestors(rows, -1)).toEqual([]);
    expect(stickyAncestors(rows, 99)).toEqual([]);
    expect(stickyAncestors(rows, 1.5)).toEqual([]);
    expect(stickyAncestors([], 0)).toEqual([]);
    expect(stickyAncestors(undefined, 0)).toEqual([]);
  });

  it('does not take the closing line of an earlier branch for an ancestor', () => {
    // Z is a sibling of C: its ancestors are A and B, not C (whose closing line precedes it).
    expect(paths(stickyAncestors(rows, 9))).toEqual(['A', `A${SEP}B`]);
  });

  it('counts the branch itself for its own closing line', () => {
    expect(paths(stickyAncestors(rows, 8))).toEqual(['A', `A${SEP}B`, `A${SEP}B${SEP}C`]);
    expect(paths(stickyAncestors(rows, 11))).toEqual(['A']);
  });

  it('leaves the previous branch behind when the next top-level key starts', () => {
    expect(paths(stickyAncestors(rows, 13))).toEqual(['K']);
  });

  it('copes with a tree cut down by a filter, where only some rows exist', () => {
    const filtered = [row('', 0), row('A', 1), row(`A${SEP}B${SEP}C`, 3), row('K', 1), row(`K${SEP}m`, 2)];
    expect(paths(stickyAncestors(filtered, 2))).toEqual(['A']);
  });
});
