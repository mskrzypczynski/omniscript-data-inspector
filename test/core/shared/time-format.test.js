'use strict';

import { formatTime, formatMs, formatDuration, timeFormatOf, TIME_FORMATS } from '../../../src/core/shared/time-format.js';

describe('formatTime', () => {
  it('writes exact milliseconds with a thousands separator for "ms"', () => {
    expect(formatTime(1240, 'ms')).toBe('1,240 ms');
    expect(formatTime(640, 'ms')).toBe('640 ms');
    expect(formatTime(72000, 'ms')).toBe('72,000 ms');
    expect(formatTime(1239.6, 'ms')).toBe('1,240 ms');
  });

  it('writes seconds and minutes for "human", and still milliseconds under a second', () => {
    expect(formatTime(1240, 'human')).toBe('1.2 s');
    expect(formatTime(640, 'human')).toBe('640 ms');
    expect(formatTime(36240, 'human')).toBe('36.2 s');
    expect(formatTime(72000, 'human')).toBe('1m 12s');
    expect(formatTime(59960, 'human')).toBe('1m 0s');
  });

  it('is milliseconds when the format is missing or not one of the two', () => {
    expect(formatTime(1240)).toBe('1,240 ms');
    expect(formatTime(1240, undefined)).toBe('1,240 ms');
    expect(formatTime(1240, 'weeks')).toBe('1,240 ms');
    expect(formatTime(1240, true)).toBe('1,240 ms');
  });

  it('says 0 ms for a missing, negative or non-numeric time, in either format', () => {
    [undefined, null, NaN, -5, 0, '12'].forEach((value) => {
      expect(formatTime(value, 'ms')).toBe('0 ms');
      expect(formatTime(value, 'human')).toBe('0 ms');
    });
  });

  it('agrees with formatMs and formatDuration, and names its two formats', () => {
    expect(formatTime(1840, 'ms')).toBe(formatMs(1840));
    expect(formatTime(1840, 'human')).toBe(formatDuration(1840));
    expect(TIME_FORMATS).toEqual(['ms', 'human']);
  });
});

describe('timeFormatOf', () => {
  it('keeps a known format and falls back to ms for anything else', () => {
    expect(timeFormatOf('ms')).toBe('ms');
    expect(timeFormatOf('human')).toBe('human');
    ['seconds', '', null, undefined, 3, {}].forEach((value) => expect(timeFormatOf(value)).toBe('ms'));
  });
});
