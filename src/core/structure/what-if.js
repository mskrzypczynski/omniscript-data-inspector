'use strict';

/* "What if": values typed into the "Is now" cell of a rule table to see how the
 * rule would come out. They live in the panel only, as a Map of field -> value,
 * and are never written to the page. This keeps them honest: a value typed for
 * a field is dropped as soon as the data holds something else for that field,
 * because the live value has moved on.
 *
 * Pure: no DOM, no chrome.*. */

const NUMBER = /^-?\d+(\.\d+)?$/;

/* What the user typed, as the value to test with: a plain number is a number,
 * anything else is the text (blank is the empty string). */
export function parseWhatIf(text) {
  const value = String(text === undefined || text === null ? '' : text).trim();
  return NUMBER.test(value) ? Number(value) : value;
}

/* A value for the input box: what the field holds now, as text. */
export function whatIfText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* A short stand-in for what a field holds, to notice when it changes. */
export function fingerprint(value) {
  const text = JSON.stringify(value);
  return text === undefined ? 'undefined' : text;
}

/* The fields of `values` (field -> typed value) whose live value is no longer
 * the one they were typed against. `bases` maps each field to the fingerprint
 * of what it held when it was typed; `liveValue(field)` is what the data holds
 * now. */
export function staleWhatIf(values, bases, liveValue) {
  return [...values.keys()].filter((field) => fingerprint(liveValue(field)) !== bases.get(field));
}
