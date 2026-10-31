'use strict';

/* The one registry the panel asks about gated features. A build that
 * carries them fills it before src/ui/app.js runs; the Free build never
 * touches it, so every gate stays closed. See src/core/shared/features.js
 * for has() against on(). */

import { createFeatureRegistry } from '../core/shared/features.js';

export const Features = createFeatureRegistry();
