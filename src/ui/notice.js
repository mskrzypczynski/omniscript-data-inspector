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
