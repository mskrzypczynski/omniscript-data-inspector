'use strict';

import { browserManifest } from '../../scripts/lib/browsers.mjs';

describe('browserManifest', () => {
  const manifest = { manifest_version: 3, name: 'X', version: '2.0.0', minimum_chrome_version: '114', permissions: ['storage'] };

  it('leaves the Chromium manifest as it is', () => {
    expect(browserManifest(manifest, 'chromium', 'x@example.com')).toBe(manifest);
  });

  it('gives Firefox its id, minimum version and data declaration, without the Chrome-only key', () => {
    const firefox = browserManifest(manifest, 'firefox', 'x@example.com');
    expect(firefox.minimum_chrome_version).toBeUndefined();
    expect(firefox.permissions).toEqual(['storage']);
    expect(firefox.browser_specific_settings.gecko).toEqual({
      id: 'x@example.com', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] }
    });
    expect(firefox.browser_specific_settings.gecko_android).toEqual({ strict_min_version: '142.0' });
    expect(manifest.minimum_chrome_version).toBe('114');
  });

  it('refuses an unknown browser', () => {
    expect(() => browserManifest(manifest, 'netscape', 'x@example.com')).toThrow(/Unknown browser/);
  });
});
