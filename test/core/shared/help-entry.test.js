'use strict';

import { entryParts, tooltipOf, limitProblems, searchText, referenceLink, guideLink, slugify, SHORT_WORDS, TEXT_WORDS } from '../../../src/core/shared/help-entry.js';

describe('help entries at three depths', () => {
  const layered = ['Rescan', 'Press it after opening a new script.', { short: 'Look for scripts again.', keys: 'R', more: 'It also runs by itself.' }];

  it('reads the parts of a layered entry and of an older one', () => {
    expect(entryParts(layered)).toEqual({ title: 'Rescan', text: 'Press it after opening a new script.', short: 'Look for scripts again.', keys: 'R', more: 'It also runs by itself.', layered: true });
    expect(entryParts(['Old', 'One text.'])).toMatchObject({ text: 'One text.', short: '', layered: false });
    expect(entryParts(null)).toMatchObject({ title: '', layered: false });
  });

  it('builds the tooltip from the short line and the keys, and none for an older entry', () => {
    expect(tooltipOf(layered)).toBe('Look for scripts again (R)');
    expect(tooltipOf(['Old', 'One text.'])).toBe('');
  });

  it('reports the limits, and never judges an older entry', () => {
    expect(limitProblems(layered)).toEqual([]);
    const long = (count) => Array.from({ length: count }, () => 'word').join(' ');
    expect(limitProblems(['Big', long(TEXT_WORDS + 1), { short: long(SHORT_WORDS + 1) }])).toEqual([
      `Big: short has ${SHORT_WORDS + 1} words (at most ${SHORT_WORDS})`,
      `Big: text has ${TEXT_WORDS + 1} words (at most ${TEXT_WORDS})`
    ]);
    expect(limitProblems(['Old', long(500)])).toEqual([]);
  });

  it('searches the short line, the text and the details', () => {
    expect(searchText(layered)).toBe('Look for scripts again. Press it after opening a new script. It also runs by itself.');
  });

  it('links an entry and a guide on the website', () => {
    expect(slugify('Expand all / Collapse all')).toBe('expand-all-collapse-all');
    expect(referenceLink('common', 'Rescan')).toBe('https://mskrzypczynski.github.io/omniscript-data-inspector/reference.html#everywhere-rescan');
    expect(referenceLink('data', 'Tree view')).toMatch(/#data-tree-view$/);
    expect(guideLink('why-did-this-call-fail')).toBe('https://mskrzypczynski.github.io/omniscript-data-inspector/guides/why-did-this-call-fail.html');
  });
});
