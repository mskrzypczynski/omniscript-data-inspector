'use strict';

import {
  inputSize, sizeText, sizeChip, sizeLine, oversizedCount, oversizedText, WARN_BYTES, STRONG_BYTES
} from '../../../src/core/actions/input-size.js';
import { selectionSummary, summaryText } from '../../../src/core/actions/actions-selection.js';

const callWith = (input) => ({ id: 1, action: { input } });

/* An object whose compact JSON is exactly `bytes` long. */
const objectOf = (bytes) => ({ A: 'x'.repeat(bytes - '{"A":""}'.length) });

describe('inputSize', () => {
  it('reads an empty input as nothing', () => {
    for (const input of [undefined, null, '', {}]) {
      expect(inputSize(callWith(input)).level).toBeNull();
    }
    expect(inputSize(callWith(undefined))).toMatchObject({ bytes: 0, keys: 0, kind: 'empty', largest: [] });
    expect(inputSize(callWith({}))).toMatchObject({ bytes: 2, keys: 0, kind: 'object', largest: [] });
    expect(inputSize({})).toMatchObject({ bytes: 0, kind: 'empty' });
    expect(inputSize(null)).toMatchObject({ bytes: 0 });
  });

  it('measures the compact JSON of an object and counts its keys', () => {
    const size = inputSize(callWith({ Id: '001', Items: [1, 2] }));
    expect(size.bytes).toBe('{"Id":"001","Items":[1,2]}'.length);
    expect(size).toMatchObject({ keys: 2, kind: 'object', level: null });
  });

  it('measures a string input as the text it is, not as JSON', () => {
    const size = inputSize(callWith('not { json'));
    expect(size).toMatchObject({ bytes: 10, keys: 0, kind: 'text', largest: [] });
  });

  it('measures a number or boolean input as JSON', () => {
    expect(inputSize(callWith(12345))).toMatchObject({ bytes: 5, keys: 0, kind: 'text', largest: [] });
    expect(inputSize(callWith(false)).bytes).toBe(5);
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(inputSize(callWith('é')).bytes).toBe(2);
    expect(inputSize(callWith('€')).bytes).toBe(3);
    expect(inputSize(callWith('😀')).bytes).toBe(4);
  });

  it('measures nested arrays and lists the items of a top-level array by position', () => {
    const size = inputSize(callWith([[1, 2, 3], [4], { a: 1 }]));
    expect(size.bytes).toBe('[[1,2,3],[4],{"a":1}]'.length);
    expect(size.kind).toBe('array');
    expect(size.keys).toBe(3);
    expect(size.largest.map((item) => item.key)).toEqual(['0', '2', '1']);
  });

  it('lists the five largest top-level keys with their share, biggest first', () => {
    const input = { Big: 'x'.repeat(800), Mid: 'y'.repeat(150), A: 1, B: 2, C: 3, D: 4, E: 5 };
    const size = inputSize(callWith(input));
    expect(size.largest).toHaveLength(5);
    expect(size.largest.map((item) => item.key)).toEqual(['Big', 'Mid', 'A', 'B', 'C']);
    expect(size.largest[0].bytes).toBe(802);
    expect(size.largest[0].percent).toBe(Math.round((802 / size.bytes) * 100));
    expect(size.largest[0].share).toBeGreaterThan(0.8);
    expect(size.largest.every((item) => item.share <= 1)).toBe(true);
  });

  it('never shows 0% for a key that holds something', () => {
    const size = inputSize(callWith({ Big: 'x'.repeat(5000), Tiny: 1 }));
    expect(size.largest[1]).toMatchObject({ key: 'Tiny', percent: 1 });
  });

  it('leaves out keys that hold nothing', () => {
    expect(inputSize(callWith({ A: undefined, B: null })).largest.map((item) => item.key)).toEqual([]);
  });

  it('does not throw on an input JSON cannot write', () => {
    const loop = {};
    loop.self = loop;
    expect(inputSize(callWith(loop))).toMatchObject({ bytes: 0, level: null });
  });

  it('warns from 100 KB and is strong from 1 MB, at the boundaries', () => {
    expect(inputSize(callWith(objectOf(WARN_BYTES - 1))).level).toBeNull();
    expect(inputSize(callWith(objectOf(WARN_BYTES))).level).toBe('warn');
    expect(inputSize(callWith(objectOf(STRONG_BYTES - 1))).level).toBe('warn');
    expect(inputSize(callWith(objectOf(STRONG_BYTES))).level).toBe('strong');
  });

  it('does not count the options', () => {
    const entry = { action: { input: { A: 1 }, options: objectOf(STRONG_BYTES) } };
    expect(inputSize(entry).level).toBeNull();
  });
});

describe('sizeText', () => {
  it('writes bytes, KB and MB with one decimal under 10', () => {
    expect(sizeText(0)).toBe('0 B');
    expect(sizeText(850)).toBe('850 B');
    expect(sizeText(1023)).toBe('1023 B');
    expect(sizeText(1024)).toBe('1.0 KB');
    expect(sizeText(9.5 * 1024)).toBe('9.5 KB');
    expect(sizeText(12 * 1024)).toBe('12 KB');
    expect(sizeText(WARN_BYTES)).toBe('100 KB');
    expect(sizeText(1.2 * 1024 * 1024)).toBe('1.2 MB');
    expect(sizeText(STRONG_BYTES)).toBe('1.0 MB');
    expect(sizeText(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('rolls over to the next unit instead of writing 1024 KB or 10.0 KB', () => {
    expect(sizeText(STRONG_BYTES - 1)).toBe('1.0 MB');
    expect(sizeText(10 * 1024 - 1)).toBe('10 KB');
  });

  it('reads a size that is not a number as 0 B', () => {
    expect(sizeText(NaN)).toBe('0 B');
    expect(sizeText(undefined)).toBe('0 B');
    expect(sizeText(-5)).toBe('0 B');
  });
});

describe('sizeChip', () => {
  it('is null for a small input', () => {
    expect(sizeChip(inputSize(callWith({ A: 1 })))).toBeNull();
  });

  it('names the size and says what limits it', () => {
    const chip = sizeChip(inputSize(callWith(objectOf(Math.round(1.2 * 1024 * 1024)))));
    expect(chip.level).toBe('strong');
    expect(chip.text).toBe('Input 1.2 MB');
    expect(chip.title).toBe('This call sends 1.2 MB; a Data Mapper or procedure usually needs only a few keys. sendJSONPath / sendJSONNode on the action limit what is sent.');
  });

  it('is a warning below 1 MB', () => {
    expect(sizeChip(inputSize(callWith(objectOf(150 * 1024))))).toMatchObject({ level: 'warn', text: 'Input 150 KB' });
  });
});

describe('sizeLine', () => {
  it('says keys and size', () => {
    expect(sizeLine(inputSize(callWith({ A: 1, B: 2 })))).toBe('2 keys · 13 B');
    expect(sizeLine(inputSize(callWith({ A: 1 })))).toBe('1 key · 7 B');
    expect(sizeLine(inputSize(callWith({})))).toBe('0 keys · 2 B');
  });

  it('says items for an array, only the size for a text, nothing for no input', () => {
    expect(sizeLine(inputSize(callWith([1, 2, 3])))).toBe('3 items · 7 B');
    expect(sizeLine(inputSize(callWith('plain text')))).toBe('10 B');
    expect(sizeLine(inputSize(callWith(undefined)))).toBe('');
  });
});

describe('oversizedCount and the selection bar', () => {
  const big = { id: 2, action: { input: objectOf(WARN_BYTES) } };
  const small = { id: 3, action: { input: { A: 1 } } };

  it('counts the calls at or over 100 KB of input', () => {
    expect(oversizedCount([big, small, big])).toBe(2);
    expect(oversizedCount([small])).toBe(0);
    expect(oversizedCount(undefined)).toBe(0);
  });

  it('measures a record once, however often the bar redraws', () => {
    let serialised = 0;
    const input = { big: 'x'.repeat(WARN_BYTES), toJSON() { serialised++; return { big: this.big }; } };
    const record = { id: 9, action: { input } };
    expect(oversizedCount([record])).toBe(1);
    expect(oversizedCount([record])).toBe(1);
    expect(oversizedCount([record])).toBe(1);
    expect(serialised).toBe(1);
  });

  it('writes the sentence only when there is one', () => {
    expect(oversizedText(0)).toBe('');
    expect(oversizedText(1)).toBe('1 call over 100 KB of input');
    expect(oversizedText(3)).toBe('3 calls over 100 KB of input');
  });

  it('is appended to the summary only when non-zero', () => {
    const calls = (list) => list.map((entry, at) => ({ ...entry, time: new Date(1700000000000 + at * 1000), duration: 100, name: 'N' }));
    expect(summaryText(selectionSummary(calls([small])))).toBe('1 call · 100 ms');
    expect(summaryText(selectionSummary(calls([big, small])))).toBe('2 calls · total 200 ms · span 1,100 ms · avg 100 ms · slowest N 100 ms · 1 call over 100 KB of input');
  });
});
