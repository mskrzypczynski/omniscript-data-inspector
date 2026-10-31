'use strict';

import * as panelMask from '../../../src/core/shared/mask.js';
import * as kitMask from '../../../src/kit/core/mask.js';

const { payloadText } = panelMask;

/* maskValues and maskJsonText are tested in the kit; here only that the panel
 * hands out the kit's own functions, and payloadText, which is the panel's. */
describe('mask.js', () => {
  it('re-exports the kit masking unchanged', () => {
    ['MASK_STRING', 'MASK_NUMBER', 'maskValues', 'maskJsonText'].forEach((name) => {
      expect(panelMask[name]).toBe(kitMask[name]);
    });
  });
});

describe('payloadText', () => {
  test('unparsable payload is raw text, or null when masking', () => {
    expect(payloadText({ parseError: 'x', raw: 'abc', data: undefined }, false)).toBe('abc');
    expect(payloadText({ parseError: 'x', raw: 'abc', data: undefined }, true)).toBeNull();
    expect(payloadText({ parseError: 'x', raw: null, data: undefined }, false)).toBe('');
  });
  test('no data is empty; data is pretty-printed and masked on request', () => {
    expect(payloadText({ parseError: null, raw: null, data: undefined }, false)).toBe('');
    expect(payloadText({ parseError: null, raw: '', data: { a: 'x' } }, false)).toBe('{\n  "a": "x"\n}');
    expect(payloadText({ parseError: null, raw: '', data: { a: 'x' } }, true)).toBe('{\n  "a": "<string>"\n}');
  });
});
