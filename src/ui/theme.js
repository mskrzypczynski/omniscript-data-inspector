'use strict';

/* Follow the DevTools theme. The panel's own CSS follows the OS colour scheme
 * by default, which is wrong when DevTools is set to the other one; DevTools
 * tells extension panels which theme it is using, and tells them again when
 * the user changes it. Anything unrecognised leaves the OS preference alone. */

export function applyTheme(root, panels) {
  const set = (name) => {
    if (name === 'dark') root.dataset.theme = 'dark';
    else if (name === 'default') root.dataset.theme = 'light';
    else delete root.dataset.theme;
  };

  if (!panels) return;
  set(panels.themeName);
  if (typeof panels.setThemeChangeHandler === 'function') panels.setThemeChangeHandler(set);
}
