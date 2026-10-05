'use strict';

import { countLines, splitByQuery } from '../../src/core/text-search.js';

describe('countLines', () => {
  it('counts lines, none for empty text', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('one')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(3);
  });
});

describe('splitByQuery', () => {
  it('cuts the text around case-insensitive matches', () => {
    const { pieces, total } = splitByQuery('Ada met ada', 'ADA');
    expect(total).toBe(2);
    expect(pieces).toEqual([
      { text: 'Ada', match: true }, { text: ' met ', match: false }, { text: 'ada', match: true }
    ]);
  });

  it('returns the text whole without a query or a match', () => {
    expect(splitByQuery('abc', '')).toEqual({ pieces: [{ text: 'abc', match: false }], total: 0 });
    expect(splitByQuery('abc', 'z').total).toBe(0);
  });

  it('marks at most max matches but counts them all', () => {
    const { pieces, total } = splitByQuery('aaaa', 'a', 2);
    expect(total).toBe(4);
    expect(pieces.filter((p) => p.match)).toHaveLength(2);
    expect(pieces.map((p) => p.text).join('')).toBe('aaaa');
  });
});

describe('splitByQuery with characters whose lowercase has another length', () => {
  it('keeps every offset right after one', () => {
    const { pieces } = splitByQuery('İstanbul Ada', 'ada');
    expect(pieces.map((p) => p.text).join('')).toBe('İstanbul Ada');
    expect(pieces.find((p) => p.match).text).toBe('Ada');
  });

  it('treats the query literally, not as a pattern', () => {
    expect(splitByQuery('a.c abc', 'a.c').total).toBe(1);
  });
});
