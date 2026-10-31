'use strict';

/* The extension's version from its manifest, or null where there is none (a
 * test page, or the panel opened outside the extension). */

export function extensionVersion() {
  try {
    const version = chrome.runtime.getManifest().version;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}
