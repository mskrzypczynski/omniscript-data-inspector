'use strict';

/* The Properties tab: an element's propSetMap as rows a person can read.
 * Known keys get a human label and come first, in a fixed order; unknown keys
 * keep their own name and follow in definition order. Values are made short
 * (a boolean is a mark, an object is "{n keys}", a long string is cut) while
 * the full value stays on the row for a view to open. Keys the runtime uses
 * for itself (_..., lwc..., pubsub..., ssm...) are set apart as internal.
 *
 * A value that holds others (an object, a list) also comes with a `view` a
 * form can draw: nested rows, a rule, assignments, or JSON as the last
 * resort. See valueView.
 *
 * Pure: no DOM, no chrome.*. */

import { describeShow, hasShowRules } from '../shared/structure-model.js';
import { assignmentsOf } from '../shared/references.js';
import { propertyDoc } from './property-docs.js';

/* [key, label], in the order they are listed. */
const KNOWN = [
  ['label', 'Label'],
  ['textKey', 'Text key'],
  ['text', 'Text'],
  ['required', 'Required'],
  ['readOnly', 'Read only'],
  ['repeat', 'Repeat'],
  ['repeatLimit', 'Repeat limit'],
  ['show', 'Conditional View'],
  ['defaultValue', 'Default value'],
  ['placeholder', 'Placeholder'],
  ['helpText', 'Help text'],
  ['helpTextPos', 'Help text position'],
  ['controlWidth', 'Width'],
  ['inputWidth', 'Input width'],
  ['mask', 'Input mask'],
  ['min', 'Minimum'],
  ['max', 'Maximum'],
  ['minLength', 'Minimum length'],
  ['maxLength', 'Maximum length'],
  ['expression', 'Formula'],
  ['options', 'Options'],
  ['bundle', 'Data Mapper bundle'],
  ['preTransformBundle', 'Pre-transform bundle'],
  ['postTransformBundle', 'Post-transform bundle'],
  ['integrationProcedureKey', 'Integration Procedure'],
  ['remoteClass', 'Remote class'],
  ['remoteMethod', 'Remote method'],
  ['remoteOptions', 'Remote options'],
  ['elementValueMap', 'Set Values'],
  ['elementErrorMap', 'Errors'],
  ['validateExpression', 'Validation expression'],
  ['messages', 'Messages'],
  ['validationRequired', 'Checked'],
  ['lwcComponentOverride', 'Overridden by'],
  ['lwcOverride', 'Overridden by']
];

const LABELS = new Map(KNOWN);
const ORDER = new Map(KNOWN.map(([key], i) => [key, i]));

/* Keys the runtime uses for itself. The two that name the custom component
 * standing in for a standard element are the script's own choice ("Overridden
 * by") and are shown. */
const INTERNAL = /^(_|lwc|pubsub|ssm)/i;
const SHOWN_DESPITE_PREFIX = new Set(['lwcComponentOverride', 'lwcOverride']);

export const LONG_TEXT = 80;

/* How deep a value is drawn as nested tables, and how many keys one level may
 * hold before it falls back to JSON. */
export const MAX_DEPTH = 3;
export const MAX_KEYS = 30;

/* Properties whose text the runtime evaluates when it starts with "=": the
 * texts a person reads (labels, hints, messages, a default). Every other string
 * that starts with "=" (a Formula element's own expression, a "=== Totals ===")
 * is shown as the text it is. `id` is a view's id: the key, or the path to a
 * nested one (messages.0.text, elementErrorMap.Field). */
const FORMULA_KEYS = new Set([
  'text', 'label', 'helpText', 'hint', 'placeholder', 'defaultValue', 'repeatLabel', 'message', 'errorMessage', 'title'
]);

export function takesFormula(id) {
  const path = String(id || '').split('.');
  return FORMULA_KEYS.has(path[path.length - 1]) || (path[0] === 'elementErrorMap' && path.length > 1);
}

export const isInternalKey = (key) => INTERNAL.test(key) && !SHOWN_DESPITE_PREFIX.has(key);

export const propertyLabel = (key) => LABELS.get(key) || key;

/* Every key that has a readable name. */
export const knownPropertyKeys = () => KNOWN.map(([key]) => key);

function summaryOf(value) {
  if (Array.isArray(value)) return `[${value.length} ${value.length === 1 ? 'item' : 'items'}]`;
  const count = Object.keys(value).length;
  return `{${count} ${count === 1 ? 'key' : 'keys'}}`;
}

function scalarView(id, value) {
  if (typeof value === 'boolean') return { id, kind: 'bool', text: value ? '✓' : '–', value, long: false, full: '' };
  if (value === null || value === undefined) return { id, kind: 'null', text: '–', value, long: false, full: '' };
  if (typeof value === 'number') return { id, kind: 'number', text: String(value), value, long: false, full: '' };
  const text = String(value);
  if (text === '') return { id, kind: 'text', text: '(empty)', value, long: false, full: '' };
  if (text.length > LONG_TEXT) {
    return { id, kind: 'text', text: `${text.slice(0, LONG_TEXT)}…`, value, long: true, full: text };
  }
  return { id, kind: 'text', text, value, long: false, full: '' };
}

/* An option of a choice element: { name, value } or { label, value }, which
 * reads as one line, label → value. null for any other shape. */
function optionLine(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const keys = Object.keys(item);
  if (!keys.includes('value') || keys.some((key) => !['name', 'label', 'value'].includes(key))) return null;
  const hasLabel = typeof item.label === 'string' && item.label !== '';
  const hasName = typeof item.name === 'string' && item.name !== '';
  if (hasLabel === hasName) return null;
  return { label: hasLabel ? item.label : item.name, value: item.value };
}

/* What a form draws for a value, at nesting level `depth` (1 for the value of
 * a row). Every view carries an `id` the form can key its open/closed state by.
 *   rows         — { rows: [{ label, key, view }] } an object, or a list: an
 *                  option becomes label → value, any other item #n → its view
 *   rule         — { rule } a show rule or validation expression
 *   assignments  — { items: [{ target, expression }] } a Set Values map
 *   json         — { value, text } deeper than MAX_DEPTH, or more than MAX_KEYS
 *                  keys: the form offers the JSON on request
 *   bool, null, number, text — the scalars, as in a row */
export function valueView(key, value, depth = 1, id = key) {
  if (value === null || typeof value !== 'object') return scalarView(id, value);

  if ((key === 'show' || key === 'validateExpression') && !Array.isArray(value) && hasShowRules(value)) {
    return { id, kind: 'rule', rule: value, text: describeShow(value) };
  }
  if (key === 'elementValueMap') {
    const items = assignmentsOf({ setValues: value });
    if (items.length) return { id, kind: 'assignments', items };
  }

  const entries = Array.isArray(value) ? value : Object.keys(value);
  if (!entries.length) return { id, kind: 'null', text: '(empty)', value, long: false, full: '' };
  if (depth > MAX_DEPTH || entries.length > MAX_KEYS) return { id, kind: 'json', value, text: summaryOf(value) };

  const rows = Array.isArray(value)
    ? value.map((item, i) => {
      const option = optionLine(item);
      const label = option ? option.label : String(i + 1);
      const own = option ? option.value : item;
      return { label, key: String(i), view: valueView(option ? 'value' : String(i), own, depth + 1, `${id}.${i}`) };
    })
    : Object.keys(value).map((name) => ({
      label: name, key: name, view: valueView(name, value[name], depth + 1, `${id}.${name}`)
    }));
  return { id, kind: 'rows', rows };
}

/* One row for a value:
 *   key, label, doc (what the key means, '' when unknown), internal
 *   kind  — 'bool' | 'null' | 'number' | 'text' | 'object' | 'array'
 *   text  — the short form: ✓ / – for a boolean, "{n keys}", "[n items]", or a
 *           string cut at LONG_TEXT (a show or validation rule reads as its
 *           expression)
 *   full  — the whole string, when it was cut (long: true), else ''
 *   value — the value itself, for the disclosure of an object or array
 *   view  — valueView(): what a form draws for it */
function rowFor(key, value) {
  const row = {
    key, label: propertyLabel(key), doc: propertyDoc(key), internal: isInternalKey(key), value, long: false, full: '',
    view: valueView(key, value)
  };

  if (typeof value === 'boolean') return { ...row, kind: 'bool', text: value ? '✓' : '–' };
  if (value === null || value === undefined) return { ...row, kind: 'null', text: '–' };
  if (typeof value === 'number') return { ...row, kind: 'number', text: String(value) };
  if (Array.isArray(value)) {
    return { ...row, kind: 'array', text: `[${value.length} ${value.length === 1 ? 'item' : 'items'}]` };
  }
  if (typeof value === 'object') {
    const count = Object.keys(value).length;
    const readable = (key === 'show' || key === 'validateExpression') ? describeShow(value) : '';
    return { ...row, kind: 'object', text: readable || `{${count} ${count === 1 ? 'key' : 'keys'}}` };
  }

  const text = String(value);
  if (text === '') return { ...row, kind: 'text', text: '(empty)' };
  if (text.length > LONG_TEXT) {
    return { ...row, kind: 'text', text: `${text.slice(0, LONG_TEXT)}…`, long: true, full: text };
  }
  return { ...row, kind: 'text', text };
}

/* { rows, internal }: the readable rows, and the internal ones set apart. An
 * element with no propSetMap gives two empty lists. */
export function propertyRows(element) {
  const map = element && element.node && element.node.propSetMap && typeof element.node.propSetMap === 'object'
    ? element.node.propSetMap : {};
  const keys = Object.keys(map);
  const position = (key) => (ORDER.has(key) ? ORDER.get(key) : KNOWN.length);

  const rows = keys
    .map((key, index) => ({ row: rowFor(key, map[key]), index }))
    .sort((a, b) => (position(a.row.key) - position(b.row.key)) || (a.index - b.index))
    .map(({ row }) => row);

  return { rows: rows.filter((row) => !row.internal), internal: rows.filter((row) => row.internal) };
}

/* The text of a row a query is looked up in: its names and its value. */
function haystack(row) {
  const nested = row.kind === 'text' || row.kind === 'number' ? '' : JSON.stringify(row.value);
  return `${row.label} ${row.key} ${row.full || row.text} ${nested}`.toLowerCase();
}

/* The rows whose label, key or value hold every word of the query. When none
 * does, the explanations are read too, so "columns" finds controlWidth. They
 * are a fallback and not part of the first pass because a word such as "name"
 * is in the explanation of a dozen rows and would bury the one the person
 * typed it for. */
export function filterPropertyRows(rows, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  const holds = (text) => words.every((word) => text.includes(word));
  const direct = rows.filter((row) => holds(haystack(row)));
  if (direct.length) return direct;
  return rows.filter((row) => holds(`${haystack(row)} ${String(row.doc || '').toLowerCase()}`));
}
