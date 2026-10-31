'use strict';

import { applyPayload, resetPayload } from '../../../src/core/data/payload-state.js';
import { HIGHLIGHT_MS } from '../../../src/core/shared/flash.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

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
    expect(state.history).toBeUndefined(); // the history is panel-wide now, see ui/payload-history.js
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

  it('treats an empty or blank property as nothing there, not as invalid JSON', () => {
    ['', '   ', '\n'].forEach((blank) => {
      const state = fresh();
      applyPayload(state, '{"a":1}', at(0));
      applyPayload(state, blank, at(10));
      expect(state.raw).toBe(null);
      expect(state.parseError).toBe(null);
      expect(state.data).toBeUndefined();
    });
  });

  it('does not count a poll that finds nothing again as a new payload', () => {
    const state = fresh();
    applyPayload(state, '', at(0));
    const version = state.rawVersion;
    applyPayload(state, '', at(10));
    applyPayload(state, null, at(20));
    expect(state.rawVersion).toBe(version);
  });

  it('compares a good read with the last good one when a read in between did not parse', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":', at(10)); // caught mid-write
    expect(state.parseError).toBeTruthy();
    applyPayload(state, '{"a":2}', at(20));
    expect([...state.changed]).toEqual(['a']);
    expect(state.before.get('a')).toBe(1);
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
  it('clears marks and expansion', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(10));
    resetPayload(state);
    expect(state.touched.size).toBe(0);
    expect(state.seeded).toBe(false);
    expect([...state.expanded]).toEqual(['']);
  });
});

describe('without tracking', () => {
  it('still flashes a change but keeps no marks or old values', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0), false);
    applyPayload(state, '{"a":2}', at(10), false);
    expect(state.changed.size).toBe(1);
    expect(state.touched.size).toBe(0);
    expect(state.before.size).toBe(0);
    expect(state.data).toEqual({ a: 2 });
  });

  it('dropMarks drops the marks, the was values and the log, but keeps the payload and the flash', async () => {
    const { dropMarks } = await import('../../../src/core/data/payload-state.js');
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0));
    applyPayload(state, '{"a":2}', at(10));
    dropMarks(state);
    expect(state.touched.size).toBe(0);
    expect(state.before.size).toBe(0);
    expect(state.log).toEqual([]);
    expect(state.focus).toBe(null);
    expect(state.changed.size).toBe(1);
    expect(state.changedAt).toBe(10);
    expect(state.data).toEqual({ a: 2 });
  });
});

describe('with change detection off (Track changes unticked)', () => {
  it('notes no change at all: no flash, no marks, no before values, no log', () => {
    const state = fresh();
    applyPayload(state, '{"a":1}', at(0), true, null, false);
    applyPayload(state, '{"a":2}', at(10), true, null, false);
    expect(state.data).toEqual({ a: 2 });
    expect(state.changed.size).toBe(0);
    expect(state.changedBranch.size).toBe(0);
    expect(state.changeInfo).toBe(null);
    expect(state.changedAt).toBe(0);
    expect(state.touched.size).toBe(0);
    expect(state.before.size).toBe(0);
    expect(state.log).toEqual([]);
  });

  it('still moves the watch list with its rows', () => {
    const state = fresh();
    state.pins = [`Rows${SEP}1${SEP}Code`];
    const rows = (ids) => JSON.stringify({ Rows: ids.map((id) => ({ Id: id, Code: `c${id}` })) });
    applyPayload(state, rows([0, 1]), at(0), true, null, false);
    applyPayload(state, rows([1]), at(10), true, null, false);
    expect(state.pins).toEqual([`Rows${SEP}0${SEP}Code`]);
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

describe('flashProgress / expireFlash', () => {
  it('reports how far into the flash a redraw is, and null once it is over', async () => {
    const { flashProgress } = await import('../../../src/core/shared/flash.js');
    expect(flashProgress(0, 5000)).toBeNull();
    expect(flashProgress(1000, 1000)).toBe(0);
    expect(flashProgress(1000, 2200)).toBe(1200);
    expect(flashProgress(1000, 1000 + HIGHLIGHT_MS)).toBeNull();
    expect(flashProgress(1000, 500)).toBe(0); // clock stepped back
  });

  it('forgets the flash after HIGHLIGHT_MS without a read, and keeps the lasting marks', async () => {
    const { expireFlash } = await import('../../../src/core/data/payload-state.js');
    const state = fresh();
    applyPayload(state, '{"a":1}', at(1000));
    applyPayload(state, '{"a":2}', at(2000));
    expect(expireFlash(state, 2000 + HIGHLIGHT_MS - 1)).toBe(false);
    expect(state.changed.size).toBe(1);
    expect(expireFlash(state, 2000 + HIGHLIGHT_MS)).toBe(true);
    expect(state.changed.size).toBe(0);
    expect(state.changedBranch.size).toBe(0);
    expect([...state.touched]).toEqual(['a']);
    expect(state.before.get('a')).toBe(1);
  });
});
