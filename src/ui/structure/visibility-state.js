'use strict';

/* Which elements are hidden right now, and why, kept on the Structure tab's
 * state. Thin layer over src/core/structure/visibility.js that adds the caching a tab
 * that redraws on every poll needs. */

import { computeVisibility, explainVisibility, isCertainlyHidden as certainlyHidden } from '../../core/structure/visibility.js';

export function isHidden(state, element) {
  const info = state.visibility[element.key];
  return !!(info && info.hidden);
}

/* Hidden for certain: what the list tags "hidden" and the status bar counts. */
export function isCertainlyHidden(state, element) {
  return certainlyHidden(state.visibility[element.key]);
}

/* One string for what the list shows about visibility: which elements are
 * hidden and, for those, the reason on their tag. */
function visibilitySignature(state, map) {
  const byKey = elementsByKey(state);
  return state.elements.map((element) => {
    const info = map[element.key];
    if (!info || !info.hidden) return '0';
    return `${certainlyHidden(info) ? '1' : '2'}${explainVisibility(element, map, byKey).headline}`;
  }).join('\n');
}

/* True when the set of hidden elements, or the reason one is hidden, changed. */
export function updateVisibility(state) {
  const before = visibilitySignature(state, state.visibility);
  state.visibility = computeVisibility(state.elements, state.data);
  return visibilitySignature(state, state.visibility) !== before;
}

/* Rebuilt only when the list of elements is replaced, not per row. */
let byKeyCache = { elements: null, map: null };

export function elementsByKey(state) {
  if (byKeyCache.elements !== state.elements) {
    const map = {};
    state.elements.forEach((element) => { map[element.key] = element; });
    byKeyCache = { elements: state.elements, map };
  }
  return byKeyCache.map;
}

export function explain(state, element) {
  return explainVisibility(element, state.visibility, elementsByKey(state));
}

/* A string that changes exactly when the detail pane's visibility text would. */
export function whyKey(state, element) {
  if (!element) return '';
  const why = explain(state, element);
  return JSON.stringify([why.headline, why.lines]);
}
