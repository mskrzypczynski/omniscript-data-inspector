'use strict';

import { toastDuration } from '../../../src/core/shared/toast-timing.js';

describe('toastDuration', () => {
  it('keeps a short message quick', () => {
    expect(toastDuration('')).toBe(1400);
    expect(toastDuration('Copied')).toBe(1640);
  });

  it('adds 40 ms per character', () => {
    expect(toastDuration('x'.repeat(50))).toBe(3400);
  });

  it('never stays longer than six seconds', () => {
    expect(toastDuration('x'.repeat(500))).toBe(6000);
    expect(toastDuration('x'.repeat(115))).toBe(6000);
  });

  it('copes with a value that is not text', () => {
    expect(toastDuration(undefined)).toBe(1400);
  });
});
