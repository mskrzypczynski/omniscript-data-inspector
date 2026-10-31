'use strict';

/* The one way the panel reaches the inspected page: the kit's DevTools page
 * facade (src/kit/ui/devtools-page.js), so the differences between Chromium
 * (Chrome, Edge) and Firefox stay in one place. Page.can says what this
 * browser supports; Firefox runs expressions in the top document only. */

import { createPage } from '../kit/ui/devtools-page.js';

export const Page = createPage();
