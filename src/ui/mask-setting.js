'use strict';

/* The "Mask values" switch in the top bar, read by everything that puts data
 * on the clipboard or into a file. Deliberately not a stored setting: masking
 * starts off every time DevTools opens, unless Mask values at start (Settings,
 * General) says to turn it on at the start. The switch can still be turned off
 * for the session, and what it is now is never remembered. */

import { maskValues } from '../core/shared/mask.js';
import { Settings, SESSION_DEFAULTS } from './settings.js';

let enabled = false;

export const Mask = {
  mount(checkbox) {
    const label = checkbox.closest('label');
    const chip = document.getElementById('status-mask');
    const set = (on) => {
      enabled = on;
      checkbox.checked = on;
      if (label) label.classList.toggle('is-on', enabled);
      if (chip) chip.hidden = !enabled;
      Settings.notify();
    };
    checkbox.addEventListener('change', () => set(checkbox.checked));
    if (Settings.get('maskAtStart') === true) set(true);
    Settings.provide(() => ({ mask: enabled }));
    Settings.onReset((scope) => {
      if (Settings.inScope(scope, 'mask') && enabled !== SESSION_DEFAULTS.mask) set(SESSION_DEFAULTS.mask);
    });
  },
  on: () => enabled,
  /* The value as it should leave the panel. */
  apply: (value) => (enabled ? maskValues(value) : value)
};
