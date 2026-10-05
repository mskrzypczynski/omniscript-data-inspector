'use strict';

import { applyPayload, resetPayload, HIGHLIGHT_MS } from '../../src/core/payload-state.js';

function fresh() {
  const state = { expanded: new Set(), touched: new Set(), before: new Map(), changed: new Set(), changedBranch: new Set(), changedAt: 0 };
  resetPayload(state);
  return state;
}
const at = (ms) => new Date(ms);

describe('applyPayload', () => {
  it('parses the first read, seeds the tree open and sees no changes', () => {
    const state = fresh();
    applyPayload(state, '{"a":{"x":1},"b":2}', at(1000));
    expect(state.data).toEqual({ a: { x: 1 }, b: 2 });
    expect([...state.expanded].sort()).toEqual(['', 'a', 'b']);
    expect(state.changed.size).toBe(0);
    expect(state.history).toHaveLength(1);
  });

  it('marks what changed, remembers the first old value, and keeps marks after the flash', () => {
    const state = fresh();
    applyPayload(state, '{"a":"Ada"}', at(1000));
    applyPayload(state, '{"a":"Bob"}', at(2000));
    applyPayload(state, '{"a":"Cy"}', at(3000));
    expect([...state.touched]).toEqual(['a']);
    expect(state.before.get('a')).toBe('Ada');
    expect(state.changedAt).toBe(3000);

    applyPayload(state, '{"a":"Cy"}', at(3000 + HIGHLIGHT_MS + 1)); // unchanged read, flash over
    expect(state.changed.size).toBe(0);
    expect(state.touched.has('a')).toBe(true);
  });

  it('keeps the flash while it is recent', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(100));
    applyPayload(state, '{"a":2}', at(200));
    expect(state.changed.size).toBe(1);
  });

  it('reports invalid JSON without losing the raw text, and compares nothing', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{oops', at(10));
    expect(state.parseError).toBeTruthy();
    expect(state.data).toBeUndefined();
    expect(state.raw).toBe('{oops');
    expect(state.changed.size).toBe(0);
  });

  it('forgets the payload but keeps the marks when the host returns nothing', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(10));
    applyPayload(state, null, at(20));
    expect(state.data).toBeUndefined();
    expect(state.touched.size).toBe(1);
  });
});

describe('resetPayload', () => {
  it('clears history, marks and expansion', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(10));
    resetPayload(state);
    expect(state.history).toEqual([]);
    expect(state.touched.size).toBe(0);
    expect(state.seeded).toBe(false);
    expect([...state.expanded]).toEqual(['']);
  });
});

describe('without tracking', () => {
  it('still flashes a change but keeps no marks, old values or history', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0), false);
    applyPayload(state, '{"a":2}', at(10), false);
    expect(state.changed.size).toBe(1);
    expect(state.touched.size).toBe(0);
    expect(state.before.size).toBe(0);
    expect(state.history).toEqual([]);
    expect(state.data).toEqual({ a: 2 });
  });

  it('stopTracking drops what was collected but keeps the payload', async () => {
    const { stopTracking } = await import('../../src/core/payload-state.js');
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(10));
    stopTracking(state);
    expect(state.touched.size).toBe(0);
    expect(state.history).toEqual([]);
    expect(state.data).toEqual({ a: 2 });
  });
});

describe('startTracking', () => {
  it('makes the payload on screen the first snapshot, so the next change can be compared', async () => {
    const { startTracking } = await import('../../src/core/payload-state.js');
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0), false);
    startTracking(state, at(5));
    applyPayload(state, '{"a":2}', at(10), true);
    expect(state.history.map((h) => h.raw)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('does nothing before anything was read', async () => {
    const { startTracking } = await import('../../src/core/payload-state.js');
    const state = fresh();
    startTracking(state, at(5));
    expect(state.history).toEqual([]);
  });
});

describe('rawVersion', () => {
  it('moves only when a new payload arrives, so callers need not compare the text', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    const v1 = state.rawVersion;
    applyPayload(state, '{"a":1}', at(10));
    expect(state.rawVersion).toBe(v1);
    applyPayload(state, '{"a":2}', at(20));
    expect(state.rawVersion).toBe(v1 + 1);
    applyPayload(state, null, at(30));
    expect(state.rawVersion).toBe(v1 + 2);
  });
});
