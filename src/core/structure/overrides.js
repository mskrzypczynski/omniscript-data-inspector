'use strict';

/* Elements a custom Lightning web component draws instead of the standard one
 * (propSetMap.lwcComponentOverride, read into element.override by
 * core/shared/structure-model.js). The runtime then uses the component's own
 * markup and validation, which the definition cannot show, so these are listed
 * and findable; nothing about them is judged.
 *
 * Pure: no DOM, no chrome.*. */

export const OVERRIDE_EXPLAIN = 'its own markup and validation run instead of the standard element';

/* "Overridden by c-my-input: its own markup and validation run instead of the standard element". */
export function overrideTitle(element) {
  return `Overridden by ${element.override}: ${OVERRIDE_EXPLAIN}`;
}

/* The elements a component overrides, in script order. */
export function overriddenElements(elements) {
  return (elements || []).filter((element) => !!element.override);
}

/* c-my-custom-input, c:myCustomInput and myCustomInput are one component:
 * compared without the namespace, the case and the dashes. */
export function componentKey(name) {
  return String(name || '').trim().toLowerCase().replace(/^c[-:]/, '').replace(/[-_\s]/g, '');
}

/* The filter box's override: prefix. null when the query is not one; '' for
 * "every overridden element", else the component name asked for. */
export function overrideQuery(query) {
  const match = /^\s*override:(.*)$/i.exec(String(query || ''));
  return match ? match[1].trim() : null;
}

/* Is the element overridden, by the component named (any component for '')? */
export function matchesOverride(element, wanted) {
  if (!element.override) return false;
  const key = componentKey(wanted);
  return !key || componentKey(element.override).includes(key);
}
