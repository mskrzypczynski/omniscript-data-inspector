'use strict';

import {
  filterElements, withoutFolded, underFoldedSection, withContext, childCounts, ancestorKeys, isWithin, noMatchText
} from '../../../src/core/structure/element-filter.js';

const el = (key, parentKey, searchText, remote = '') => ({ key, parentKey, searchText, remote });
const elements = [
  el('s', '', 'step one step'),
  el('a', 's', 'amount number'),
  el('b', 's', 'lookup action', 'SomeClass'),
  el('t', '', 'step two step'),
  el('c', 't', 'notes text')
];
const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));
const keys = (list) => list.map((element) => element.key);

describe('filterElements', () => {
  it('keeps everything without a filter', () => {
    expect(keys(filterElements(elements))).toEqual(['s', 'a', 'b', 't', 'c']);
  });

  it('matches the search text, ignoring case and surrounding space', () => {
    expect(keys(filterElements(elements, { query: '  NOTES ' }))).toEqual(['c']);
  });

  it('keeps only elements that call something with actionsOnly', () => {
    expect(keys(filterElements(elements, { actionsOnly: true }))).toEqual(['b']);
  });

  it('drops hidden elements with visibleOnly', () => {
    const isHidden = (element) => element.key === 'a';
    expect(keys(filterElements(elements, { visibleOnly: true, isHidden }))).toEqual(['s', 'b', 't', 'c']);
    expect(keys(filterElements(elements, { visibleOnly: false, isHidden }))).toHaveLength(5);
  });
});

describe('folded sections', () => {
  it('knows when an ancestor is folded', () => {
    expect(underFoldedSection(byKey.a, byKey, new Set(['s']))).toBe(true);
    expect(underFoldedSection(byKey.c, byKey, new Set(['s']))).toBe(false);
    expect(underFoldedSection(byKey.s, byKey, new Set(['s']))).toBe(false);
  });

  it('hides what is inside a folded section', () => {
    expect(keys(withoutFolded(elements, byKey, new Set(['s'])))).toEqual(['s', 't', 'c']);
  });

  it('hides the matches of a filter too, and they return on unfold', () => {
    const matches = filterElements(elements, { query: 'a' }); // amount, lookup action, ... (not step rows)
    expect(keys(withoutFolded(matches, byKey, new Set(['s'])))).not.toContain('a');
    expect(keys(withoutFolded(matches, byKey, new Set()))).toContain('a');
  });

  it('returns the same rows when nothing is folded', () => {
    expect(withoutFolded(elements, byKey, new Set())).toBe(elements);
  });
});

describe('withContext', () => {
  it('keeps the steps above the matches, in script order, and says which were added', () => {
    const matches = filterElements(elements, { query: 'notes' });
    const { rows, context } = withContext(elements, matches);
    expect(keys(rows)).toEqual(['t', 'c']);
    expect([...context]).toEqual(['t']);
  });

  it('adds every ancestor once, for several matches', () => {
    const deep = [el('s', ''), el('b', 's'), el('x', 'b'), el('y', 'b'), el('z', 's')];
    const { rows, context } = withContext(deep, [deep[2], deep[3]]);
    expect(keys(rows)).toEqual(['s', 'b', 'x', 'y']);
    expect([...context].sort()).toEqual(['b', 's']);
  });

  it('adds nothing when the filters let everything through', () => {
    const { rows, context } = withContext(elements, elements);
    expect(rows).toBe(elements);
    expect(context.size).toBe(0);
  });

  it('does not mark a matching ancestor as context', () => {
    const { context } = withContext(elements, filterElements(elements, { query: 'step' }).concat(elements[1]));
    expect(context.size).toBe(0);
  });

  it('gives nothing for no matches', () => {
    expect(withContext(elements, []).rows).toEqual([]);
  });
});

describe('childCounts', () => {
  it('counts the elements directly inside each section', () => {
    const counts = childCounts(elements);
    expect(counts.get('s')).toBe(2);
    expect(counts.get('t')).toBe(1);
    expect(counts.get('a')).toBeUndefined();
  });
});

describe('ancestorKeys and isWithin', () => {
  const nested = [el('s', ''), el('b', 's'), el('f', 'b'), el('t', '')];
  const map = Object.fromEntries(nested.map((element) => [element.key, element]));

  it('lists every section above an element, outermost first', () => {
    expect(ancestorKeys(map.f, map)).toEqual(['s', 'b']);
    expect(ancestorKeys(map.s, map)).toEqual([]);
  });

  it('matches a key at any depth, and only whole keys', () => {
    expect(isWithin('s b', 's')).toBe(true);
    expect(isWithin('s b', 'b')).toBe(true);
    expect(isWithin('s b', 'x')).toBe(false);
    expect(isWithin('step bar', 'ste')).toBe(false);
    expect(isWithin('', 's')).toBe(false);
    expect(isWithin('s', null)).toBe(false);
  });
});

describe('noMatchText', () => {
  it('quotes what was typed', () => {
    expect(noMatchText({ query: ' zzz ' })).toBe('No elements match “zzz”');
    expect(noMatchText({ query: 'zzz', actionsOnly: true })).toBe('No elements match “zzz”');
  });

  it('names the checkbox when there is no text', () => {
    expect(noMatchText({ actionsOnly: true })).toBe('No element calls anything');
    expect(noMatchText({ visibleOnly: true })).toBe('No element is visible');
    expect(noMatchText({ actionsOnly: true, visibleOnly: true })).toBe('No visible element calls anything');
    expect(noMatchText({})).toBe('No elements to show');
  });
});
