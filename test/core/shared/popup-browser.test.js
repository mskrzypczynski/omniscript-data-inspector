'use strict';

import { detectBrowser } from '../../../src/core/shared/popup-browser.js';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/130.0.0.0`;
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

describe('detectBrowser', () => {
  it('says Chromium for Chrome, Edge and anything else built on it', () => {
    expect(detectBrowser({ userAgent: CHROME, protocol: 'chrome-extension:' })).toBe('chromium');
    expect(detectBrowser({ userAgent: EDGE, protocol: 'chrome-extension:' })).toBe('chromium');
  });

  it('says Firefox for its user agent, and for its extension pages whatever the user agent says', () => {
    expect(detectBrowser({ userAgent: FIREFOX })).toBe('firefox');
    expect(detectBrowser({ userAgent: CHROME, protocol: 'moz-extension:' })).toBe('firefox');
  });

  it('keeps the Chromium default when it is told nothing', () => {
    expect(detectBrowser()).toBe('chromium');
    expect(detectBrowser({})).toBe('chromium');
    expect(detectBrowser({ userAgent: 'FirefoxLike', protocol: 'https:' })).toBe('chromium');
  });
});
