'use strict';

import { admit, undecodedNote, UNDECODED_KEEP, MAX_ENTRIES, MAX_OTHER_ENTRIES } from '../../../src/core/actions/actions-capture.js';

const call = (id, { omni = true, at = id } = {}) => ({ id, omni, time: new Date(at * 1000) });

describe('admit', () => {
  it('puts a call where its start time puts it and leaves the old list alone', () => {
    const entries = [call(1), call(3)];
    const { entries: next, dropped } = admit(entries, call(2));
    expect(next.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(entries.map((entry) => entry.id)).toEqual([1, 3]);
    expect(dropped).toEqual([]);
  });

  it('keeps the calls of OmniStudio when the page makes a flood of others', () => {
    let entries = [];
    for (let id = 1; id <= 100; id++) entries = admit(entries, call(id)).entries;
    let lost = [];
    for (let id = 101; id <= 1100; id++) {
      const result = admit(entries, call(id, { omni: false }));
      entries = result.entries;
      lost = lost.concat(result.dropped);
    }
    expect(entries.filter((entry) => entry.omni)).toHaveLength(100);
    expect(entries.filter((entry) => !entry.omni)).toHaveLength(MAX_OTHER_ENTRIES);
    expect(lost.every((entry) => !entry.omni)).toBe(true);
    // The others that stay are the newest.
    expect(entries.filter((entry) => !entry.omni)[0].id).toBe(1100 - MAX_OTHER_ENTRIES + 1);
  });

  it('drops the oldest call that is not OmniStudio\'s first when the list is full', () => {
    let entries = [];
    for (let id = 1; id <= MAX_ENTRIES; id++) entries = admit(entries, call(id, { omni: id !== 5 })).entries;
    const { entries: next, dropped } = admit(entries, call(MAX_ENTRIES + 1));
    expect(dropped.map((entry) => entry.id)).toEqual([5]);
    expect(next).toHaveLength(MAX_ENTRIES);
    expect(next[0].id).toBe(1);
  });

  it('drops the oldest call overall only when every call is OmniStudio\'s', () => {
    let entries = [];
    for (let id = 1; id <= MAX_ENTRIES; id++) entries = admit(entries, call(id)).entries;
    const { entries: next, dropped } = admit(entries, call(MAX_ENTRIES + 1));
    expect(dropped.map((entry) => entry.id)).toEqual([1]);
    expect(next).toHaveLength(MAX_ENTRIES);
  });

  it('applies the caps it is given', () => {
    const entries = [call(1, { omni: false }), call(2, { omni: false }), call(3)];
    const { entries: next, dropped } = admit(entries, call(4, { omni: false }), { cap: 10, otherCap: 2 });
    expect(dropped.map((entry) => entry.id)).toEqual([1]);
    expect(next.map((entry) => entry.id)).toEqual([2, 3, 4]);
  });
});

describe('undecodedNote', () => {
  it('keeps a note with the size and the first characters, never the whole body', () => {
    const body = `message=${'x'.repeat(500)}`;
    const note = undecodedNote(body);
    expect(note).toBe(`request not decoded (${body.length} bytes): ${body.slice(0, UNDECODED_KEEP)}`);
    expect(note.length).toBeLessThan(260);
    expect(undecodedNote('')).toBe('request not decoded (0 bytes)');
    expect(undecodedNote(undefined)).toBe('request not decoded (0 bytes)');
  });

  it('never lets the session token or context through', () => {
    const body = 'message=%7B%7D&aura.context=%7B%22mode%22%3A%22PROD%22%7D&aura.token=SECRETVALUE.abc';
    const note = undecodedNote(body);
    expect(note).not.toContain('SECRETVALUE');
    expect(note).not.toContain('PROD');
    expect(note).toContain('aura.token=…');
    expect(note).toContain('aura.context=…');
    // A token cut in half by the limit is cut from the text too.
    const long = `${'a'.repeat(UNDECODED_KEEP - 14)}&aura.token=SECRETVALUE`;
    expect(undecodedNote(long)).not.toContain('SECRET');
  });
});
