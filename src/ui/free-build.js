'use strict';

/* The Free build is the one where no gate is registered (see features.js). */

import { Features } from './features.js';

export const isFreeBuild = () => Features.registered().length === 0;
