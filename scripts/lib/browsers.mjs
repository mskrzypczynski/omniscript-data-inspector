/* The browsers a build is made for, and the manifest each one takes.
 * Chromium covers Chrome, Edge, Brave and Opera, which take the same package;
 * Firefox (and Zen, LibreWolf, Floorp, Waterfox) needs its own manifest keys.
 * The code is the same: the panel asks src/kit/ui/devtools-page.js what the
 * browser can do. */

export const BROWSERS = ['chromium', 'firefox'];

/* data_collection_permissions, which addons.mozilla.org requires, is read
 * from Firefox 140 (the extended support release companies run) and Firefox
 * for Android 142. Android has no DevTools panels; its number only keeps the
 * manifest consistent. */
export const GECKO_MIN_VERSION = '140.0';
export const GECKO_ANDROID_MIN_VERSION = '142.0';

/* The manifest for one browser. Firefox drops the Chrome-only key and gains
 * browser_specific_settings: the add-on id (geckoId), the minimum version and
 * the data-collection declaration addons.mozilla.org requires (none). */
export function browserManifest(manifest, browser, geckoId) {
  if (!BROWSERS.includes(browser)) throw new Error(`Unknown browser "${browser}": use ${BROWSERS.join(' or ')}.`);
  if (browser === 'chromium') return manifest;
  const rest = { ...manifest };
  delete rest.minimum_chrome_version;
  return {
    ...rest,
    browser_specific_settings: {
      gecko: {
        id: geckoId,
        strict_min_version: GECKO_MIN_VERSION,
        data_collection_permissions: { required: ['none'] }
      },
      gecko_android: { strict_min_version: GECKO_ANDROID_MIN_VERSION }
    }
  };
}
