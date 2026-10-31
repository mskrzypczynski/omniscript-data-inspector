'use strict';

import { timingWords, isSlow, slowThreshold, DEFAULT_SLOW_MS } from '../../../src/core/actions/timing-words.js';
import { timingParts } from '../../../src/core/shared/actions-timing.js';

const call = (duration, timings) => ({ id: 1, duration, timings: timingParts(timings) });
const slow = call(1900, { blocked: 5, dns: 0, connect: 0, send: 1, wait: 1840, receive: 20 });

describe('slowThreshold and isSlow', () => {
  it('uses the Slower than setting, or 2 s when it is 0 or unset', () => {
    expect(DEFAULT_SLOW_MS).toBe(2000);
    expect(slowThreshold(500)).toBe(500);
    expect(slowThreshold(0)).toBe(2000);
    expect(slowThreshold(undefined)).toBe(2000);
    expect(slowThreshold(-3)).toBe(2000);
  });

  it('is slow from the threshold on, as the list marks it', () => {
    expect(isSlow({ duration: 1999 }, 0)).toBe(false);
    expect(isSlow({ duration: 2000 }, 0)).toBe(true);
    expect(isSlow({ duration: 499 }, 500)).toBe(false);
    expect(isSlow({ duration: 500 }, 500)).toBe(true);
  });

  it('is not slow without a duration', () => {
    expect(isSlow({ duration: null }, 500)).toBe(false);
    expect(isSlow({}, 500)).toBe(false);
    expect(isSlow(undefined, 500)).toBe(false);
  });
});

describe('timingWords', () => {
  it('says where the time went for a slow call', () => {
    expect(timingWords(slow, { slowMs: 1000 })).toBe('Waited 1,840 ms for the server, received in 20 ms');
  });

  it('says nothing for a call that is not slow', () => {
    expect(timingWords(slow, { slowMs: 2000 })).toBeNull();
    expect(timingWords(call(300, { wait: 280, receive: 10 }), { slowMs: 0 })).toBeNull();
  });

  it('uses 2 s when the setting is 0', () => {
    const entry = call(2500, { wait: 2400, receive: 60 });
    expect(timingWords(entry, { slowMs: 0 })).toBe('Waited 2,400 ms for the server, received in 60 ms');
    expect(timingWords(entry, {})).toBe('Waited 2,400 ms for the server, received in 60 ms');
    expect(timingWords(entry)).toBe('Waited 2,400 ms for the server, received in 60 ms');
  });

  it('follows the Time format setting', () => {
    expect(timingWords(slow, { slowMs: 1000, format: 'human' })).toBe('Waited 1.8 s for the server, received in 20 ms');
    expect(timingWords(slow, { slowMs: 1000, format: 'ms' })).toBe('Waited 1,840 ms for the server, received in 20 ms');
  });

  it('says what is known when one of the two is missing', () => {
    expect(timingWords(call(3000, { wait: 2900, receive: -1 }), { slowMs: 0 })).toBe('Waited 2,900 ms for the server');
    expect(timingWords(call(3000, { wait: -1, receive: 2900 }), { slowMs: 0 })).toBe('Received in 2,900 ms');
  });

  it('writes a wait of 0 as 0 ms', () => {
    expect(timingWords(call(3000, { wait: 0, receive: 2900 }), { slowMs: 0 })).toBe('Waited 0 ms for the server, received in 2,900 ms');
  });

  it('says nothing without timings, as for a call loaded from a file', () => {
    expect(timingWords({ duration: 5000, timings: null }, { slowMs: 0 })).toBeNull();
    expect(timingWords({ duration: 5000 }, { slowMs: 0 })).toBeNull();
    expect(timingWords(call(5000, { wait: -1, receive: -1 }), { slowMs: 0 })).toBeNull();
    expect(timingWords(undefined, { slowMs: 0 })).toBeNull();
  });
});
