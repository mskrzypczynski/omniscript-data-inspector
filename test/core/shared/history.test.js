'use strict';

import { pushSnapshot, addImported, snapshotChoices, defaultPair } from '../../../src/core/shared/history.js';

describe('pushSnapshot', () => {
  const t = (n) => new Date(n);

  it('appends new payloads and ignores a repeat of the newest', () => {
    let h = [];
    h = pushSnapshot(h, '{"a":1}', t(1));
    h = pushSnapshot(h, '{"a":1}', t(2));
    h = pushSnapshot(h, '{"a":2}', t(3));
    expect(h.map((x) => x.raw)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('does not mutate the array it is given', () => {
    const h = [];
    pushSnapshot(h, 'x', t(1));
    expect(h).toEqual([]);
  });

  it('drops the oldest beyond the count limit', () => {
    let h = [];
    for (let i = 0; i < 5; i++) h = pushSnapshot(h, `p${i}`, t(i), { maxCount: 3 });
    expect(h.map((x) => x.raw)).toEqual(['p2', 'p3', 'p4']);
  });

  it('drops the oldest beyond the size limit but always keeps the newest', () => {
    let h = [];
    h = pushSnapshot(h, 'aaaa', t(1), { maxChars: 10 });
    h = pushSnapshot(h, 'bbbb', t(2), { maxChars: 10 });
    h = pushSnapshot(h, 'cccc', t(3), { maxChars: 10 });
    expect(h.map((x) => x.raw)).toEqual(['bbbb', 'cccc']);
    expect(pushSnapshot([], 'x'.repeat(50), t(4), { maxChars: 10 })).toHaveLength(1);
  });

  it('ignores non-text input', () => {
    expect(pushSnapshot([], null, t(1))).toEqual([]);
  });
});

describe('snapshots from files', () => {
  const t = (n) => new Date(n);

  it('adds a valid file with a label and ignores invalid or oversized text', () => {
    const list = addImported([], 'before.json', '{"a":1}', t(1));
    expect(list).toEqual([{ raw: '{"a":1}', time: t(1), label: 'file: before.json' }]);
    expect(addImported(list, 'x.json', '{nope', t(2))).toBe(list);
    expect(addImported(list, 'x.json', null, t(2))).toBe(list);
    expect(addImported(list, 'big.json', '"aaaaaaaaaa"', t(2), { maxChars: 5 })).toBe(list);
  });

  it('keeps only the newest few files and does not mutate its input', () => {
    const start = [];
    let list = start;
    for (let i = 0; i < 4; i++) list = addImported(list, `f${i}.json`, '1', t(i), { maxCount: 3 });
    expect(start).toEqual([]);
    expect(list.map((x) => x.label)).toEqual(['file: f1.json', 'file: f2.json', 'file: f3.json']);
  });

  it('lists live reads before files', () => {
    expect(snapshotChoices([1, 2], [3])).toEqual([1, 2, 3]);
  });

  it('picks the default pair from the live reads, falling back on a file', () => {
    expect(defaultPair([1, 2, 3], [9])).toEqual([2, 3]);
    expect(defaultPair([3], [8, 9])).toEqual([9, 3]);
    expect(defaultPair([], [8, 9])).toEqual([8, 9]);
    expect(defaultPair([], [])).toEqual([undefined, undefined]);
  });

  it('does not let a file be pushed out by live reads', () => {
    const files = addImported([], 'keep.json', '1', t(1));
    let live = [];
    for (let i = 0; i < 30; i++) live = pushSnapshot(live, String(i), t(i));
    expect(snapshotChoices(live, files).some((s) => s.label === 'file: keep.json')).toBe(true);
  });
});
