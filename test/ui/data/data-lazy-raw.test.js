'use strict';

/* The Raw layout of a payload is work for the Raw view. The status bar asks
 * for it only to say whether Raw is exact, which matters only when the payload
 * holds a number above 2^53: reading a big payload while the Tree is showing
 * must not lay it out. */

import { jest } from '@jest/globals';

const rawView = jest.fn(() => ({ text: '{}', copyText: '{}', unsafe: true, exact: true }));
const hasUnsafeNumbers = jest.fn((raw) => /\d{16}/.test(String(raw)));

jest.unstable_mockModule('../../../src/core/shared/raw-json.js', () => ({
  rawView,
  hasUnsafeNumbers,
  formatRaw: () => ({ text: '', unsafe: false }),
  reorderKeys: () => null
}));

const { bootData } = await import('../support/data-page.js');

beforeEach(() => { rawView.mockClear(); hasUnsafeNumbers.mockClear(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('status bar and the Raw layout', () => {
  it('does not lay the payload out while the Tree is showing', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada', Total: 120 } } }] });
    expect(hasUnsafeNumbers).toHaveBeenCalled();
    expect(rawView).not.toHaveBeenCalled();
  });

  it('asks for it when the payload holds a number above 2^53, to say whether Raw is exact', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: '{"Step":{"Id":9007199254740993}}' }] });
    expect(rawView).toHaveBeenCalled();
  });
});
