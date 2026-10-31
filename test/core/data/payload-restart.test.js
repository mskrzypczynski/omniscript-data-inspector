'use strict';

import { applyPayload, resetPayload, markRestart } from '../../../src/core/data/payload-state.js';

function fresh() {
  const state = { expanded: new Set(), touched: new Set(), before: new Map(), changed: new Set(), changedBranch: new Set(), changedAt: 0 };
  resetPayload(state);
  return state;
}
const at = (ms) => new Date(ms);

describe('resetPayload', () => {
  it('forgets when the last update was and that a flash was running', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(100));
    expect(state.lastUpdate).not.toBe(null);
    expect(state.changedAt).toBe(100);

    resetPayload(state);
    expect(state.lastUpdate).toBe(null);
    expect(state.changedAt).toBe(0);
  });

  it('starts a new generation, so reads sent earlier can be told apart', () => {
    const state = fresh();
    const before = state.generation;
    resetPayload(state);
    expect(state.generation).toBe(before + 1);
  });
});

describe('markRestart', () => {
  it('makes the next payload a fresh start: no diff across a navigation', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(100));
    expect(state.touched.size).toBe(1);

    markRestart(state);
    applyPayload(state, '{"a":99,"b":1}', at(5000));
    expect(state.data).toEqual({ a: 99, b: 1 });
    expect(state.changed.size).toBe(0);
    expect(state.touched.size).toBe(0);

    applyPayload(state, '{"a":100,"b":1}', at(6000)); // diffing is back to normal
    expect([...state.changed]).toEqual(['a']);
  });

  it('applies even when the new payload is identical text', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(100));
    markRestart(state);
    applyPayload(state, '{"a":2}', at(5000));
    expect(state.restart).toBe(false);
    expect(state.touched.size).toBe(0);
  });
});
