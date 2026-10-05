import { fuzzyScore, fuzzyFilter } from '../../src/core/fuzzy.js';

const items = ['jsonDataStr', 'jsonDef', 'scriptHeaderDef', 'recordId', 'omniJsonData'].map((name) => ({ name }));
const names = (list) => list.map((item) => item.name);

describe('fuzzyFilter', () => {
  it('keeps everything for an empty query', () => {
    expect(names(fuzzyFilter(items, ''))).toEqual(names(items));
  });

  it('matches characters in order, case-insensitively', () => {
    expect(names(fuzzyFilter(items, 'JSD'))).toContain('jsonDataStr');
    expect(names(fuzzyFilter(items, 'shd'))).toEqual(['scriptHeaderDef']);
  });

  it('drops names that do not contain the query as a subsequence', () => {
    expect(fuzzyScore('recordId', 'xyz')).toBeNull();
    expect(names(fuzzyFilter(items, 'xyz'))).toEqual([]);
  });

  it('ranks contiguous and prefix matches first', () => {
    expect(names(fuzzyFilter(items, 'json'))[0]).toBe('jsonDef');
    expect(names(fuzzyFilter(items, 'jsonD')).slice(0, 2)).toEqual(['jsonDef', 'jsonDataStr']);
  });
});
