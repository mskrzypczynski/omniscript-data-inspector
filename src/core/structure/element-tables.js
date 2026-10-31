'use strict';

/* The tables the detail pane draws for elements whose definition is a list in
 * disguise, each decided here from the element and the live data:
 *
 *   Options          Select, Radio, Multi-select, Lookup and Type Ahead: each option's
 *                    label and value, and which one the data holds now
 *   Formula          a Formula element: the expression, what it comes to, the fields it reads
 *   Merge fields     Text Block, Headline and Messaging: the %merge% fields their text reads
 *   Additional input an action's extra payload, and its remote options
 *
 * Set Values has its own module (set-values.js). Every table is in the shape
 * of table-model.js. Best effort: a shape this does not know gives no table.
 *
 * Pure: no DOM, no chrome.*. */

import { hasOptionSource, isTextBlock, resolveElementValue } from '../shared/structure-model.js';
import { MASK_STRING, MASK_NUMBER } from '../shared/mask.js';
import { formulaOf } from './formula-values.js';
import { reader, fieldValue, fieldsRead, resolveExpression, resolveLeaves } from './expression-values.js';
import { setValuesTable } from './set-values.js';
import { notEvaluatedText } from './formula.js';
import { textCell, valueCell, unknownCell, fieldCell } from './table-model.js';
import { readFromDataTag } from './fact-words.js';

const propsOf = (element) => (element && element.node && element.node.propSetMap && typeof element.node.propSetMap === 'object'
  ? element.node.propSetMap : {});

/* ------------------------------------------------------------ options */

const OPTION_TYPE = /radio|select|lookup|type ?ahead|picklist/i;
const NOT_OPTION_TYPE = /checkbox|toggle|set ?values/i;

const hasText = (value) => typeof value === 'string' && value !== '';

/* Does the element choose from a list of options typed into its definition? An
 * option list that comes from a Data Mapper, an object or custom code holds no
 * options of its own. */
export function hasOptions(element) {
  if (!element || !OPTION_TYPE.test(element.type || '') || NOT_OPTION_TYPE.test(element.type || '')) return false;
  const props = propsOf(element);
  return Array.isArray(props.options) && props.options.length > 0 && !hasOptionSource(props);
}

/* { label, stored, texts } of an option: { name, value } keeps the data in `name` and the
 * text people read in `value` (a custom label key in a multi-language script, which
 * element.optionLabels has resolved), { label, value } the other way round. `texts` is
 * what a value may be written as: the Value type hints take the label as an option
 * too, because a script can store it, so the two agree. */
function optionOf(element, option) {
  if (!option || typeof option !== 'object') return null;
  if (hasText(option.label) && option.value !== undefined && option.name === undefined) {
    return { label: option.label, stored: option.value, texts: [option.value, option.label] };
  }
  if (option.name === undefined || option.name === null) return null;
  const stored = option.name;
  const resolved = element.optionLabels && element.optionLabels[String(stored)];
  const raw = option.value !== undefined && option.value !== null ? String(option.value) : '';
  return { label: resolved || raw, stored, texts: [stored, raw, resolved].filter((text) => text !== undefined && text !== '') };
}

/* What the data holds, as a list of values: a Multi-select's list, or its text with ";"
 * between the choices, or the one value. Empty for nothing. */
function heldValues(element, value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== '');
  if (typeof value === 'string' && /multi/i.test(element.type || '') && value.includes(';')) {
    return value.split(';').map((part) => part.trim()).filter(Boolean);
  }
  return [value];
}

/* A value a bundle saved with Mask values on holds instead of the answer. */
const isPlaceholder = (value) => value === MASK_STRING || value === MASK_NUMBER;

/* Which options the data holds now:
 *   options — [{ label, stored, held }]
 *   held    — the values the data holds ([] for none)
 *   unmatched — the held values that are none of the options
 *   masked  — the data holds masked values (a bundle saved with Mask values on), so which
 *             option it holds cannot be told: nothing is ticked and nothing is a finding
 * null when the element has no options of its own. */
export function optionsState(element, data, rows) {
  if (!hasOptions(element)) return null;
  const options = propsOf(element).options.map((option) => optionOf(element, option)).filter(Boolean);
  const hasData = data !== undefined && data !== null && typeof data === 'object';
  const all = hasData ? heldValues(element, resolveElementValue(element, data, rows)) : [];
  const masked = all.some(isPlaceholder);
  const held = masked ? [] : all;
  const isOne = (option, value) => option.texts.some((text) => String(text) === String(value));
  return {
    options: options.map((option) => ({ label: option.label, stored: option.stored, held: held.some((value) => isOne(option, value)) })),
    held,
    unmatched: held.filter((value) => !options.some((option) => isOne(option, value))),
    hasData,
    masked
  };
}

/* A stored value as plain text. */
function storedText(stored) {
  if (stored === '') return '(empty)';
  return typeof stored === 'object' && stored !== null ? JSON.stringify(stored) : String(stored);
}

const quoted = (values) => values.map((value) => `“${typeof value === 'object' ? JSON.stringify(value) : String(value)}”`).join(', ');

/* A finding worth a chip in the head: { text, title } when the data holds a value
 * that is none of the element's options, else null. */
export function optionsFinding(element, data, rows) {
  const found = optionsState(element, data, rows);
  if (!found || !found.unmatched.length) return null;
  return {
    text: `No option matches ${quoted(found.unmatched)}`,
    title: 'The data holds a value that is none of the options in the definition. The Options tab lists them.'
  };
}

/* The tag in the Options card's header: the data holds a value that is none of
 * the options, or it is masked so the choice cannot be told; else none. */
function optionsVerdict(found) {
  if (found.masked) {
    return { text: 'masked', tone: 'neutral', title: 'The data is masked, so which option it holds cannot be told.' };
  }
  if (found.hasData && found.unmatched.length) {
    return { text: 'No match', tone: 'warn', title: `None matches: the data holds ${quoted(found.unmatched)}, which is not an option.` };
  }
  return null;
}

export function optionsTable(element, data, rows) {
  const found = optionsState(element, data, rows);
  if (!found) return null;
  const verdict = optionsVerdict(found);
  return {
    id: 'options',
    title: 'Options',
    tip: 'Each option of the list: the text people read and the value the data stores. A tick marks the one the data holds now.',
    ...(verdict ? { verdict } : {}),
    layout: 'table',
    columns: [{ id: 'label', label: 'Label' }, { id: 'value', label: 'Value' }, { id: 'now', label: 'Selected' }],
    rows: found.options.map((option) => ({
      tone: option.held ? 'ok' : '',
      cells: [
        textCell(option.label || '(empty)', { tone: option.label ? '' : 'muted', prose: true }),
        textCell(storedText(option.stored), { title: 'The value the data stores' }),
        // Every row says the same in a masked copy: a "(masked)" on one row only would name
        // the option the data holds.
        option.held
          ? { text: '✓', aria: 'selected', data: true, masked: '(masked)', title: 'The data holds this option now' }
          : { text: '', data: true, masked: '(masked)' }
      ]
    })),
    empty: 'This element has no options of its own.'
  };
}

/* ------------------------------------------------------------ formula */

/* What the formula comes to now: its estimate; when the panel cannot evaluate it
 * but the data holds the element's value, that value, tagged "read from the
 * data"; else can't tell, with the reason in the tooltip. */
function computedCell(element, data, rows, result) {
  if (result.ok) return valueCell(result.value, { estimated: true });
  const held = data !== undefined && data !== null && typeof data === 'object' ? resolveElementValue(element, data, rows) : undefined;
  if (held !== undefined && held !== null) return { ...valueCell(held), tag: readFromDataTag(result.reason, element.name) };
  return unknownCell(notEvaluatedText(result.reason));
}

export function formulaTable(element, data, refs, rows, estimator) {
  const expression = formulaOf(element);
  if (!expression) return null;
  const read = reader(data, refs, rows, estimator);
  const result = estimator.estimate(element);
  const tableRows = [
    { label: textCell('Expression'), value: textCell(expression, { title: 'As written in the definition' }) },
    { label: textCell('Computed value'), value: computedCell(element, data, rows, result) }
  ];
  const fields = fieldsRead(expression);
  if (fields.length) tableRows.push({ heading: 'Elements it reads' });
  fields.forEach((field) => {
    const held = fieldValue(field, read);
    tableRows.push({
      label: fieldCell(field, { refs, data }, { title: 'Read by the formula' }),
      value: held ? valueCell(held.value, { estimated: held.estimated }) : valueCell(undefined)
    });
  });
  return {
    id: 'formula',
    title: 'Formula',
    tip: 'The expression, what it comes to now (estimated best effort) and the elements it reads, with what each holds.',
    layout: 'rows',
    columns: [],
    rows: tableRows,
    empty: ''
  };
}

/* ------------------------------------------------------------ merge fields */

const READS_TEXT = /headline|messaging/i;

/* The texts of an element that read the data: a Text Block's, a Headline's, the
 * messages of a Messaging element. */
function textsOf(element) {
  const props = propsOf(element);
  const isText = isTextBlock(element) || READS_TEXT.test(element.type || '');
  if (!isText) return [];
  const out = [];
  const add = (text) => { if (hasText(text)) out.push(text); };
  if (/messaging/i.test(element.type || '')) {
    (Array.isArray(props.messages) ? props.messages : []).forEach((message) => message && add(message.text));
    return out;
  }
  add(props.text);
  if (!out.length) add(props.label);
  if (!out.length && isTextBlock(element)) add(element.label);
  return out;
}

export function mergeFieldsTable(element, data, refs, rows, estimator) {
  const fields = [];
  textsOf(element).forEach((text) => fieldsRead(text).forEach((field) => { if (!fields.includes(field)) fields.push(field); }));
  if (!fields.length) return null;
  const read = reader(data, refs, rows, estimator);
  return {
    id: 'merge-fields',
    title: 'Merge fields',
    tip: 'The %merge% fields the text reads, with what the data holds for each now.',
    layout: 'table',
    columns: [{ id: 'field', label: 'Field' }, { id: 'now', label: 'Current value' }],
    rows: fields.map((field) => {
      const held = read.hasData ? fieldValue(field, read) : undefined;
      return {
        cells: [
          fieldCell(field, { refs, data }, {}, { withLabel: true }),
          read.hasData ? valueCell(held ? held.value : undefined, { estimated: !!(held && held.estimated) }) : unknownCell('No data was read')
        ]
      };
    }),
    empty: ''
  };
}

/* ------------------------------------------------------------ additional input */

/* An object, or JSON text that holds one; null for anything else. */
function mapOf(value) {
  let object = value;
  if (typeof value === 'string' && value.trim()) {
    try { object = JSON.parse(value); } catch { return null; }
  }
  return object && typeof object === 'object' && !Array.isArray(object) ? object : null;
}

const writtenAs = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

function comesToCell(value, read) {
  if (typeof value !== 'string') {
    /* An object or list: each string inside is read on its own, so a value with a quote in it
     * cannot break the JSON the cell shows. */
    const written = writtenAs(value);
    const leaves = resolveLeaves(value, read);
    if (leaves.missing.length) return unknownCell(`No value yet for ${leaves.missing.map((ref) => `%${ref}%`).join(', ')}`);
    return leaves.changed ? { text: JSON.stringify(leaves.value), data: true, masked: '(masked)' } : textCell(written);
  }
  const result = resolveExpression(value, read);
  if (result.isFormula) {
    if (result.estimated) return valueCell(result.resolved, { estimated: true });
    return unknownCell(result.formulaReason ? notEvaluatedText(result.formulaReason) : 'The formula could not be evaluated');
  }
  if (!result.missing.length && result.text === value) return valueCell(value, { data: false });
  if (result.missing.length) return unknownCell(`No value yet for ${result.missing.map((ref) => `%${ref}%`).join(', ')}`);
  return result.resolved !== undefined ? valueCell(result.resolved) : { text: result.text, data: true, masked: '(masked)' };
}

function mapTable(id, title, tip, map, read) {
  const names = Object.keys(map);
  if (!names.length) return null;
  return {
    id,
    title,
    tip,
    layout: 'table',
    columns: [{ id: 'name', label: 'Name' }, { id: 'value', label: 'Value' }, { id: 'comes-to', label: 'Computed value' }],
    rows: names.map((name) => ({
      cells: [
        textCell(name),
        textCell(writtenAs(map[name]), { title: 'As written in the definition' }),
        read.hasData ? comesToCell(map[name], read) : unknownCell('No data was read')
      ]
    })),
    empty: ''
  };
}

/* The Additional input (extraPayload) and Remote options (remoteOptions) cards of an
 * action, each only when the action sets any. */
export function additionalInputTables(element, data, refs, rows, estimator) {
  if (!element || !element.remote) return [];
  const props = propsOf(element);
  const read = reader(data, refs, rows, estimator);
  return [
    mapTable('extra-input', 'Additional input',
      'The extra input the action sends with its data, as written and as it comes to now.', mapOf(props.extraPayload) || {}, read),
    mapTable('remote-options', 'Remote options',
      'The options the action passes to the remote call, as written and as they come to now.', mapOf(props.remoteOptions) || {}, read)
  ].filter(Boolean);
}

/* ------------------------------------------------------------ which tab shows what */

/* The tables a tab of the detail pane starts with:
 *   value   — the Set Values card of a Set Values element, the Formula card of a Formula element
 *   options — the Options card
 *   props   — the Merge fields card of a text
 *   calls   — Additional input and Remote options
 * Always a list, empty for a tab with none. */
export function elementTables({ tab, element, data, refs, rows, estimator }) {
  if (!element) return [];
  if (tab === 'value') {
    if (element.isSetValues) return [setValuesTable(element, data, refs, rows, estimator)];
    const formula = formulaTable(element, data, refs, rows, estimator);
    return formula ? [formula] : [];
  }
  if (tab === 'options') {
    const options = optionsTable(element, data, rows);
    return options ? [options] : [];
  }
  if (tab === 'props') {
    const merge = mergeFieldsTable(element, data, refs, rows, estimator);
    return merge ? [merge] : [];
  }
  if (tab === 'calls') return additionalInputTables(element, data, refs, rows, estimator);
  return [];
}
