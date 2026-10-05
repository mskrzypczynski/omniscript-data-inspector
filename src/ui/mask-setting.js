'use strict';

/* The "Mask values" switch in the scope bar, read by everything that puts data
 * on the clipboard or into a file. Deliberately not remembered between
 * sessions: nothing is stored, and masking starts off every time. */

import { maskValues } from '../core/mask.js';

let enabled = false;

export const Mask = {
  mount(checkbox) {
    const label = checkbox.closest('label');
    checkbox.addEventListener('change', () => {
      enabled = checkbox.checked;
      if (label) label.classList.toggle('is-on', enabled);
    });
  },
  on: () => enabled,
  /* The value as it should leave the panel. */
  apply: (value) => (enabled ? maskValues(value) : value)
};
