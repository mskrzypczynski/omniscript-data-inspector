'use strict';

/* The order of the panel's tabs, which the user can change by dragging.
 * Pure: the order is kept as the tabs' labels joined by ", ", which is also
 * how the custom settings list shows it. */

const TAB_LABELS = Object.freeze({
  data: 'Data',
  structure: 'Structure',
  actions: 'Calls'
});

/* Names an order was saved under before the tab was renamed. */
const LEGACY_LABELS = Object.freeze({ 'remote actions': 'actions' });

export const DEFAULT_ORDER = Object.freeze(['data', 'structure', 'actions']);

export function formatOrder(order) {
  return order.map((key) => TAB_LABELS[key]).join(', ');
}

/* A saved order back to tab keys: names that are not tabs (Replay, which
 * moved to an extension of its own) are dropped and tabs it does not name (a
 * tab added later) go at the end, so the result always lists every tab once. */
export function parseOrder(text) {
  const byLabel = Object.fromEntries(Object.entries(TAB_LABELS).map(([key, label]) => [label.toLowerCase(), key]));
  Object.assign(byLabel, LEGACY_LABELS);
  const named = String(text || '').split(',').map((part) => byLabel[part.trim().toLowerCase()]).filter(Boolean);
  const unique = named.filter((key, at) => named.indexOf(key) === at);
  return unique.concat(DEFAULT_ORDER.filter((key) => !unique.includes(key)));
}

/* The order with KEY moved to position TO (clamped). */
export function moveTab(order, key, to) {
  if (!order.includes(key)) return order.slice();
  const rest = order.filter((other) => other !== key);
  const at = Math.max(0, Math.min(rest.length, to));
  return rest.slice(0, at).concat(key, rest.slice(at));
}
