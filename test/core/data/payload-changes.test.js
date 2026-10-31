'use strict';

import { applyPayload, resetPayload, expireFlash } from '../../../src/core/data/payload-state.js';
import { HIGHLIGHT_MS } from '../../../src/core/shared/flash.js';
import { statusText } from '../../../src/core/data/data-status.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

function fresh() {
  const state = { expanded: new Set(), touched: new Set(), before: new Map(), changed: new Set(), changedBranch: new Set(), changedAt: 0 };
  resetPayload(state);
  return state;
}
const at = (ms) => new Date(ms);
const rows = (n) => Array.from({ length: n }, (_, i) => ({ Id: `r${i}`, Code: `c${i}` }));
const json = (value) => JSON.stringify(value);

describe('applyPayload with rows', () => {
  it('counts a removed row apart and flashes even though no value is marked', () => {
    const state = fresh();
    applyPayload(state, json({ Rows: rows(3) }), at(0));
    applyPayload(state, json({ Rows: rows(3).slice(1) }), at(1000));
    expect(state.changed.size).toBe(0);
    expect(state.changeInfo).toEqual({ updated: 0, rowsAdded: 0, rowsRemoved: 1, truncated: false });
    expect(state.changedAt).toBe(1000);
    expireFlash(state, 1000 + HIGHLIGHT_MS + 1);
    expect(state.changeInfo).toBe(null);
  });

  it('marks an added row and a changed value inside another', () => {
    const state = fresh();
    applyPayload(state, json({ Rows: rows(2) }), at(0));
    const next = rows(2);
    next[1].Code = 'edited';
    next.push({ Id: 'n', Code: 'new' });
    applyPayload(state, json({ Rows: next }), at(1000));
    expect([...state.changed].sort()).toEqual([`Rows${SEP}1${SEP}Code`, `Rows${SEP}2`].sort());
    expect(state.changeInfo).toMatchObject({ updated: 1, rowsAdded: 1, rowsRemoved: 0 });
    expect(state.before.get(`Rows${SEP}1${SEP}Code`)).toBe('c1');
  });

  it('keeps the value a row had before it moved, not the one now at that position', () => {
    const state = fresh();
    applyPayload(state, json({ Rows: rows(3) }), at(0));
    const next = [{ Id: 'r0', Code: 'c0' }, { Id: 'r2', Code: 'edited' }]; // r1 removed, r2 edited and moved up
    applyPayload(state, json({ Rows: next }), at(1000));
    expect(state.before.get(`Rows${SEP}1${SEP}Code`)).toBe('c2');
  });
});

describe('the change log', () => {
  it('records each change with its time, step, readable path and values', () => {
    const state = fresh();
    applyPayload(state, json({ A: { b: 1 } }), at(0), true, { name: 'Step1', visitFrom: 0 });
    applyPayload(state, json({ A: { b: 2 } }), at(5000), true, { name: 'Step2', visitFrom: 4000 });
    expect(state.log).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ step: 'Step2', text: 'A:b', path: `A${SEP}b`, kind: 'changed', before: 1, after: 2 });
    expect(state.log[0].time.getTime()).toBe(5000);
  });

  it('keeps the last 200 only, with ids that keep counting', () => {
    const state = fresh();
    applyPayload(state, json({ n: 0 }), at(0));
    for (let i = 1; i <= 250; i++) applyPayload(state, json({ n: i }), at(i * 10));
    expect(state.log).toHaveLength(200);
    expect(state.log[0].after).toBe(51);
    expect(state.log[199].after).toBe(250);
    expect(state.log[199].id).toBe(state.log[0].id + 199);
  });

  it('is not collected when tracking is off', () => {
    const state = fresh();
    applyPayload(state, json({ n: 0 }), at(0), false);
    applyPayload(state, json({ n: 1 }), at(10), false);
    expect(state.log).toEqual([]);
  });

  it('is cleared by a reset', () => {
    const state = fresh();
    applyPayload(state, json({ n: 0 }), at(0));
    applyPayload(state, json({ n: 1 }), at(10));
    resetPayload(state);
    expect(state.log).toEqual([]);
  });

  it('asks for the step only when the payload changed', () => {
    const state = fresh();
    let asked = 0;
    const step = () => { asked++; return { name: 'S', visitFrom: 1 }; };
    applyPayload(state, json({ n: 0 }), at(0), true, step);
    applyPayload(state, json({ n: 0 }), at(10), true, step);
    expect(asked).toBe(0);
    applyPayload(state, json({ n: 1 }), at(20), true, step);
    expect(asked).toBe(1);
  });
});

describe('watched rows follow their identity', () => {
  it('moves a pin when a row above it is removed, with its notify flag and remembered value', () => {
    const state = fresh();
    state.pins = [`Rows${SEP}2${SEP}Code`];
    state.notify = new Set([`Rows${SEP}2${SEP}Code`]);
    state.watchPrev = { [`Rows${SEP}2${SEP}Code`]: '"c2"' };
    applyPayload(state, json({ Rows: rows(3) }), at(0));
    applyPayload(state, json({ Rows: rows(3).slice(1) }), at(1000));
    expect(state.pins).toEqual([`Rows${SEP}1${SEP}Code`]);
    expect([...state.notify]).toEqual([`Rows${SEP}1${SEP}Code`]);
    expect(state.watchPrev).toEqual({ [`Rows${SEP}1${SEP}Code`]: '"c2"' });
  });

  it('leaves pins alone when nothing moved', () => {
    const state = fresh();
    state.pins = ['A'];
    applyPayload(state, json({ A: 1 }), at(0));
    applyPayload(state, json({ A: 2 }), at(10));
    expect(state.pins).toEqual(['A']);
  });
});

describe('status wording for rows', () => {
  const base = { host: { label: 'c-a' }, shown: 1, nested: 0, rawLength: 5, visible: true, live: true, view: 'tree', hasData: true };

  it('separates values, rows added and rows removed', () => {
    const info = { updated: 3, rowsAdded: 1, rowsRemoved: 2, truncated: false };
    expect(statusText({ ...base, changedCount: 4, changeInfo: info }).right)
      .toBe('Live · 3 values updated · 1 row added · 2 rows removed');
  });

  it('says only what happened', () => {
    expect(statusText({ ...base, changeInfo: { updated: 0, rowsAdded: 0, rowsRemoved: 1, truncated: false } }).right)
      .toBe('Live · 1 row removed');
  });

  it('says (first 800) when the list was cut short', () => {
    expect(statusText({ ...base, changeInfo: { updated: 800, rowsAdded: 0, rowsRemoved: 0, truncated: true } }).right)
      .toBe('Live · 800 values updated (first 800)');
  });

  it('shows nothing for a read that changed nothing', () => {
    expect(statusText({ ...base, changeInfo: null, changedCount: 0 }).right).toBe('Live');
  });
});
