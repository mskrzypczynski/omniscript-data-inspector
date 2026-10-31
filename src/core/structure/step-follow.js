'use strict';

/* Which element is "the current step", and whether Follow current step should move the
 * selection to it. Decisions only; the Structure tab does the selecting.
 *
 * Pure: no DOM, no chrome.*. */

/* The step the OmniScript is on, or the action when it is on one.
 * `progress` is executionStatus()'s output. */
export function currentElement(elements, progress) {
  return elements.find((element) => progress[element.key] === 'current' && element.category.key === 'step') ||
    elements.find((element) => progress[element.key] === 'current') || null;
}

/* Should Follow current step select `current`? It only moves a selection it made
 * itself: an element picked by hand (anything other than the step it last
 * selected) stays until the user turns Follow back on or presses Current
 * step, which pass force. */
export function shouldFollow({ current, selectedKey, followedKey, force = false }) {
  if (!current || current.key === selectedKey) return false;
  const handPicked = !!selectedKey && selectedKey !== followedKey;
  return !handPicked || force;
}
