'use strict';

/* The Data help says what the tab does now: the entries that once described
 * behaviour which has since changed. */

import { DATA_HELP } from '../../../src/ui/help/data.js';
import { entryParts } from '../../../src/core/shared/help-entry.js';

/* All three depths of an entry: the facts may sit in its text or in its details. */
const entry = (title) => {
  const parts = entryParts(DATA_HELP.sections[0][1].find(([name]) => name === title));
  return [parts.short, parts.text, parts.more].join(' ');
};

describe('Data help', () => {
  it('says Raw follows the Tree\'s key order while Copy JSON and Save file keep the page\'s', () => {
    const text = entry('Tree / Form / Raw');
    expect(text).toContain('Tree\'s order');
    expect(text).toContain('the page\'s own key order');
    expect(text).not.toContain('Raw shows the data as the page holds it');
    expect(text).not.toContain('write that same text');
  });

  it('describes what counts as a record Id', () => {
    expect(entry('Buttons on a row')).toContain('checksum');
  });

  it('says what a jump looks like, and what c copies after it', () => {
    const text = entry('Jumping to a row');
    expect(text).toContain('flashes amber');
    expect(text).toContain('Nothing stays outlined');
    expect(text).toContain('c copies it');
    expect(entry('Keyboard in the tree')).toContain('as long as it flashes');
  });
});
