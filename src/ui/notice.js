'use strict';

/* The boxed message the tabs show instead of content: a heading (optional) and
 * a line of text, red when it reports an error. */

export function notice(title, body, isError) {
  const box = document.createElement('div');
  box.className = `notice${isError ? ' is-error' : ''}`;
  if (title) {
    const heading = document.createElement('h2');
    heading.textContent = title;
    box.appendChild(heading);
  }
  const p = document.createElement('div');
  p.textContent = body;
  box.appendChild(p);
  return box;
}

/* The last line of an empty state: where to go when the panel looks wrong. The
 * button is in the settings, behind the gear. */
export const BUNDLE_HINT = 'Something wrong? Save a debug bundle from Settings (the gear), under Tools, and send it with your report.';

export function bundleHint() {
  const line = document.createElement('div');
  line.className = 'notice-sub bundle-hint';
  line.textContent = BUNDLE_HINT;
  return line;
}
