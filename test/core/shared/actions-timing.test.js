'use strict';

import {
  timingParts, tookText, tookWithBatch, batchTag, batchTitle, tookTitle, knownDuration, formatBytes
} from '../../../src/core/shared/actions-timing.js';

describe('timingParts', () => {
  it('splits a HAR timing into the server share and the time before the request was away', () => {
    const parts = timingParts({ blocked: 5, dns: -1, connect: 20, ssl: 10, send: 1, wait: 1500, receive: 110 });
    expect(parts).toMatchObject({ server: 1610, queue: 26, wait: 1500, receive: 110, dns: null });
  });

  it('is null without wait and receive', () => {
    expect(timingParts(undefined)).toBeNull();
    expect(timingParts({ blocked: 3 })).toBeNull();
    expect(timingParts({ wait: -1, receive: -1 })).toBeNull();
  });

  it('counts a missing part as nothing', () => {
    expect(timingParts({ wait: 40, receive: -1 })).toMatchObject({ server: 40, queue: 0 });
  });
});

describe('knownDuration and formats', () => {
  it('treats -1, 0 and junk as unknown', () => {
    expect(knownDuration(-1)).toBeNull();
    expect(knownDuration(0)).toBeNull();
    expect(knownDuration(NaN)).toBeNull();
    expect(knownDuration('5')).toBeNull();
    expect(knownDuration(5)).toBe(5);
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(-1)).toBe('');
  });
});

describe('tookText', () => {
  const base = { duration: 1840, batchSize: 1, timings: timingParts({ wait: 1500, receive: 110 }) };

  it('says the round trip and nothing more; the breakdown is in the tooltip', () => {
    expect(tookText(base)).toBe('1,840 ms');
    expect(tookText(base, true)).toBe('1,840 ms');
    expect(tookTitle(base)).toContain('Server share: 1,610 ms');
  });

  it('holds only the time, even for a shared request: one line, never wrapping', () => {
    expect(tookText({ duration: 400, batchSize: 3 })).toBe('400 ms');
    expect(tookText({ ...base, batchSize: 2 })).toBe('1,840 ms');
  });

  it('says a batch shares its time where there is a whole line for it', () => {
    expect(tookWithBatch({ duration: 400, batchSize: 3 })).toBe('400 ms · shared by 3');
    expect(tookWithBatch({ ...base, batchSize: 1 })).toBe('1,840 ms');
    expect(tookWithBatch({ duration: null, batchSize: 3 })).toBe('');
  });

  it('gives a shared request a small neutral ×N tag, and its tooltip repeats it in the Took cell', () => {
    expect(batchTag({ batchSize: 7 })).toEqual({
      label: '×7', title: 'One request shared by 7 actions: the time is the whole request\'s', tone: 'neutral', extra: 'tag-batch'
    });
    expect(batchTag({ batchSize: 1 })).toBeNull();
    expect(batchTitle({ batchSize: 1 })).toBe('');
    expect(tookTitle({ duration: 400, batchSize: 7 })).toContain('One request shared by 7 actions: the time is the whole request\'s');
  });

  it('is empty for an unknown duration', () => {
    expect(tookText({ duration: null })).toBe('');
    expect(tookText({ duration: -1 })).toBe('');
  });
});

describe('the human Time format', () => {
  const base = { duration: 1840, batchSize: 1, timings: timingParts({ blocked: 4, connect: 6, send: 1, wait: 1500, receive: 110 }) };

  it('writes the Took cell in seconds', () => {
    expect(tookText(base, 'human')).toBe('1.8 s');
    expect(tookText({ duration: 640, batchSize: 3 }, 'human')).toBe('640 ms');
    expect(tookText({ duration: 72000, batchSize: 1 }, 'human')).toBe('1m 12s');
  });

  it('writes the whole breakdown in it', () => {
    const text = tookTitle(base, 'human');
    expect(text).toContain('Round trip: 1.8 s from');
    expect(text).toContain('Server share: 1.6 s (waiting for the first byte 1.5 s, download 110 ms)');
    expect(text).toContain('Before the request was away: 11 ms (blocked 4 ms, DNS 0 ms, connect 6 ms, send 1 ms)');
  });

  it('reads as milliseconds for the ms format and for anything unknown', () => {
    expect(tookText(base, 'ms')).toBe('1,840 ms');
    expect(tookText(base, 'weeks')).toBe('1,840 ms');
    expect(tookTitle(base, 'ms')).toContain('Server share: 1,610 ms (waiting for the first byte 1,500 ms, download 110 ms)');
  });
});

describe('tookTitle', () => {
  it('breaks the time down', () => {
    const text = tookTitle({ duration: 1840, batchSize: 1, timings: timingParts({ blocked: 4, connect: 6, send: 1, wait: 1500, receive: 110 }) });
    expect(text).toContain('Round trip: 1,840 ms');
    expect(text).toContain('Server share: 1,610 ms');
    expect(text).toContain('Before the request was away: 11 ms');
  });

  it('explains a shared request', () => {
    expect(tookTitle({ duration: 400, batchSize: 3 })).toContain('One request shared by 3 actions: the time is the whole request\'s');
  });

  it('says when there is no duration', () => {
    expect(tookTitle({ duration: null })).toBe('Duration unavailable');
  });
});
