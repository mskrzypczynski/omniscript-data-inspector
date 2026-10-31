'use strict';

/* The panel-wide payload history: one list every tab reads from. */

import { jest } from '@jest/globals';

describe('PayloadHistory', () => {
  let PayloadHistory;
  beforeEach(async () => {
    jest.resetModules();
    ({ PayloadHistory } = await import('../../../src/ui/payload-history.js'));
  });

  it('records distinct payloads oldest first, stamped with the step, and ignores a repeat', () => {
    const seen = [];
    PayloadHistory.onChange(() => seen.push(PayloadHistory.list().length));
    expect(PayloadHistory.record('{"a":1}', new Date(1), { name: 'Step1', visitFrom: 0 })).toBe(true);
    expect(PayloadHistory.record('{"a":1}', new Date(2))).toBe(false);
    expect(PayloadHistory.record('{"a":2}', new Date(3))).toBe(true);
    expect(PayloadHistory.list().map((s) => s.raw)).toEqual(['{"a":1}', '{"a":2}']);
    expect(PayloadHistory.list()[0].step).toEqual({ name: 'Step1', visitFrom: 0 });
    expect(seen).toEqual([1, 2]);
  });

  it('keeps at most the shared cap and empties on clear', async () => {
    const { MAX_SHARED_SNAPSHOTS } = await import('../../../src/ui/payload-history.js');
    for (let i = 0; i < MAX_SHARED_SNAPSHOTS + 3; i++) PayloadHistory.record(`{"i":${i}}`, new Date(i));
    expect(PayloadHistory.list()).toHaveLength(MAX_SHARED_SNAPSHOTS);
    PayloadHistory.clear();
    expect(PayloadHistory.list()).toEqual([]);
  });
});
