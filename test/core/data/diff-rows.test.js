'use strict';

import { diffValues } from '../../../src/core/shared/diff.js';
import { alignRows, identityKey, LCS_MAX_ROWS } from '../../../src/core/shared/diff-walk.js';
import { detectChanges, changedPaths } from '../../../src/core/data/changes.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const rows = (n, make = (i) => ({ Id: `r${i}`, Code: `c${i}` })) => Array.from({ length: n }, (_, i) => make(i));
const kinds = (result) => result.changes.map((c) => c.kind);

describe('identityKey', () => {
  it('picks the first of Id, id, Name, name, key, Key that every row has once', () => {
    expect(identityKey([{ Id: 1, Name: 'a' }, { Id: 2, Name: 'b' }])).toBe('Id');
    expect(identityKey([{ id: 1 }, { id: 2 }])).toBe('id');
    expect(identityKey([{ Name: 'a' }, { Name: 'b' }])).toBe('Name');
    expect(identityKey([{ Key: 'a' }, { Key: 'b' }])).toBe('Key');
  });

  it('skips a key that repeats and uses the next one', () => {
    expect(identityKey([{ Id: 1, Name: 'a' }, { Id: 1, Name: 'b' }])).toBe('Name');
  });

  it('needs every row to be an object with that key holding a string or number', () => {
    expect(identityKey([{ Id: 1 }, { Code: 2 }])).toBe(null);
    expect(identityKey([{ Id: 1 }, 'text'])).toBe(null);
    expect(identityKey([{ Id: 1 }, null])).toBe(null);
    expect(identityKey([{ Id: { x: 1 } }, { Id: { x: 2 } }])).toBe(null);
    expect(identityKey([{ Id: 1 }, [1]])).toBe(null);
    expect(identityKey([])).toBe(null);
  });
});

describe('diffValues on arrays of rows with an identity', () => {
  it('reports removing row 1 of 300 as one removed row, not 599 changes', () => {
    const before = { Rows: rows(300) };
    const after = { Rows: before.Rows.filter((_, i) => i !== 1) };
    const { changes, truncated } = diffValues(before, after);
    expect(truncated).toBe(false);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'Rows|2', kind: 'row-removed', index: 1, identity: 'Id=r1' });
    expect(changes[0].before).toEqual({ Id: 'r1', Code: 'c1' });
  });

  it('reports a row added in the middle as one added row at its new position', () => {
    const before = { Rows: rows(5) };
    const after = { Rows: [...before.Rows.slice(0, 2), { Id: 'new', Code: 'x' }, ...before.Rows.slice(2)] };
    const { changes } = diffValues(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'Rows|3', kind: 'row-added', index: 2, identity: 'Id=new' });
  });

  it('diffs inside a row that moved, at its new position', () => {
    const before = { Rows: rows(4) };
    const after = { Rows: [before.Rows[0], { Id: 'r2', Code: 'changed' }, before.Rows[3]] }; // r1 gone; r2 moved up and edited
    const { changes } = diffValues(before, after);
    expect(changes.map((c) => [c.path, c.kind])).toEqual([['Rows|2', 'row-removed'], ['Rows|2:Code', 'changed']]);
    expect(changes[1]).toMatchObject({ path: 'Rows|2:Code', before: 'c2', after: 'changed' });
  });

  it('is empty when the same rows come back in another order with no edits', () => {
    const before = { Rows: rows(4) };
    const after = { Rows: [before.Rows[2], before.Rows[0], before.Rows[3], before.Rows[1]] };
    // Each row matched by Id; position changes alone are not value changes.
    expect(diffValues(before, after).changes).toEqual([]);
  });

  it('works when Name is the identity', () => {
    const before = { L: [{ Name: 'a', v: 1 }, { Name: 'b', v: 2 }] };
    const after = { L: [{ Name: 'b', v: 2 }] };
    const { changes } = diffValues(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'row-removed', identity: 'Name=a' });
  });

  it('does not use an identity that repeats: it falls back to the content match', () => {
    const before = { L: [{ Id: 1, v: 'a' }, { Id: 1, v: 'b' }, { Id: 1, v: 'c' }] };
    const after = { L: [{ Id: 1, v: 'a' }, { Id: 1, v: 'c' }] };
    const { changes } = diffValues(before, after);
    expect(kinds({ changes })).toEqual(['row-removed']);
    expect(changes[0].path).toBe('L|2');
    expect(changes[0].identity).toBeUndefined();
  });
});

describe('diffValues on arrays without an identity', () => {
  it('reports one removed row among 300 when only the middle differs', () => {
    const base = rows(300, (i) => ({ n: i }));
    const { changes } = diffValues({ R: base }, { R: base.filter((_, i) => i !== 1) });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: 'R|2', kind: 'row-removed', before: { n: 1 } });
  });

  it('finds a removed row and an added row apart in a small array', () => {
    const { changes } = diffValues({ R: ['a', 'b', 'c', 'd'] }, { R: ['a', 'c', 'd', 'e'] });
    expect(changes.map((c) => [c.path, c.kind])).toEqual([['R|2', 'removed'], ['R|4', 'added']]);
  });

  it('treats a row edited in place as a change inside it', () => {
    const { changes } = diffValues({ R: [{ a: 1 }, { a: 2 }, { a: 3 }] }, { R: [{ a: 1 }, { a: 9 }, { a: 3 }] });
    expect(changes).toEqual([{ path: 'R|2:a', kind: 'changed', before: 2, after: 9 }]);
  });

  it('reports a swap of two rows as removed and added, not as edits of both', () => {
    const { changes } = diffValues({ R: [{ a: 1 }, { a: 2 }] }, { R: [{ a: 2 }, { a: 1 }] });
    expect(kinds({ changes }).sort()).toEqual(['row-added', 'row-removed']);
  });

  it('adds every row of an array that was empty and removes every row of one that became empty', () => {
    expect(kinds(diffValues({ R: [] }, { R: [{ a: 1 }, { a: 2 }] }))).toEqual(['row-added', 'row-added']);
    expect(kinds(diffValues({ R: [{ a: 1 }, { a: 2 }] }, { R: [] }))).toEqual(['row-removed', 'row-removed']);
  });

  it('calls a scalar that came or went an added or removed value, not a row', () => {
    expect(kinds(diffValues({ R: [] }, { R: [1, 2] }))).toEqual(['added', 'added']);
    expect(kinds(diffValues({ R: ['a', 'b'] }, { R: ['a'] }))).toEqual(['removed']);
  });

  it('falls back to positions when a rewritten stretch is too large to align', () => {
    const size = LCS_MAX_ROWS + 50;
    const before = { R: rows(size, (i) => ({ n: i })) };
    const after = { R: rows(size, (i) => ({ n: i + 1000 })) }; // every row differs
    const { changes } = diffValues(before, after, 1000);
    expect(changes).toHaveLength(size);
    expect(changes.every((c) => c.kind === 'changed' && /^R\|\d+:n$/.test(c.path))).toBe(true);
  });

  it('stops at the limit and says so', () => {
    const { changes, truncated } = diffValues({ R: [] }, { R: rows(50) }, 10);
    expect(changes).toHaveLength(10);
    expect(truncated).toBe(true);
  });
});

describe('alignRows', () => {
  it('lists the operations in reading order', () => {
    const { ops, key } = alignRows([{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }], [{ Id: 'a' }, { Id: 'x' }, { Id: 'c' }]);
    expect(key).toBe('Id');
    expect(ops).toEqual([{ a: 0, b: 0 }, { a: 1 }, { b: 1 }, { a: 2, b: 2 }]);
  });
});

describe('detectChanges', () => {
  it('marks added rows and changed values, keeps the old values, and counts removed rows apart', () => {
    const before = { Rows: rows(4), Name: 'x' };
    const after = { Rows: [before.Rows[0], { Id: 'r2', Code: 'edited' }, before.Rows[3], { Id: 'n', Code: 'new' }], Name: 'y' };
    const found = detectChanges(before, after);
    expect(found.counts).toEqual({ updated: 2, rowsAdded: 1, rowsRemoved: 1 });
    expect([...found.paths].sort()).toEqual(['Name', `Rows${SEP}1${SEP}Code`, `Rows${SEP}3`].sort());
    expect(found.before.get(`Rows${SEP}1${SEP}Code`)).toBe('c2');
    expect(found.before.get('Name')).toBe('x');
    expect(found.truncated).toBe(false);
  });

  it('names the array that lost a row, so the log can reveal something that exists', () => {
    const found = detectChanges({ Rows: rows(3) }, { Rows: rows(2) });
    expect(found.entries).toHaveLength(1);
    expect(found.entries[0]).toMatchObject({ kind: 'row-removed', path: 'Rows', text: 'Rows|3', identity: 'Id=r2' });
    expect(found.paths.size).toBe(0);
  });

  it('says when it stopped at the limit', () => {
    const a = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 0]));
    const b = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]));
    const found = detectChanges(a, b, 10);
    expect(found.paths.size).toBe(10);
    expect(found.truncated).toBe(true);
    expect(changedPaths(a, b, 10).size).toBe(10);
  });

  it('keeps the old rules for keys and types', () => {
    const found = detectChanges({ a: { x: 1 }, gone: 1, t: [1] }, { a: { x: 2 }, fresh: 1, t: { 0: 1 } });
    expect([...found.paths].sort()).toEqual([`a${SEP}x`, 'fresh', 'gone', 't'].sort());
    expect(found.counts).toEqual({ updated: 4, rowsAdded: 0, rowsRemoved: 0 });
  });
});
