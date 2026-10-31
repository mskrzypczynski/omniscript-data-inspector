import { pollIntervals } from '../../../src/core/data/poll-rate.js';
import { REFRESH_RATES, DEFAULT_RATE, REFRESH_LABELS } from '../../../src/core/shared/refresh-rate.js';
import { pollDelay } from '../../../src/core/data/poll-backoff.js';

describe('pollIntervals', () => {
  it('gives the period after a change and the longest period while nothing changes', () => {
    expect(pollIntervals('fast')).toEqual({ fast: 500, slow: 2000 });
    expect(pollIntervals('normal')).toEqual({ fast: 1000, slow: 4000 });
    expect(pollIntervals('gentle')).toEqual({ fast: 3000, slow: 8000 });
  });

  it('reads anything else as the default', () => {
    ['', 'turbo', null, undefined, 3, 'toString', '__proto__'].forEach((bad) => {
      expect(pollIntervals(bad)).toEqual(pollIntervals(DEFAULT_RATE));
    });
  });

  it('hands out a copy', () => {
    pollIntervals('fast').fast = 1;
    expect(pollIntervals('fast').fast).toBe(500);
  });

  it('names the three rates, slower each time', () => {
    expect(REFRESH_RATES).toEqual(['fast', 'normal', 'gentle']);
    const bases = REFRESH_RATES.map((rate) => pollIntervals(rate).fast);
    expect([...bases].sort((a, b) => a - b)).toEqual(bases);
  });

  it('has a period and a label for every named rate, and the default is one of them', () => {
    expect(REFRESH_RATES).toContain(DEFAULT_RATE);
    REFRESH_RATES.forEach((rate) => {
      expect(REFRESH_LABELS[rate]).toBeTruthy();
      expect(pollIntervals(rate).fast).toBeGreaterThan(0);
      expect(pollIntervals(rate).slow).toBeGreaterThan(pollIntervals(rate).fast);
    });
  });

  it('keeps the normal rate equal to the backoff defaults', () => {
    expect(pollDelay(0, pollIntervals('normal').fast, pollIntervals('normal').slow)).toBe(pollDelay(0));
    expect(pollDelay(100, pollIntervals('normal').fast, pollIntervals('normal').slow)).toBe(pollDelay(100));
  });

  it('stretches each rate up to its own cap and no further', () => {
    REFRESH_RATES.forEach((rate) => {
      const { fast, slow } = pollIntervals(rate);
      expect(pollDelay(0, fast, slow)).toBe(fast);
      expect(pollDelay(1000, fast, slow)).toBe(slow);
    });
  });
});
