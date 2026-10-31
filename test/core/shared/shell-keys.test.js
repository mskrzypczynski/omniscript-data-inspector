'use strict';

import { isFocusModeKey, textSizeKey, isCompareJsonKey } from '../../../src/core/shared/shell-keys.js';

describe('isFocusModeKey', () => {
  it('is Ctrl or Cmd with the backslash', () => {
    expect(isFocusModeKey({ key: '\\', ctrlKey: true })).toBe(true);
    expect(isFocusModeKey({ key: '\\', metaKey: true })).toBe(true);
    expect(isFocusModeKey({ key: 'x', code: 'Backslash', ctrlKey: true })).toBe(true);
  });

  it('is not a bare backslash or another chord', () => {
    expect(isFocusModeKey({ key: '\\' })).toBe(false);
    expect(isFocusModeKey({ key: '\\', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isFocusModeKey({ key: '\\', ctrlKey: true, altKey: true })).toBe(false);
    expect(isFocusModeKey({ key: '/', ctrlKey: true })).toBe(false);
    expect(isFocusModeKey(null)).toBe(false);
  });
});

describe('textSizeKey', () => {
  it('maps = + - and 0 with Ctrl or Cmd', () => {
    expect(textSizeKey({ key: '=', ctrlKey: true })).toBe('larger');
    expect(textSizeKey({ key: '+', metaKey: true, shiftKey: true })).toBe('larger');
    expect(textSizeKey({ key: '-', ctrlKey: true })).toBe('smaller');
    expect(textSizeKey({ key: '0', metaKey: true })).toBe('reset');
  });

  it('ignores the keys without Ctrl or Cmd, and with Alt', () => {
    expect(textSizeKey({ key: '=' })).toBe(null);
    expect(textSizeKey({ key: '0' })).toBe(null);
    expect(textSizeKey({ key: '-', ctrlKey: true, altKey: true })).toBe(null);
    expect(textSizeKey({ key: 'a', ctrlKey: true })).toBe(null);
    expect(textSizeKey(undefined)).toBe(null);
  });
});

describe('isCompareJsonKey', () => {
  it('is Ctrl or Cmd with Shift and L', () => {
    expect(isCompareJsonKey({ key: 'L', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isCompareJsonKey({ key: 'l', metaKey: true, shiftKey: true })).toBe(true);
    expect(isCompareJsonKey({ key: 'x', code: 'KeyL', ctrlKey: true, shiftKey: true })).toBe(true);
  });

  it('is not DevTools\' own J, nor a chord with another modifier set', () => {
    expect(isCompareJsonKey({ key: 'J', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isCompareJsonKey({ key: 'L', ctrlKey: true })).toBe(false);
    expect(isCompareJsonKey({ key: 'L', shiftKey: true })).toBe(false);
    expect(isCompareJsonKey({ key: 'L', ctrlKey: true, shiftKey: true, altKey: true })).toBe(false);
    expect(isCompareJsonKey(null)).toBe(false);
  });
});
