'use strict';

import { findRepeats, repeatIds, repeatLabel, repeatTitle, sameInputHint, REPEAT_WINDOW_MS } from '../../../src/core/actions/actions-repeats.js';
import { groupChains } from '../../../src/core/actions/actions-chains.js';
import { buildActionRecord, badgeSummary, matchesFilter } from '../../../src/core/shared/actions-model.js';
import { parseQuery, hasQuery } from '../../../src/core/shared/actions-search.js';

const T0 = Date.UTC(2024, 0, 1, 10, 42, 0);

function call(id, { at = 0, key = 'Order_Place', input = { Id: '001', Qty: 2 }, options = {}, remoteClass = 'omnistudiocore.IPService' } = {}) {
  const action = { remoteClass, remoteMethod: key, apexClass: '', apexMethod: '', descriptor: '', input, options };
  return buildActionRecord(id, 'aura', action, 0, { returnValue: { returnValue: { ok: true } } }, {
    url: 'https://x.example/aura', startedAt: new Date(T0 + at), durationMs: 100, httpStatus: 200, bodySize: 5, requestId: id, batchSize: 1
  });
}

describe('findRepeats', () => {
  it('marks a call with the same name, input and options within the window as a repeat of the first', () => {
    const repeats = findRepeats([call(1, { at: 0 }), call(2, { at: 1000 })]);
    expect([...repeats]).toEqual([[2, { ofId: 1, count: 2, prevId: 1, sameInput: true }]]);
  });

  it('counts the place in the run, measuring the window from the previous call', () => {
    const repeats = findRepeats([call(1, { at: 0 }), call(2, { at: 4000 }), call(3, { at: 8000 }), call(4, { at: 12000 })]);
    expect(repeats.get(3)).toEqual({ ofId: 1, count: 3, prevId: 2, sameInput: true });
    expect(repeats.get(4)).toEqual({ ofId: 1, count: 4, prevId: 3, sameInput: true });
    expect(repeats.has(1)).toBe(false);
  });

  it('starts a new run once the gap exceeds the window, and honours a custom window', () => {
    expect(findRepeats([call(1, { at: 0 }), call(2, { at: REPEAT_WINDOW_MS })]).size).toBe(1);
    expect(findRepeats([call(1, { at: 0 }), call(2, { at: REPEAT_WINDOW_MS + 1 })]).size).toBe(0);
    expect(findRepeats([call(1, { at: 0 }), call(2, { at: 800 })], 500).size).toBe(0);
    const apart = findRepeats([call(1, { at: 0 }), call(2, { at: 10000 }), call(3, { at: 11000 })]);
    expect(apart.get(3)).toEqual({ ofId: 2, count: 2, prevId: 2, sameInput: true });
  });

  it('does not count a call whose input, options, name or signature differ', () => {
    expect(findRepeats([call(1), call(2, { at: 500, input: { Id: '002', Qty: 2 } })]).size).toBe(0);
    expect(findRepeats([call(1), call(2, { at: 500, options: { chainable: true } })]).size).toBe(0);
    expect(findRepeats([call(1), call(2, { at: 500, key: 'Order_Cancel' })]).size).toBe(0);
    expect(findRepeats([call(1), call(2, { at: 500, remoteClass: 'vlocity_ins.IPService' })]).size).toBe(0);
  });

  it('compares inputs deeply and ignores the order of keys', () => {
    const a = call(1, { input: { a: { x: 1, y: [1, 2] }, b: 2 } });
    const b = call(2, { at: 500, input: { b: 2, a: { y: [1, 2], x: 1 } } });
    const c = call(3, { at: 900, input: { b: 2, a: { y: [2, 1], x: 1 } } });
    const repeats = findRepeats([a, b, c]);
    expect(repeats.has(2)).toBe(true);
    expect(repeats.has(3)).toBe(false);
  });

  it('finds repeats among other calls in between', () => {
    const repeats = findRepeats([call(1), call(2, { at: 100, key: 'Other_Call' }), call(3, { at: 200 })]);
    expect([...repeats.keys()]).toEqual([3]);
  });

  it('never makes repeats of the hops of one chain', () => {
    const hops = [
      call(1, { at: 0, options: { chainable: true } }),
      call(2, { at: 500, options: { chainable: true } }),
      call(3, { at: 1000, options: { chainable: true } })
    ];
    expect(findRepeats(hops).size).toBe(2);
    const chains = groupChains(hops);
    expect(chains).toHaveLength(1);
    expect(findRepeats(hops, undefined, chains).size).toBe(0);
  });

  it('copes with nothing and with values that cannot be written as JSON', () => {
    expect(findRepeats([]).size).toBe(0);
    expect(findRepeats(undefined).size).toBe(0);
    const loop = {};
    loop.self = loop;
    expect(() => findRepeats([call(1, { input: loop }), call(2, { at: 100, input: loop })])).not.toThrow();
  });
});

describe('repeat helpers', () => {
  it('lists the repeated calls and the ones they repeat', () => {
    const repeats = findRepeats([call(1), call(2, { at: 100 }), call(3, { at: 200, key: 'Solo' })]);
    expect([...repeatIds(repeats)].sort()).toEqual([1, 2]);
  });

  it('words the tag and its tooltip', () => {
    expect(repeatLabel({ ofId: 1, count: 3 })).toBe('repeat ×3');
    expect(repeatTitle('10:42:03')).toBe('Same procedure and input as the call at 10:42:03; a double-fired action or a re-render loop usually causes this');
  });
});

describe('same input', () => {
  it('says whether the repeat is byte-identical to the call before it', () => {
    const calls = [
      call(1, { at: 0, input: { a: 1, b: 2 } }),
      call(2, { at: 500, input: { a: 1, b: 2 } }),
      call(3, { at: 900, input: { b: 2, a: 1 } }) // same values, other key order
    ];
    const repeats = findRepeats(calls);
    expect(repeats.get(2)).toMatchObject({ prevId: 1, sameInput: true });
    expect(repeats.get(3)).toMatchObject({ ofId: 1, prevId: 2, sameInput: false });
  });

  it('compares with the call just before, not the first of the run', () => {
    const calls = [
      call(1, { at: 0, input: { a: 1, b: 2 } }),
      call(2, { at: 500, input: { b: 2, a: 1 } }),
      call(3, { at: 900, input: { b: 2, a: 1 } })
    ];
    const repeats = findRepeats(calls);
    expect(repeats.get(2).sameInput).toBe(false);
    expect(repeats.get(3)).toMatchObject({ ofId: 1, prevId: 2, sameInput: true });
  });

  const clock = (time) => new Date(time).toISOString().slice(11, 19);

  it('words the hint with the earlier call\'s time and verdict', () => {
    const calls = [call(1, { at: 3000 }), call(2, { at: 4000 })];
    const repeat = findRepeats(calls).get(2);
    expect(sameInputHint(repeat, calls[0], clock)).toEqual({ id: 1, text: 'Same input as the call at 10:42:03 (Succeeded)' });
  });

  it('is said only when the earlier call succeeded', () => {
    const calls = [{ ...call(1, { at: 0 }), failure: 'boom' }, call(2, { at: 500 })];
    const repeat = findRepeats(calls).get(2);
    expect(repeat.sameInput).toBe(true);
    expect(sameInputHint(repeat, calls[0], clock)).toBeNull();
    expect(sameInputHint(repeat, { ...calls[0], failure: null, responseProblem: 'empty' }, clock)).toBeNull();
  });

  it('is not said without a repeat, a byte-identical input or the earlier call', () => {
    const calls = [call(1, { at: 0, input: { a: 1, b: 2 } }), call(2, { at: 500, input: { b: 2, a: 1 } })];
    expect(sameInputHint(undefined, calls[0], clock)).toBeNull();
    expect(sameInputHint(findRepeats(calls).get(2), calls[0], clock)).toBeNull();
    const same = [call(1, { at: 0 }), call(2, { at: 500 })];
    expect(sameInputHint(findRepeats(same).get(2), undefined, clock)).toBeNull();
  });
});

describe('repeat in the filter box and the badge', () => {
  const entries = [call(1), call(2, { at: 100 }), call(3, { at: 200, key: 'Solo' })];
  const repeats = findRepeats(entries);
  const opts = (query) => ({ query, onlyOmni: false, repeatIds: repeatIds(repeats) });

  it('reads repeat: and repeats, with or without a colon, and takes no text', () => {
    ['repeat:', 'repeats', 'repeats:', 'REPEAT:'].forEach((text) => expect(parseQuery(text).repeats).toBe(true));
    expect(parseQuery('order repeat:').text).toBe('order');
    expect(parseQuery('repeat: in:ok')).toMatchObject({ repeats: true, inPayload: 'ok', text: '' });
    expect(parseQuery('repeating').repeats).toBe(false);
    expect(hasQuery(parseQuery('repeat:'))).toBe(true);
  });

  it('keeps the repeated calls and the ones they repeat', () => {
    expect(entries.filter((entry) => matchesFilter(entry, opts('repeat:'))).map((entry) => entry.id)).toEqual([1, 2]);
    expect(entries.filter((entry) => matchesFilter(entry, opts('repeats order'))).map((entry) => entry.id)).toEqual([1, 2]);
    expect(entries.filter((entry) => matchesFilter(entry, opts(''))).map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  it('adds the number of repeated calls to the badge tooltip', () => {
    expect(badgeSummary(entries, repeats).title).toBe('3 calls in view · 1 repeated');
    expect(badgeSummary(entries.slice(2), repeats).title).toBe('1 call in view');
    expect(badgeSummary(entries).title).toBe('3 calls in view');
  });
});
