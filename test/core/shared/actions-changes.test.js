'use strict';

import {
  CHANGE_WINDOW_MS, callEndMs, snapshotsAroundCall, dataChangesForCall
} from '../../../src/core/shared/actions-changes.js';

const T0 = 1700000000000;
const snap = (offsetMs, value) => ({ raw: JSON.stringify(value), time: new Date(T0 + offsetMs) });
const call = (startOffset, duration) => ({ time: new Date(T0 + startOffset), duration });

describe('callEndMs', () => {
  it('is the start plus the round trip', () => {
    expect(callEndMs(call(1000, 250))).toBe(T0 + 1250);
  });
  it('is the start when the duration is missing', () => {
    expect(callEndMs({ time: new Date(T0) })).toBe(T0);
    expect(callEndMs({ time: new Date(T0), duration: NaN })).toBe(T0);
  });
});

describe('snapshotsAroundCall', () => {
  const history = [snap(0, 1), snap(1000, 2), snap(2000, 3), snap(4000, 4), snap(9000, 5)];
  const end = T0 + 2500;

  it('picks the last snapshot before the end and the first within the window after it', () => {
    const { before, after } = snapshotsAroundCall(history, end, 5000);
    expect(before).toBe(history[2]);
    expect(after).toBe(history[3]);
  });

  it('ignores snapshots beyond the window', () => {
    const { after } = snapshotsAroundCall(history, T0 + 4500, 3000);
    expect(after).toBeNull(); // 9000 is 4500 ms after the end
  });

  it('counts the window edge in and a snapshot exactly at the end as "before"', () => {
    const edge = [snap(0, 1), snap(1000, 2), snap(6000, 3)];
    const found = snapshotsAroundCall(edge, T0 + 1000, 5000);
    expect(found.before).toBe(edge[1]);
    expect(found.after).toBe(edge[2]);
  });

  it('has no "before" when the history starts after the call', () => {
    const { before, after } = snapshotsAroundCall(history, T0 - 500, 5000);
    expect(before).toBeNull();
    expect(after).toBe(history[0]);
  });

  it('copes with empty and missing history, and with plain millisecond times', () => {
    expect(snapshotsAroundCall([], end)).toEqual({ before: null, after: null });
    expect(snapshotsAroundCall(undefined, end)).toEqual({ before: null, after: null });
    const numeric = [{ raw: '1', time: T0 }, { raw: '2', time: T0 + 100 }];
    expect(snapshotsAroundCall(numeric, T0 + 50).after).toBe(numeric[1]);
  });

  it('uses a five second window by default', () => {
    expect(CHANGE_WINDOW_MS).toBe(5000);
    const slow = [snap(0, 1), snap(5002, 2)];
    expect(snapshotsAroundCall(slow, T0 + 1).after).toBeNull();
  });
});

describe('dataChangesForCall', () => {
  const entry = call(1000, 500); // ends at +1500

  it('lists what changed between the two reads', () => {
    const history = [
      snap(0, { A: 1, B: 'x' }),
      snap(1400, { A: 1, B: 'x', C: 0 }),
      snap(2300, { A: 2, B: 'x' })
    ];
    const result = dataChangesForCall(history, entry);
    expect(result.status).toBe('ok');
    expect(result.before).toBe(history[1]);
    expect(result.after).toBe(history[2]);
    expect(result.gapMs).toBe(800);
    expect(result.changes.map((change) => [change.kind, change.path])).toEqual([
      ['changed', 'A'], ['removed', 'C']
    ]);
  });

  it('says there is no history', () => {
    expect(dataChangesForCall([], entry)).toEqual({ status: 'no-history' });
    expect(dataChangesForCall(undefined, entry)).toEqual({ status: 'no-history' });
  });

  it('says nothing was read after the call', () => {
    expect(dataChangesForCall([snap(0, {}), snap(1400, { a: 1 })], entry).status).toBe('no-after');
    expect(dataChangesForCall([snap(0, {}), snap(9000, { a: 1 })], entry).status).toBe('no-after');
  });

  it('says the Data tab was not reading when the last read before the call is old', () => {
    // Ends at +1500; the last read is 8 s before it and nothing follows.
    const late = call(9000, 500);
    expect(dataChangesForCall([snap(0, {}), snap(500, { a: 1 })], late).status).toBe('not-polling');
    // Reads that all come after the window leave nothing before the call either.
    expect(dataChangesForCall([snap(20000, { a: 1 })], entry).status).toBe('not-polling');
  });

  it('does not blame polling when a recent read exists', () => {
    expect(dataChangesForCall([snap(0, {}), snap(1000, { a: 1 })], entry).status).toBe('no-after');
  });

  it('flags a "before" read older than 30 s', () => {
    const history = [snap(-40000, { A: 1 }), snap(2300, { A: 2 })];
    const result = dataChangesForCall(history, entry);
    expect(result.status).toBe('ok');
    expect(result.staleBefore).toBe(true);
    expect(result.beforeAgeMs).toBe(41500);
    expect(dataChangesForCall([snap(0, { A: 1 }), snap(2300, { A: 2 })], entry).staleBefore).toBe(false);
  });

  it('says the history starts after the call', () => {
    expect(dataChangesForCall([snap(2000, { a: 1 })], entry).status).toBe('no-before');
  });

  it('says when a read is not JSON', () => {
    const history = [{ raw: '{oops', time: new Date(T0) }, snap(2000, {})];
    expect(dataChangesForCall(history, entry).status).toBe('unreadable');
  });
});
