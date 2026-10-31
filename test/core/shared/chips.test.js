'use strict';

import { chipSegments, plainChips, chipNames, endsInsideMark } from '../../../src/core/shared/chips.js';

describe('chipSegments', () => {
  it('splits a text into words and control names, in order', () => {
    expect(chipSegments('Press [[Rescan]] or use the [[?]] button.')).toEqual([
      { text: 'Press ' }, { chip: 'Rescan' }, { text: ' or use the ' }, { chip: '?' }, { text: ' button.' }
    ]);
  });

  it('keeps a name with spaces and a hyphen whole', () => {
    expect(chipSegments('[[Track changes]] and [[Auto-refresh]]')).toEqual([
      { chip: 'Track changes' }, { text: ' and ' }, { chip: 'Auto-refresh' }
    ]);
  });

  it('gives a text with no mark back as one piece, and nothing for nothing', () => {
    expect(chipSegments('No marks here')).toEqual([{ text: 'No marks here' }]);
    expect(chipSegments('')).toEqual([]);
    expect(chipSegments(undefined)).toEqual([]);
    expect(chipSegments(null)).toEqual([]);
  });

  it('leaves what is not a whole mark as written', () => {
    expect(chipSegments('a [[ b')).toEqual([{ text: 'a [[ b' }]);
    expect(chipSegments('empty [[]] and blank [[  ]]')).toEqual([{ text: 'empty [[]] and blank [[  ]]' }]);
    expect(chipSegments('[[a [b]]]')).toEqual([{ text: '[[a [b]]]' }]);
    expect(chipSegments('[[two\nlines]]')).toEqual([{ text: '[[two\nlines]]' }]);
  });

  it('handles marks side by side and at both ends', () => {
    expect(chipSegments('[[A]][[B]]')).toEqual([{ chip: 'A' }, { chip: 'B' }]);
  });

  it('is not caught by a second pass (the regular expression keeps no state)', () => {
    chipSegments('[[A]]');
    expect(chipSegments('[[A]]')).toEqual([{ chip: 'A' }]);
  });
});

describe('plainChips', () => {
  it('replaces each mark with its name', () => {
    expect(plainChips('Press [[Rescan]] if [[Track changes]] is off.')).toBe('Press Rescan if Track changes is off.');
  });

  it('leaves plain text alone', () => {
    expect(plainChips('Nothing marked')).toBe('Nothing marked');
  });
});

describe('chipNames', () => {
  it('lists the names', () => {
    expect(chipNames('[[Rescan]], then [[Refresh]]')).toEqual(['Rescan', 'Refresh']);
    expect(chipNames('none')).toEqual([]);
  });
});

describe('endsInsideMark', () => {
  it('knows when a cut fell inside a mark', () => {
    expect(endsInsideMark('Press [[Track')).toBe(true);
    expect(endsInsideMark('Press [[Track changes]] and')).toBe(false);
    expect(endsInsideMark('Press nothing')).toBe(false);
  });
});
