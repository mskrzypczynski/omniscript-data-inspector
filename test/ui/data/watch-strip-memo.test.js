'use strict';

/* The strip evaluates every expression against the payload. A redraw that
 * changes neither the payload, the list nor Mask values must not do it again
 * (a $.. query over a big payload costs real time). */

import { renderWatchStrip, forgetWatchStrip } from '../../../src/ui/data/watch-strip.js';

const noop = () => {};
const on = { reveal: noop, remove: noop, toggleNotify: noop, removeExpr: noop, toggleExprNotify: noop, editExpr: noop, submitExpr: noop, clearExprError: noop, notify: noop, mask: null };

/* A payload whose top level counts how often it is read. */
function countedData(body) {
  const counter = { reads: 0 };
  const data = new Proxy(body, { get(target, key) { counter.reads++; return target[key]; }, ownKeys(target) { counter.reads++; return Reflect.ownKeys(target); } });
  return { data, counter };
}

function setup() {
  const container = document.createElement('div');
  const { data, counter } = countedData({ Step: { Total: 120 } });
  const state = { data, rawVersion: 1, pins: [], notify: new Set(), exprs: ['Step:Total > 100', '$..Total'], exprNotify: new Set(), watchPrev: {} };
  return { container, state, counter };
}

describe('watch strip evaluation', () => {
  it('evaluates the expressions once for the same payload, list and mask', () => {
    const { container, state, counter } = setup();
    renderWatchStrip(container, state, on);
    const first = counter.reads;
    expect(first).toBeGreaterThan(0);
    renderWatchStrip(container, state, on);
    renderWatchStrip(container, state, on);
    expect(counter.reads).toBe(first);
    expect(container.querySelectorAll('.watch-item')).toHaveLength(2);
  });

  it('evaluates again for a new payload, a changed list or Mask values', () => {
    const { container, state, counter } = setup();
    renderWatchStrip(container, state, on);
    const once = counter.reads;

    const next = countedData({ Step: { Total: 50 } });
    state.data = next.data;
    state.rawVersion = 2;
    renderWatchStrip(container, state, on);
    expect(next.counter.reads).toBeGreaterThan(0);
    expect(container.querySelector('.watch-value').textContent).toBe('✕ false');

    const before = next.counter.reads;
    state.exprs = [...state.exprs, 'Step:Total < 100'];
    renderWatchStrip(container, state, on);
    expect(next.counter.reads).toBeGreaterThan(before);
    expect(container.querySelectorAll('.watch-item')).toHaveLength(3);

    const masked = next.counter.reads;
    renderWatchStrip(container, state, { ...on, mask: (value) => value });
    expect(next.counter.reads).toBeGreaterThan(masked);
    expect(counter.reads).toBe(once); // the old payload was not read again
  });

  it('still redraws after forgetWatchStrip, from the kept rows', () => {
    const { container, state, counter } = setup();
    renderWatchStrip(container, state, on);
    const first = counter.reads;
    container.textContent = '';
    forgetWatchStrip(state);
    renderWatchStrip(container, state, on);
    expect(container.querySelectorAll('.watch-item')).toHaveLength(2);
    expect(counter.reads).toBe(first);
  });
});
