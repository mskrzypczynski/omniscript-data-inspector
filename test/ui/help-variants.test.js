'use strict';

/* The Free wording of a layered entry: an edit changes whichever part holds
 * its text, the third element is kept, and an edit nothing matches throws. */

import { stubChromeDevtools } from './support/panel-fixture.js';

let wordedFor;
beforeAll(async () => {
  stubChromeDevtools();
  ({ wordedFor } = await import('../../src/ui/help/variants.js'));
});

describe('Free wording of a layered entry', () => {
  const entry = ['Thing', 'Use it here. It also does X.', { short: 'Does a thing, with Y.', more: 'Details about Z.' }];

  it('edits the text, the short line and the details, and keeps the rest', () => {
    const wording = { Thing: ['no.such.gate', [[' It also does X.', ''], [', with Y', ''], ['about Z', 'about it']]] };
    expect(wordedFor(wording, entry)).toEqual(['Thing', 'Use it here.', { short: 'Does a thing.', more: 'Details about it.' }]);
  });

  it('throws when no part holds the wording', () => {
    expect(() => wordedFor({ Thing: ['no.such.gate', [['missing', '']]] }, entry)).toThrow(/does not match/);
  });

  it('returns an entry unchanged when it has no Free wording', () => {
    expect(wordedFor({}, entry)).toBe(entry);
  });
});
