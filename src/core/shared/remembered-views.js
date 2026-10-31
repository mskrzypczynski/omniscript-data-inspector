'use strict';

/* The views and tabs that "Remember my settings" also puts back, with no
 * control of their own in the Settings dialog: the Data view (Tree, Form or Raw),
 * Structure's Current value view and the detail tab picked by hand, and the
 * Calls detail tab. An empty string is "none picked": each element or
 * call then opens on its own default tab, as before.
 *
 * Deliberately not here: Data's Sizes and Changes (a look at the moment, not a
 * way of reading), and Structure's JSON tab (the raw source, for the
 * element it was picked on). Pure. */

export const VIEW_CHOICES = Object.freeze({
  dataView: Object.freeze(['tree', 'form', 'raw']),
  structValueView: Object.freeze(['form', 'tree', 'raw']),
  structDetailTab: Object.freeze(['', 'value', 'options', 'props', 'conditions', 'validation', 'calls']),
  logDetailTab: Object.freeze(['', 'input', 'output', 'options'])
});

/* What to store when the user picks `value`: the value when this setting
 * keeps it, else null (nothing is written; what was kept stays). */
const choicesOf = (key) => (Object.prototype.hasOwnProperty.call(VIEW_CHOICES, key) ? VIEW_CHOICES[key] : null);

export function viewToKeep(key, value) {
  const choices = choicesOf(key);
  return choices && choices.includes(value) ? value : null;
}

/* What to open on: the stored value while it is still one of the choices,
 * else the fallback (an old version's name, or one edited by hand). */
export function viewToOpen(key, stored, fallback) {
  const choices = choicesOf(key);
  return choices && choices.includes(stored) ? stored : fallback;
}

/* Structure's hand-picked tab as it is kept: the tab, or '' for none and for
 * Definition. */
export function pickedTabToKeep(picked) {
  return viewToKeep('structDetailTab', picked) || '';
}

/* Calls' tab as it is kept: only a tab the user picked by hand, and
 * only Input, Output or Options (Changes, Hops and Compare belong to one
 * call), else ''. */
export function logTabToKeep(tab, picked) {
  return picked ? (viewToKeep('logDetailTab', tab) || '') : '';
}
