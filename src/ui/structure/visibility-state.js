'use strict';

/* Which elements are hidden right now, and why, kept on the Structure tab's
 * state. Thin layer over src/core/visibility.js that adds the caching a tab
 * that redraws on every poll needs. */

import { computeVisibility, explainVisibility } from '../../core/visibility.js';

export function isHidden(state, element) {
  const info = state.visibility[element.key];
  return !!(info && info.hidden);
}

/* True when the set of hidden elements changed. */
export function updateVisibility(state) {
  const next = computeVisibility(state.elements, state.data);
  const signature = (map) => state.elements.map((e) => (map[e.key] && map[e.key].hidden ? '1' : '0')).join('');
  const changed = signature(next) !== signature(state.visibility);
  state.visibility = next;
  return changed;
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
