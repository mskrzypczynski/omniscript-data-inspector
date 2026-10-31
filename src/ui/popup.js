'use strict';

/* The toolbar popup (popup.html): marks the page with the browser it runs in,
 * and the page's own styles show the steps for that browser. A separate file
 * because an extension page may not run inline script. Without it the popup
 * keeps the Chromium steps it starts with. */

import { detectBrowser } from '../core/shared/popup-browser.js';

document.documentElement.dataset.browser = detectBrowser({
  userAgent: navigator.userAgent,
  protocol: location.protocol
});
