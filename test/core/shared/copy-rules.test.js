'use strict';

import { fragmentCopyText, caretInQuotes, caretValueText, rawLineValueAt } from '../../../src/core/shared/copy-rules.js';
import { MASK_STRING, MASK_NUMBER } from '../../../src/core/shared/mask.js';

describe('fragmentCopyText', () => {
  it('copies the highlighted text exactly when masking is off', () => {
    expect(fragmentCopyText('da Lo', { kind: 'string' })).toBe('da Lo');
    expect(fragmentCopyText(' "a', { kind: 'string' })).toBe(' "a');
  });

  it('replaces a piece of a string or number by its placeholder when masked', () => {
    expect(fragmentCopyText('da Lo', { masked: true, kind: 'string' })).toBe(MASK_STRING);
    expect(fragmentCopyText('12', { masked: true, kind: 'number' })).toBe(MASK_NUMBER);
  });

  it('keeps keys, booleans, null and blanks when masked', () => {
    expect(fragmentCopyText('Name', { masked: true, kind: 'plain' })).toBe('Name');
    expect(fragmentCopyText('   ', { masked: true, kind: 'string' })).toBe('   ');
  });
});

describe('caretInQuotes', () => {
  it('is true between the quotes and false outside them', () => {
    expect(caretInQuotes(' "Ad', 'a"')).toBe(true);
    expect(caretInQuotes(' "Ada', '"')).toBe(true);
    expect(caretInQuotes(' ', '"Ada"')).toBe(false);
    expect(caretInQuotes(' "Ada"', '')).toBe(false);
  });
});

describe('caretValueText', () => {
  it('gives a string as raw text inside its quotes and quoted outside them', () => {
    expect(caretValueText({ kind: 'string', raw: 'Ada "A"', inQuotes: true })).toBe('Ada "A"');
    expect(caretValueText({ kind: 'string', raw: 'Ada', inQuotes: false })).toBe('"Ada"');
  });

  it('gives numbers, booleans and null as they read', () => {
    expect(caretValueText({ kind: 'number', raw: '-1.5e3' })).toBe('-1.5e3');
    expect(caretValueText({ kind: 'boolean', raw: 'true' })).toBe('true');
    expect(caretValueText({ kind: 'null', raw: 'null' })).toBe('null');
  });

  it('masks strings and numbers but not booleans, null or empty strings', () => {
    expect(caretValueText({ kind: 'string', raw: 'Ada', masked: true })).toBe(MASK_STRING);
    expect(caretValueText({ kind: 'string', raw: 'Ada', inQuotes: false, masked: true })).toBe(`"${MASK_STRING}"`);
    expect(caretValueText({ kind: 'number', raw: '3', masked: true })).toBe(MASK_NUMBER);
    expect(caretValueText({ kind: 'boolean', raw: 'false', masked: true })).toBe('false');
    expect(caretValueText({ kind: 'string', raw: '', masked: true })).toBeNull();
  });

  it('has nothing to copy for other kinds', () => {
    expect(caretValueText({ kind: 'object', raw: '{' })).toBeNull();
  });
});

describe('rawLineValueAt', () => {
  const line = '  "name": "Ada \\"A\\"",';

  it('finds the string under a caret inside its quotes and decodes it', () => {
    expect(rawLineValueAt(line, 14)).toEqual({ kind: 'string', raw: 'Ada "A"', inQuotes: true });
  });

  it('treats the quote marks themselves as outside', () => {
    const start = line.indexOf('"Ada');
    expect(rawLineValueAt(line, start).inQuotes).toBe(false);
    expect(rawLineValueAt(line, line.lastIndexOf('"') + 1).inQuotes).toBe(false);
  });

  it('finds numbers, booleans and null, also as bare array items', () => {
    expect(rawLineValueAt('  "n": 12,', 8)).toEqual({ kind: 'number', raw: '12' });
    expect(rawLineValueAt('    true', 6)).toEqual({ kind: 'boolean', raw: 'true' });
    expect(rawLineValueAt('  "x": null', 8)).toEqual({ kind: 'null', raw: 'null' });
    expect(rawLineValueAt('    "item"', 7)).toEqual({ kind: 'string', raw: 'item', inQuotes: true });
  });

  it('ignores a caret on the key, and lines without a value', () => {
    expect(rawLineValueAt(line, 5)).toBeNull();
    expect(rawLineValueAt('  "a": {', 8)).toBeNull();
    expect(rawLineValueAt('  }', 2)).toBeNull();
  });
});
