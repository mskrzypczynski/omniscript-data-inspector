'use strict';

import { helpMatches, filterEntry, filterSections, queryWords, sectionsTitled, helpMenuLabel } from '../../../src/core/shared/help-filter.js';

const sections = [
  ['This tab', [['Refresh', 'Reads the data now.'], ['Raw search', 'Searches the text in Raw view.']]],
  ['Everywhere', [
    ['Keyboard', [[['/'], 'Focus the filter'], [['Ctrl', 'C'], 'Copy what is highlighted']]],
    ['Theme', 'Follows DevTools.']
  ]]
];

describe('helpMatches', () => {
  it('needs every word, in any order, ignoring case', () => {
    expect(helpMatches('RAW text', 'Raw search', 'Searches the text')).toBe(true);
    expect(helpMatches('text raw', 'Raw search', 'Searches the text')).toBe(true);
    expect(helpMatches('raw banana', 'Raw search', 'Searches the text')).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(helpMatches('   ', 'a', 'b')).toBe(true);
    expect(queryWords(undefined)).toEqual([]);
  });
});

describe('filterEntry', () => {
  it('narrows a keyboard table to its matching rows', () => {
    const entry = sections[1][1][0];
    expect(filterEntry('copy', entry)).toEqual(['Keyboard', [[['Ctrl', 'C'], 'Copy what is highlighted']]]);
    expect(filterEntry('ctrl', entry)[1]).toHaveLength(1);
    expect(filterEntry('keyboard', entry)).toBe(entry);
    expect(filterEntry('banana', entry)).toBeNull();
  });
});

describe('filterSections', () => {
  it('returns the sections untouched without a query', () => {
    expect(filterSections('', sections)).toBe(sections);
  });

  it('drops entries and then sections that no longer match', () => {
    const result = filterSections('refresh', sections);
    expect(result).toEqual([['This tab', [['Refresh', 'Reads the data now.']]]]);
  });

  it('keeps matching table rows across sections and is empty when nothing matches', () => {
    const result = filterSections('focus', sections);
    expect(result.map(([heading]) => heading)).toEqual(['Everywhere']);
    expect(result[0][1][0][1]).toHaveLength(1);
    expect(filterSections('zzz', sections)).toEqual([]);
  });
});

describe('help for one control', () => {
  const tab = [['Tab section', [['Refresh', 'Reads again'], ['Filter', 'Tab filter']]]];
  const common = [['Everywhere', [['Rescan', 'Looks again'], ['Filter', 'Common filter']]]];
  const other = [['Other tab', [['Definition property', 'Under Advanced']]]];

  it('finds the entry by its exact title, any case, in the first group that has it', () => {
    expect(sectionsTitled('refresh', [tab, common])).toEqual([['Tab section', [['Refresh', 'Reads again']]]]);
    expect(sectionsTitled('Filter', [tab, common])).toEqual([['Tab section', [['Filter', 'Tab filter']]]]);
    expect(sectionsTitled('Rescan', [tab, common, other])).toEqual([['Everywhere', [['Rescan', 'Looks again']]]]);
  });

  it('falls back to the other tabs', () => {
    expect(sectionsTitled('Definition property', [tab, common, other])[0][0]).toBe('Other tab');
  });

  it('does not match part of a title, and finds nothing for an unknown or empty one', () => {
    expect(sectionsTitled('Refre', [tab, common])).toEqual([]);
    expect(sectionsTitled('', [tab])).toEqual([]);
    expect(sectionsTitled(undefined, [tab])).toEqual([]);
  });

  it('words the menu item', () => {
    expect(helpMenuLabel(' Auto-refresh ')).toBe('Help: Auto-refresh');
  });
});
