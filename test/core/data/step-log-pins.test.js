'use strict';

import { stepStamp, sinceStepEntry } from '../../../src/core/shared/step-stamp.js';
import { clockText, changeParts, changeText, logLine, logText, logEntries, appendLog, describeValue, MAX_LOG } from '../../../src/core/shared/change-log.js';
import { followPins, GONE, isGonePin, readablePin } from '../../../src/core/data/pin-follow.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { pushSnapshot } from '../../../src/core/shared/history.js';
import { maskValues } from '../../../src/core/shared/mask.js';

describe('stepStamp', () => {
  it('names the step and the start of its current visit', () => {
    const step = { key: 's2', name: 'Step2', visits: [{ key: 's1', from: 100, to: 200 }, { key: 's2', from: 200, to: null }] };
    expect(stepStamp(step)).toEqual({ name: 'Step2', visitFrom: 200 });
  });

  it('uses the latest visit when the script came back to a step', () => {
    const step = { key: 's1', name: 'Step1', visits: [{ key: 's1', from: 100, to: 200 }, { key: 's2', from: 200, to: 300 }, { key: 's1', from: 300, to: null }] };
    expect(stepStamp(step).visitFrom).toBe(300);
  });

  it('is null when no step is known, and has no start for a step never seen', () => {
    expect(stepStamp(null)).toBe(null);
    expect(stepStamp({ key: null, name: '', visits: [] })).toBe(null);
    expect(stepStamp({ key: 's1', name: 'Step1', visits: [] })).toEqual({ name: 'Step1', visitFrom: null });
  });
});

describe('sinceStepEntry', () => {
  const step = { key: 's2', name: 'Step2', visits: [{ key: 's1', from: 0, to: 1000 }, { key: 's2', from: 1000, to: null }] };
  const make = (items) => items.reduce((history, [raw, ms, stamp]) => pushSnapshot(history, raw, new Date(ms), {}, stamp), []);

  it('picks the first snapshot of the current visit and the latest', () => {
    const history = make([
      ['1', 100, { name: 'Step1', visitFrom: 0 }],
      ['2', 1100, { name: 'Step2', visitFrom: 1000 }],
      ['3', 1500, { name: 'Step2', visitFrom: 1000 }],
      ['4', 1900, { name: 'Step2', visitFrom: 1000 }]
    ]);
    const pair = sinceStepEntry(history, step);
    expect(pair.from.raw).toBe('2');
    expect(pair.to.raw).toBe('4');
  });

  it('goes by time for snapshots read before stamps existed', () => {
    const history = make([['1', 100, null], ['2', 1100, null], ['3', 1200, null]]);
    expect(sinceStepEntry(history, step).from.raw).toBe('2');
  });

  it('does not take an earlier visit to the same step', () => {
    const visits = [{ key: 's2', from: 0, to: 500 }, { key: 's1', from: 500, to: 1000 }, { key: 's2', from: 1000, to: null }];
    const history = make([
      ['1', 100, { name: 'Step2', visitFrom: 0 }],
      ['2', 1100, { name: 'Step2', visitFrom: 1000 }],
      ['3', 1200, { name: 'Step2', visitFrom: 1000 }]
    ]);
    expect(sinceStepEntry(history, { key: 's2', name: 'Step2', visits }).from.raw).toBe('2');
  });

  it('is null with no step, with nothing read in the visit, or with only one read in it', () => {
    const history = make([['1', 1100, { name: 'Step2', visitFrom: 1000 }]]);
    expect(sinceStepEntry(history, null)).toBe(null);
    expect(sinceStepEntry([], step)).toBe(null);
    expect(sinceStepEntry(history, step)).toBe(null);
    expect(sinceStepEntry(make([['1', 100, { name: 'Step1', visitFrom: 0 }], ['2', 200, { name: 'Step1', visitFrom: 0 }]]), step)).toBe(null);
  });
});

describe('change log text', () => {
  const entry = { id: 1, time: new Date(2030, 0, 2, 3, 4, 5), step: 'Step2', text: 'Step2.Rows[1].Code', path: 'p', kind: 'changed', before: 'A', after: 'B' };

  it('writes time · step · path · was → now', () => {
    expect(clockText(entry.time)).toBe('03:04:05');
    expect(logLine(entry)).toBe('03:04:05 · Step2 · Step2.Rows[1].Code · "A" → "B"');
  });

  it('shows a dash when no step was known, and names the identity of a row', () => {
    expect(logLine({ ...entry, step: '' })).toContain('03:04:05 · – ·');
    expect(logLine({ ...entry, kind: 'row-added', before: undefined, after: { Id: 1 }, identity: 'Id=1' }))
      .toBe('03:04:05 · Step2 · Step2.Rows[1].Code (Id=1) · row added → {"Id":1}');
    expect(logLine({ ...entry, kind: 'row-removed', before: { Id: 1 }, after: undefined })).toContain('{"Id":1} → row removed');
  });

  it('gives the two sides of was → now apart, and the whole as their join', () => {
    expect(changeParts(entry)).toEqual({ before: '"A"', after: '"B"' });
    expect(changeParts({ ...entry, kind: 'row-added', before: undefined, after: { Id: 1 } })).toEqual({ before: 'row added', after: '{"Id":1}' });
    expect(changeParts({ ...entry, kind: 'row-removed', before: { Id: 1 }, after: undefined })).toEqual({ before: '{"Id":1}', after: 'row removed' });
    expect(changeParts({ ...entry, before: undefined })).toEqual({ before: '—', after: '"B"' });
    expect(changeParts(entry, maskValues)).toEqual({ before: '"<string>"', after: '"<string>"' });
    expect(changeText(entry)).toBe('"A" → "B"');
  });

  it('applies the mask to the values and only to them', () => {
    const line = logLine(entry, maskValues);
    expect(line).toBe('03:04:05 · Step2 · Step2.Rows[1].Code · "<string>" → "<string>"');
    expect(logText([entry, entry], maskValues).split('\n')).toHaveLength(2);
  });

  it('shortens a long value', () => {
    expect(describeValue('x'.repeat(200)).length).toBeLessThan(90);
    expect(describeValue(undefined)).toBe('—');
  });

  it('keeps the last MAX_LOG entries', () => {
    const found = Array.from({ length: MAX_LOG + 20 }, (_, i) => ({ path: 'p', text: 'p', kind: 'changed', before: i, after: i + 1 }));
    const added = logEntries(found, new Date(0), { name: 'S' }, 1);
    expect(added).toHaveLength(MAX_LOG);
    expect(added[0].id).toBe(1);
    const log = appendLog(appendLog([], added), added);
    expect(log).toHaveLength(MAX_LOG);
    expect(appendLog(log, [])).toBe(log);
  });
});

describe('followPins', () => {
  const rows = (ids) => ids.map((id) => ({ Id: id, Code: `c-${id}` }));
  const at = (...parts) => parts.join(SEP);

  it('moves a pin to where its row went', () => {
    const { pins, moved } = followPins({ R: rows(['a', 'b', 'c']) }, { R: rows(['b', 'c']) }, [at('R', 1, 'Code')]);
    expect(pins).toEqual([at('R', 0, 'Code')]);
    expect(moved.get(at('R', 1, 'Code'))).toBe(at('R', 0, 'Code'));
  });

  it('leaves a pin whose row stayed, and a pin on a plain key', () => {
    const { pins, moved } = followPins({ R: rows(['a', 'b']), K: 1 }, { R: rows(['a', 'b']), K: 2 }, [at('R', 1, 'Code'), 'K']);
    expect(pins).toEqual([at('R', 1, 'Code'), 'K']);
    expect(moved.size).toBe(0);
  });

  it('sends a pin whose row was removed somewhere that holds no value', () => {
    const { pins } = followPins({ R: rows(['a', 'b']) }, { R: rows(['a']) }, [at('R', 1, 'Code')]);
    expect(pins[0].startsWith(at('R', GONE))).toBe(true);
    expect(pins[0].endsWith(`${SEP}Code`)).toBe(true);
    expect(isGonePin(pins[0])).toBe(true);
  });

  it('never puts the removed row\'s Id or Name into the pin', () => {
    const before = { R: [{ Name: 'secret-name', Code: 1 }, { Name: 'other', Code: 2 }] };
    const { pins } = followPins(before, { R: [{ Name: 'other', Code: 2 }] }, [at('R', 0, 'Code')]);
    expect(pins[0]).not.toContain('secret-name');
    expect(readablePin(pins[0])).toBe('R.(removed row).Code');
  });

  it('keeps two pins on different removed rows apart', () => {
    const { pins } = followPins({ R: rows(['a', 'b', 'c']) }, { R: rows(['c']) }, [at('R', 0, 'Code'), at('R', 1, 'Code')]);
    expect(new Set(pins).size).toBe(2);
  });

  it('keeps the position when rows have no identity', () => {
    const { pins, moved } = followPins({ R: [{ n: 1 }, { n: 2 }, { n: 3 }] }, { R: [{ n: 2 }, { n: 3 }] }, [at('R', 1, 'n')]);
    expect(pins).toEqual([at('R', 1, 'n')]);
    expect(moved.size).toBe(0);
  });

  it('follows through nested arrays and keeps one pin when two land together', () => {
    const before = { A: [{ Id: 'x', B: rows(['p', 'q']) }] };
    const after = { A: [{ Id: 'x', B: rows(['q']) }] };
    expect(followPins(before, after, [at('A', 0, 'B', 1, 'Code')]).pins).toEqual([at('A', 0, 'B', 0, 'Code')]);
    const both = followPins({ R: rows(['a', 'b']) }, { R: rows(['b']) }, [at('R', 1), at('R', 0)]);
    expect(both.pins.filter((p) => p === at('R', 0))).toHaveLength(1);
  });

  it('copes with a path that no longer fits the data', () => {
    expect(followPins({ A: 1 }, { A: { x: 1 } }, [at('A', 'x')]).pins).toEqual([at('A', 'x')]);
    expect(followPins({}, {}, [''])).toEqual({ pins: [''], moved: new Map() });
  });
});
