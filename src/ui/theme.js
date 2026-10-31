'use strict';

/* Follow the DevTools theme. The panel's own CSS follows the OS colour scheme
 * by default, which is wrong when DevTools is set to the other one; DevTools
 * tells extension panels which theme it is using, and tells them again when
 * the user changes it. Anything unrecognised leaves the OS preference alone. */

export function applyTheme(root, panels) {
  /* Chromium names its light theme 'default', Firefox 'light'. */
  const set = (name) => {
    if (name === 'dark') root.dataset.theme = 'dark';
    else if (name === 'default' || name === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
  };

  if (!panels) return;
  set(panels.themeName);
  /* Chromium calls a handler; Firefox fires onThemeChanged. */
  if (typeof panels.setThemeChangeHandler === 'function') panels.setThemeChangeHandler(set);
  else if (panels.onThemeChanged && typeof panels.onThemeChanged.addListener === 'function') panels.onThemeChanged.addListener(set);
}
