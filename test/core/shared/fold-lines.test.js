'use strict';

import { lineCount, lineCut } from '../../../src/core/shared/fold-lines.js';

describe('lineCount', () => {
  it('counts lines, an empty text being one', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a')).toBe(1);
    expect(lineCount('a\nb\nc')).toBe(3);
    expect(lineCount(JSON.stringify({ a: [1, 2] }, null, 2))).toBe(6);
  });
});

describe('lineCut', () => {
  const text = 'one\ntwo\nthree\nfour';

  it('ends the first lines before the newline that follows them', () => {
    expect(text.slice(0, lineCut(text, 2))).toBe('one\ntwo');
    expect(text.slice(0, lineCut(text, 3))).toBe('one\ntwo\nthree');
  });

  it('keeps the whole text when it has no more lines than allowed', () => {
    expect(lineCut(text, 4)).toBe(text.length);
    expect(lineCut(text, 20)).toBe(text.length);
    expect(lineCut('', 3)).toBe(0);
  });
});
