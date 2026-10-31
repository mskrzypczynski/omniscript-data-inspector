'use strict';

/* Text size: S / M / L / XL, applied as a zoom on the root element so every
 * tab scales together (the DevTools window itself is not touched): the factor
 * goes into --text-zoom, which panel.css turns into `zoom` on the root. It is a
 * setting like the others: kept only with Remember my settings, listed when it
 * differs from M, and put back by Restore default settings. Which sizes exist
 * and what a key does is decided in core/shared/text-size.js. */

import { normalizeTextSize, zoomOf, sizeAfterKey } from '../core/shared/text-size.js';
import { textSizeKey } from '../core/shared/shell-keys.js';
import { Settings } from './settings.js';

let current = 'M';

function paint(size) {
  current = normalizeTextSize(size);
  const root = document.documentElement;
  root.dataset.textSize = current;
  root.style.setProperty('--text-zoom', String(zoomOf(current)));
}

export const TextSize = {
  mount() {
    paint(Settings.get('textSize'));
    Settings.provide(() => ({ textSize: current }));
    Settings.onReset((scope) => {
      if (Settings.inScope(scope, 'textSize')) paint(Settings.get('textSize'));
    });

    /* Ctrl/Cmd + = - 0 inside the panel; DevTools keeps its own outside it. */
    document.addEventListener('keydown', (ev) => {
      const action = textSizeKey(ev);
      if (!action) return;
      ev.preventDefault();
      TextSize.set(sizeAfterKey(current, action));
    });
  },

  current: () => current,
  /* The factor now in force, for placing fixed boxes (see fixedPosition). */
  zoom: () => zoomOf(current),

  set(size) {
    const next = normalizeTextSize(size);
    if (next === current) return;
    paint(next);
    Settings.set('textSize', next);
  }
};
