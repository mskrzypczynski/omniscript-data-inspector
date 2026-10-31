'use strict';

import {
  buildDiffTree, listDifferences, maskRows, maskDifferences, changeHighlight, differenceSentence, previewText,
  scalarText, mergeKeys, unifiedRows, nextStop, footText, countPills, changesOf, pathToDifference, DIFF_LIMIT
} from '../../../src/core/shared/diff-tree.js';
import { diffValues } from '../../../src/core/shared/diff.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const BEFORE = {
  Applicant: {
    K1: 1, K2: 2, K3: 3, K4: 4, K5: 5, K6: 6, K7: 7, K8: 8, K9: 9,
    'Consents:HasCard': false, DueDate: null, Plan: 'Standard', LegacyId: 'A-1024',
    Coverages: [{ Id: 'c1', Limit: 1 }, { Id: 'c2', Limit: 50000, Code: 'Y', B: 1, C: 2 }]
  }
};
const AFTER = {
  Applicant: {
    K1: 1, K2: 2, K3: 3, K4: 4, K5: 5, K6: 6, K7: 7, K8: 8, K9: 9,
    'Consents:HasCard': true, DueDate: '', Plan: 'Gold', Discount: 10,
    Coverages: [{ Id: 'c1', Limit: 1 }, { Id: 'c2', Limit: 75000, Code: 'Y', B: 1, C: 2 }, { Id: 'c3', Code: 'SPORT', Limit: 20000 }]
  }
};

/* "kind left | right" per row, for a compact expectation. */
const shape = (rows) => rows.map((row) => `${row.kind} ${row.left ? `${row.left.label}${row.left.label ? ': ' : ''}${row.left.text}` : '·'} | ${row.right ? `${row.right.label}${row.right.label ? ': ' : ''}${row.right.text}` : '·'}`);

describe('buildDiffTree', () => {
  it('lines the two values up row by row, with the unchanged keys folded and the changes in place', () => {
    const tree = buildDiffTree(BEFORE, AFTER);
    expect(shape(tree.rows)).toEqual([
      'same { | {',
      'same Applicant: { | Applicant: {',
      'fold … 9 unchanged keys | … 9 unchanged keys',
      'changed Consents:HasCard: false | Consents:HasCard: true',
      'changed DueDate: null | DueDate: ""',
      'changed Plan: "Standard" | Plan: "Gold"',
      'added · | Discount: 10',
      'removed LegacyId: "A-1024" | ·',
      'same Coverages: [ | Coverages: [',
      'same |1: { Id: "c1", Limit: 1 } | |1: { Id: "c1", Limit: 1 }',
      'same |2: { | |2: {',
      'same Id: "c2" | Id: "c2"',
      'changed Limit: 50000 | Limit: 75000',
      'fold … 3 unchanged keys | … 3 unchanged keys',
      'same } | }',
      'added · | |3: { Id: "c3", Code: "SPORT", Limit: 20000 }',
      'same ] | ]',
      'same } | }',
      'same } | }'
    ]);
    expect(tree.counts).toEqual({ changed: 4, added: 2, removed: 1 });
    expect(tree.truncated).toBe(false);
  });

  it('numbers each side as its Raw view does, an added key where After has it', () => {
    const { rows } = buildDiffTree(BEFORE, AFTER);
    const lines = (side) => rows.map((row) => (row[side] ? row[side].line : '-'));
    expect(lines('left')).toEqual([1, 2, null, 12, 13, 14, '-', 15, 16, 17, 21, 22, 23, null, 27, '-', 28, 29, 30]);
    expect(lines('right')).toEqual([1, 2, null, 12, 13, 14, 15, '-', 16, 17, 21, 22, 23, null, 27, 28, 33, 34, 35]);
    const raw = JSON.stringify(AFTER, null, 2).split('\n');
    expect(raw[15 - 1].trim()).toBe('"Discount": 10,');
    expect(raw[28 - 1].trim()).toBe('{');
  });

  it('lists the differences in the order of the rows, each with a sentence, and agrees with diffValues on what differs', () => {
    const tree = buildDiffTree(BEFORE, AFTER);
    expect(tree.differences.map((difference) => difference.sentence)).toEqual([
      'Applicant:Consents:HasCard changed: false → true',
      'Applicant:DueDate changed: null → ""',
      'Applicant:Plan changed: "Standard" → "Gold"',
      'Applicant:Discount added: 10',
      'Applicant:LegacyId removed',
      'Applicant:Coverages|2:Limit changed: 50000 → 75000',
      'row Applicant:Coverages Id=c3 added'
    ]);
    const flat = diffValues(BEFORE, AFTER).changes;
    const key = (change) => `${change.kind} ${change.path}`;
    expect(changesOf(tree.differences).map(key).sort()).toEqual(flat.map(key).sort());
    // Each difference points at the row that shows it.
    tree.differences.forEach((difference, index) => {
      expect(tree.rows.find((row) => row.id === difference.rowId).diff).toBe(index);
    });
  });

  it('opens a branch with a difference inside and keeps an unchanged one closed', () => {
    const tree = buildDiffTree({ A: { x: 1 }, B: { y: 1 } }, { A: { x: 2 }, B: { y: 1 } });
    expect(shape(tree.rows)).toEqual(['same { | {', 'same A: { | A: {', 'changed x: 1 | x: 2', 'same } | }', 'same B: { y: 1 } | B: { y: 1 }', 'same } | }']);
    expect(tree.rows[1].open).toBe(true);
    expect(tree.rows[4]).toMatchObject({ container: true, open: false });
  });

  it('follows the open map for branches and folds', () => {
    const before = { A: { x: 1 }, B: { y: 1 }, C: 1, D: 2, E: 3 };
    const after = { A: { x: 2 }, B: { y: 1 }, C: 1, D: 2, E: 3 };
    const closed = buildDiffTree(before, after, { open: new Map([['kA', false]]) });
    expect(shape(closed.rows)).toEqual(['same { | {', 'same A: { x: 1 } | A: { x: 2 }', 'fold … 4 unchanged keys | … 4 unchanged keys', 'same } | }']);
    const fold = closed.rows[2];
    expect(fold.count).toBe(4);
    const opened = buildDiffTree(before, after, { open: { [fold.id]: true, kB: true } });
    expect(shape(opened.rows)).toEqual([
      'same { | {', 'same A: { | A: {', 'changed x: 1 | x: 2', 'same } | }',
      'same B: { | B: {', 'same y: 1 | y: 1', 'same } | }', 'same C: 1 | C: 1', 'same D: 2 | D: 2', 'same E: 3 | E: 3', 'same } | }'
    ]);
  });

  it('keeps the differences in reading order when a branch holding some is closed', () => {
    const before = { A: { x: 1 }, B: 1 };
    const after = { A: { x: 2 }, B: 2 };
    const closed = buildDiffTree(before, after, { open: { kA: false } });
    expect(closed.differences.map((difference) => [difference.sentence, difference.drawn])).toEqual([['A:x changed: 1 → 2', false], ['B changed: 1 → 2', true]]);
    expect(closed.rows.find((row) => row.id === 'kB').diff).toBe(1);
  });

  it('shows every unchanged key with showUnchanged, unchanged branches still closed', () => {
    const tree = buildDiffTree({ a: 1, b: 2, c: { d: 1 }, e: 3 }, { a: 1, b: 2, c: { d: 1 }, e: 4 }, { showUnchanged: true });
    expect(shape(tree.rows)).toEqual(['same { | {', 'same a: 1 | a: 1', 'same b: 2 | b: 2', 'same c: { d: 1 } | c: { d: 1 }', 'changed e: 3 | e: 4', 'same } | }']);
  });

  it('opens the root of two equal values with showUnchanged', () => {
    expect(shape(buildDiffTree({ a: 1 }, { a: 1 }).rows)).toEqual(['same { a: 1 } | { a: 1 }']);
    expect(shape(buildDiffTree({ a: 1 }, { a: 1 }, { showUnchanged: true }).rows)).toEqual(['same { | {', 'same a: 1 | a: 1', 'same } | }']);
  });

  it('does not fold a single unchanged key: the fold line would take its place for nothing', () => {
    const tree = buildDiffTree({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(shape(tree.rows)).toEqual(['same { | {', 'same a: 1 | a: 1', 'changed b: 2 | b: 3', 'same } | }']);
  });

  it('counts rows, not keys, in an array fold', () => {
    const tree = buildDiffTree([1, 2, 3, 4], [1, 2, 3, 5]);
    expect(shape(tree.rows)).toEqual(['same [ | [', 'fold … 3 unchanged rows | … 3 unchanged rows', 'changed |4: 4 | |4: 5', 'same ] | ]']);
  });

  it('matches rows of an array by Id, so a removed row is one gap, not a change in every row after it', () => {
    const before = { Rows: [{ Id: 5, v: 'a' }, { Id: 7, v: 'b' }, { Id: 9, v: 'c' }] };
    const after = { Rows: [{ Id: 5, v: 'a' }, { Id: 9, v: 'c' }] };
    const tree = buildDiffTree(before, after);
    expect(shape(tree.rows)).toEqual([
      'same { | {', 'same Rows: [ | Rows: [', 'same |1: { Id: 5, v: "a" } | |1: { Id: 5, v: "a" }',
      'removed |2: { Id: 7, v: "b" } | ·', 'same |3: { Id: 9, v: "c" } | |2: { Id: 9, v: "c" }', 'same ] | ]', 'same } | }'
    ]);
    expect(tree.differences.map((difference) => difference.sentence)).toEqual(['row Rows Id=7 removed']);
    expect(tree.counts).toEqual({ changed: 0, added: 0, removed: 1 });
  });

  it('writes a row added to an array that is the whole value as "row |2 added"', () => {
    const tree = buildDiffTree([{ a: 1 }], [{ a: 1 }, { a: 2 }]);
    expect(tree.differences[0].sentence).toBe('row |2 added');
    expect(differenceSentence({ path: [6], kind: 'row-removed', identity: 'Id=7' })).toBe('row Id=7 removed');
  });

  it('opens a row only one side has on request, every row of it on that side alone', () => {
    const before = { Rows: [{ Id: 1 }] };
    const after = { Rows: [{ Id: 1 }, { Id: 2, Tags: ['x'] }] };
    const closed = buildDiffTree(before, after);
    const added = closed.rows.find((row) => row.kind === 'added');
    expect(added).toMatchObject({ container: true, open: false, left: null });
    const opened = buildDiffTree(before, after, { open: { [added.id]: true } });
    expect(shape(opened.rows).slice(3, 7)).toEqual(['added · | |2: {', 'added · | Id: 2', 'added · | Tags: [ "x" ]', 'added · | }']);
    expect(opened.rows.filter((row) => row.diff !== undefined)).toHaveLength(1);
  });

  it('handles nested changes, with the containers to open for each difference', () => {
    const tree = buildDiffTree({ A: { B: { C: { D: 1 } } } }, { A: { B: { C: { D: 2 } } } });
    const [difference] = tree.differences;
    expect(difference.sentence).toBe('A:B:C:D changed: 1 → 2');
    expect(difference.ancestors).toEqual(['', 'kA', 'kA\u001fkB', 'kA\u001fkB\u001fkC']);
    expect(pathToDifference(difference)).toEqual(difference.ancestors);
    expect(tree.rows.find((row) => row.diff === 0).depth).toBe(4);
  });

  it('compares two plain values as one row', () => {
    expect(shape(buildDiffTree('a', 'b').rows)).toEqual(['changed "a" | "b"']);
    expect(shape(buildDiffTree(3, 3).rows)).toEqual(['same 3 | 3']);
    expect(buildDiffTree(false, true).differences[0].sentence).toBe('(root) changed: false → true');
  });

  it('reads a side that is not there at all as added or removed', () => {
    const added = buildDiffTree(undefined, { a: 1 });
    expect(shape(added.rows)).toEqual(['added · | { a: 1 }']);
    expect(added.counts).toEqual({ changed: 0, added: 1, removed: 0 });
    const removed = buildDiffTree({ a: 1 }, undefined);
    expect(shape(removed.rows)).toEqual(['removed { a: 1 } | ·']);
    expect(removed.differences[0].sentence).toBe('(root) removed');
    expect(buildDiffTree(undefined, undefined).rows).toEqual([]);
  });

  it('shows a value that became a branch as one changed row', () => {
    const tree = buildDiffTree({ a: 'x' }, { a: { b: 1 } });
    expect(shape(tree.rows)).toEqual(['same { | {', 'changed a: "x" | a: { b: 1 }', 'same } | }']);
  });

  it('opens an empty object that gained a key', () => {
    expect(shape(buildDiffTree({ o: {} }, { o: { a: 1 } }).rows)).toEqual(['same { | {', 'same o: { | o: {', 'added · | a: 1', 'same } | }', 'same } | }']);
  });

  it('caps the differences at the flat list\'s limit and stops the rows after the last one it knows', () => {
    const before = {};
    const after = {};
    for (let i = 0; i < DIFF_LIMIT + 20; i++) { before[`k${i}`] = i; after[`k${i}`] = i + 1; }
    const tree = buildDiffTree(before, after);
    expect(tree.differences).toHaveLength(DIFF_LIMIT);
    expect(tree.truncated).toBe(true);
    expect(tree.rows.filter((row) => row.kind === 'fold')).toHaveLength(0);
    // The root row and a row per difference: the rows run out one short.
    expect(tree.rows).toHaveLength(DIFF_LIMIT);
    expect(tree.rows.at(-1).diff).toBe(DIFF_LIMIT - 2);
    expect(tree.differences.at(-1).drawn).toBe(false);
    expect(footText(tree.differences, 0, true)).toBe(`Difference 1 of ${DIFF_LIMIT}+ · k0 changed: 0 → 1`);
  });

  it('caps the rows too, and says so', () => {
    const value = {};
    for (let i = 0; i < 40; i++) value[`k${i}`] = i;
    const tree = buildDiffTree(value, { ...value, k39: 'x' }, { showUnchanged: true, limit: 10 });
    expect(tree.rows).toHaveLength(10);
    expect(tree.truncated).toBe(true);
    expect(tree.differences[0].drawn).toBe(false);
  });
});

describe('listDifferences', () => {
  it('reports the differences as walkDiff finds them, with addresses that tell a removed row from a kept one', () => {
    const { differences } = listDifferences([{ a: 1 }, { a: 2 }], [{ a: 2 }]);
    expect(differences.map((difference) => [difference.kind, difference.address])).toEqual([['row-removed', 'a0']]);
  });
});

describe('maskRows and maskDifferences', () => {
  it('mask the values the way maskChange does, keys and structure kept', () => {
    const tree = buildDiffTree({ Name: 'Ann', Age: 30, Ok: true, Rows: [{ Id: 'r1', Note: '' }] }, { Name: 'Bob', Age: 30, Ok: false, Rows: [{ Id: 'r1', Note: '' }, { Id: 'r2', Note: 'n' }] });
    const masked = maskRows(tree.rows, maskValues);
    expect(shape(masked)).toEqual([
      'same { | {',
      'changed Name: "<string>" | Name: "<string>"',
      'same Age: "<number>" | Age: "<number>"',
      'changed Ok: true | Ok: false',
      'same Rows: [ | Rows: [',
      'same |1: { Id: "<string>", Note: "" } | |1: { Id: "<string>", Note: "" }',
      'added · | |2: { Id: "<string>", Note: "<string>" }',
      'same ] | ]',
      'same } | }'
    ]);
    expect(shape(tree.rows)[1]).toBe('changed Name: "Ann" | Name: "Bob"');
    const sentences = maskDifferences(tree.differences, maskValues).map((difference) => difference.sentence);
    expect(sentences).toEqual(['Name changed: "<string>" → "<string>"', 'Ok changed: true → false', 'row Rows Id=<string> added']);
  });
});

describe('changeHighlight', () => {
  it('marks a short value, a number, a flag or null whole', () => {
    expect(changeHighlight('false', 'true', false, true)).toEqual({ before: { start: 0, end: 5 }, after: { start: 0, end: 4 } });
    expect(changeHighlight('50000', '75000', 50000, 75000)).toEqual({ before: { start: 0, end: 5 }, after: { start: 0, end: 5 } });
    expect(changeHighlight('null', '""', null, '')).toEqual({ before: { start: 0, end: 4 }, after: { start: 0, end: 2 } });
    expect(changeHighlight('"Standard"', '"Gold"', 'Standard', 'Gold')).toEqual({ before: { start: 0, end: 10 }, after: { start: 0, end: 6 } });
  });

  it('marks the part that differs inside two long strings', () => {
    expect(changeHighlight('"order-1234-a"', '"order-1299-a"', 'order-1234-a', 'order-1299-a')).toEqual({ before: { start: 9, end: 11 }, after: { start: 9, end: 11 } });
  });

  it('leaves two long texts that share nothing unmarked', () => {
    expect(changeHighlight('"aaaaaaaaaaaaaa"', 'bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb')).toEqual({ before: { start: 0, end: 0 }, after: { start: 0, end: 0 } });
  });
});

describe('texts', () => {
  it('writes scalars as the tree does and closed containers as a short preview', () => {
    expect(scalarText('a')).toBe('"a"');
    expect(scalarText(null)).toBe('null');
    expect(scalarText(true)).toBe('true');
    expect(previewText({ Code: 'SPORT', Limit: 20000 })).toBe('{ Code: "SPORT", Limit: 20000 }');
    expect(previewText([1, { a: 1 }, []])).toBe('[ 1, {…}, [] ]');
    expect(previewText({})).toBe('{}');
    expect(previewText({ a: 'x'.repeat(100), b: 1 })).toBe('{ … }');
    expect(scalarText('x'.repeat(2000)).length).toBe(1001);
  });

  it('merges the keys in reading order', () => {
    expect(mergeKeys(['A', 'L', 'P'], ['A', 'N', 'P', 'D'])).toEqual(['A', 'N', 'L', 'P', 'D']);
    expect(mergeKeys(['B'], ['Z', 'B'])).toEqual(['Z', 'B']);
  });

  it('says where the reader is in the foot', () => {
    const { differences } = buildDiffTree({ a: 1 }, { a: 2 });
    expect(footText(differences, 0)).toBe('Difference 1 of 1 · a changed: 1 → 2');
    expect(footText(differences, null)).toBe('1 difference · Next (↓) goes to the first');
    expect(footText([], null)).toBe('No differences.');
  });

  it('gives a pill per count that is not zero', () => {
    expect(countPills({ changed: 7, added: 0, removed: 1 })).toEqual([
      { tone: 'changed', count: 7, text: '7 changed' }, { tone: 'removed', count: 1, text: '1 removed' }
    ]);
  });
});

describe('unifiedRows and nextStop', () => {
  it('puts a change on two lines, Before above After, and keeps the rest on one', () => {
    const { rows } = buildDiffTree({ a: 1, b: 2, c: 3, gone: 1 }, { a: 1, b: 2, c: 4, fresh: 1 });
    expect(unifiedRows(rows).map((line) => `${line.tone}:${line.side}:${line.row.kind}`)).toEqual([
      'same:right:same', 'fold:right:fold', 'removed:left:changed', 'added:right:changed', 'added:right:added', 'removed:left:removed', 'same:right:same'
    ]);
  });

  it('steps from difference to difference, stopping on folds', () => {
    const { rows } = buildDiffTree({ a: 1, b: 2, c: 3, d: 9 }, { a: 1, b: 2, c: 4, d: 8 });
    // { / fold / c / d / }
    expect(nextStop(rows, -1, 1)).toBe(1);
    expect(nextStop(rows, 1, 1)).toBe(2);
    expect(nextStop(rows, 3, 1)).toBe(-1);
    expect(nextStop(rows, 3, -1)).toBe(2);
  });
});
