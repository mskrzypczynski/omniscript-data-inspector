'use strict';

import { commonAffix, excerpt } from '../../../src/core/shared/diff.js';

describe('commonAffix', () => {
  it('counts what two texts share at both ends', () => {
    expect(commonAffix('order-1-open', 'order-1-closed')).toEqual({ prefix: 8, suffix: 0 });
    expect(commonAffix('"abc"', '"axc"')).toEqual({ prefix: 2, suffix: 2 });
  });

  it('never lets the two ends overlap', () => {
    expect(commonAffix('aaa', 'aaaa')).toEqual({ prefix: 3, suffix: 0 });
    expect(commonAffix('abab', 'ab')).toEqual({ prefix: 2, suffix: 0 });
    const { prefix, suffix } = commonAffix('xaax', 'xax');
    expect(prefix + suffix).toBeLessThanOrEqual(3);
  });

  it('handles identical, disjoint and empty texts', () => {
    expect(commonAffix('same', 'same')).toEqual({ prefix: 4, suffix: 0 });
    expect(commonAffix('abc', 'xyz')).toEqual({ prefix: 0, suffix: 0 });
    expect(commonAffix('', 'abc')).toEqual({ prefix: 0, suffix: 0 });
  });

  it('does not split a surrogate pair', () => {
    const a = '"\u{1F600}a"';
    const b = '"\u{1F601}a"';
    const { prefix, suffix } = commonAffix(a, b);
    expect(prefix).toBe(1);
    expect(suffix).toBe(2);
  });
});

describe('excerpt', () => {
  it('shows a short text whole', () => {
    expect(excerpt(100, 50, 60)).toEqual({ from: 0, to: 100 });
  });

  it('cuts a long text at the limit when the difference is near the start', () => {
    expect(excerpt(500, 10, 20)).toEqual({ from: 0, to: 160 });
  });

  it('moves along so a difference further in is in view', () => {
    const { from, to } = excerpt(500, 300, 310);
    expect(from).toBe(270);
    expect(to).toBe(430);
  });

  it('does not run past the end', () => {
    expect(excerpt(500, 495, 500)).toEqual({ from: 340, to: 500 });
  });
});
