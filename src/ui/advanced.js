'use strict';

/* The "Advanced" toggle switch in the scope bar. Controls that most sessions never
 * need carry the `adv` class and are hidden until it is on; turning it off
 * again tells each tab to put its advanced filters back to their defaults, so
 * nothing stays active out of sight. Not remembered between sessions. */

let enabled = false;
const listeners = [];

export const Advanced = {
  mount(button) {
    button.addEventListener('click', () => {
      enabled = !enabled;
      button.classList.toggle('is-on', enabled);
      button.setAttribute('aria-checked', String(enabled));
      document.body.classList.toggle('is-advanced', enabled);
      listeners.forEach((fn) => fn(enabled));
    });
  },
  on: () => enabled,
  subscribe: (fn) => listeners.push(fn)
};
