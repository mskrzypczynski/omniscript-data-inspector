'use strict';

/* Does a value have the shape its element's type promises? A Number that holds
 * "12,5", a Checkbox that holds the text "true", a Select that holds something
 * it does not offer: the script often works anyway, and then breaks somewhere
 * else, so the Structure tab marks it with a hint. A hint, not a problem:
 * nothing counts it.
 *
 * Only judged when there is a value to judge (absent, null and "" are not),
 * and only from what the definition says about the element: a type this code
 * does not know, or a rule it cannot check (options fed by a Data Mapper, a
 * date format it cannot read), gives no hint.
 *
 * Pure: no DOM, no chrome.*. */

import { hasOptionSource } from '../shared/structure-model.js';
import { MASK_STRING, MASK_NUMBER } from '../shared/mask.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const ISO_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const OPTIONS_SHOWN = 5;

const shown = (value) => `“${String(value).length > 40 ? `${String(value).slice(0, 40)}…` : value}”`;

/* ------------------------------------------------------------- dates */

function realDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const last = new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();
  return day <= last;
}

function realTime(hour, minute, second) {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && (second === undefined || (second >= 0 && second <= 59));
}

function isoDate(text) {
  const match = ISO_DATE.exec(text);
  return !!match && realDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isoDateTime(text) {
  const match = ISO_DATETIME.exec(text);
  return !!match && realDate(Number(match[1]), Number(match[2]), Number(match[3])) &&
    realTime(Number(match[4]), Number(match[5]), match[6] === undefined ? undefined : Number(match[6]));
}

function isoTime(text) {
  const match = ISO_TIME.exec(text);
  return !!match && realTime(Number(match[1]), Number(match[2]), match[3] === undefined ? undefined : Number(match[3]));
}

/* A format such as "dd/MM/yyyy" or "hh:mm a" as a pattern, with the parts it
 * captures in order. Letters between single quotes are literal text. Null when
 * the format has a letter this code does not know. */
const TOKENS = {
  yyyy: ['\\d{4}', 'year'], yy: ['\\d{2}', 'year'],
  MMMM: ['[A-Za-z]{3,9}', 'monthName'], MMM: ['[A-Za-z]{3}', 'monthName'], MM: ['\\d{2}', 'month'], M: ['\\d{1,2}', 'month'],
  dd: ['\\d{2}', 'day'], d: ['\\d{1,2}', 'day'],
  HH: ['\\d{2}', 'hour'], H: ['\\d{1,2}', 'hour'], hh: ['\\d{2}', 'hour12'], h: ['\\d{1,2}', 'hour12'],
  mm: ['\\d{2}', 'minute'], ss: ['\\d{2}', 'second'], SSS: ['\\d{3}', 'ms'], a: ['[AaPp][Mm]', 'ampm']
};
const TOKEN = /yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|ss|SSS|a|'[^']*'|[A-Za-z]|[^A-Za-z']+/g;

export function formatPattern(format) {
  const parts = [];
  let source = '';
  for (const piece of String(format).match(TOKEN) || []) {
    if (TOKENS[piece]) { source += `(${TOKENS[piece][0]})`; parts.push(TOKENS[piece][1]); }
    else if (piece.startsWith("'")) source += piece.slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (/^[A-Za-z]$/.test(piece)) return null;
    else source += piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return parts.length ? { regex: new RegExp(`^${source}$`), parts } : null;
}

/* Does the text fit the format, with real month, day, hour and minute? null
 * when the format cannot be read. */
export function matchesFormat(text, format) {
  const pattern = formatPattern(format);
  if (!pattern) return null;
  const match = pattern.regex.exec(String(text).trim());
  if (!match) return false;

  const got = {};
  pattern.parts.forEach((part, i) => { got[part] = match[i + 1]; });
  const number = (name) => (got[name] === undefined ? undefined : Number(got[name]));

  let month = number('month');
  if (got.monthName !== undefined) {
    const index = MONTHS.indexOf(got.monthName.slice(0, 3).toLowerCase());
    if (index < 0) return false;
    month = index + 1;
  }
  if (month !== undefined || number('day') !== undefined) {
    if (!realDate(number('year') === undefined || got.year.length === 2 ? 2000 : number('year'), month === undefined ? 1 : month,
      number('day') === undefined ? 1 : number('day'))) return false;
  }
  if (number('hour12') !== undefined && (number('hour12') < 1 || number('hour12') > 12)) return false;
  const hour = number('hour') !== undefined ? number('hour') : (number('hour12') === undefined ? undefined : 0);
  if (hour !== undefined || number('minute') !== undefined) {
    return realTime(hour === undefined ? 0 : hour, number('minute') === undefined ? 0 : number('minute'), number('second'));
  }
  return true;
}

/* 'date', 'datetime' or 'time' for a date or time element, else ''. */
function dateKind(type) {
  const name = String(type || '').trim();
  if (/^date\s*\/?\s*-?\s*time|^datetime/i.test(name)) return 'datetime';
  if (/^date\b/i.test(name)) return 'date';
  if (/^time\b/i.test(name)) return 'time';
  return '';
}

function dateHint(element, value, propertySet) {
  const kind = dateKind(element.type);
  if (!kind || typeof value !== 'string') return null;
  const text = value.trim();

  const iso = { date: [isoDate, isoDateTime], datetime: [isoDate, isoDateTime], time: [isoTime, isoDateTime] }[kind];
  if (iso.some((check) => check(text))) return null;

  const dateFormat = typeof propertySet.dateFormat === 'string' ? propertySet.dateFormat.trim() : '';
  const timeFormat = typeof propertySet.timeFormat === 'string' ? propertySet.timeFormat.trim() : '';
  const formats = (kind === 'date' ? [dateFormat] : kind === 'time' ? [timeFormat]
    : [dateFormat, timeFormat, dateFormat && timeFormat ? `${dateFormat} ${timeFormat}` : '']).filter(Boolean);

  const results = formats.map((format) => matchesFormat(text, format));
  if (results.includes(true)) return null;
  /* A format this code cannot read is no grounds to call the value wrong. */
  if (results.includes(null)) return null;

  const label = { date: 'Date', datetime: 'Date/Time', time: 'Time' }[kind];
  const example = { date: '2026-03-04', datetime: '2026-03-04T09:30:00', time: '09:30' }[kind];
  const expected = formats.length ? `${formats.join(' or ')}, or ISO ${example}` : `ISO, for example ${example}`;
  return { kind: 'date', text: `${label} holds text ${shown(value)} that is not a date or time in ${expected}` };
}

/* ------------------------------------------------------- the other types */

const looksNumeric = (text) => text.trim() !== '' && Number.isFinite(Number(text));

function numberHint(element, value) {
  if (!/^(number|currency)$/i.test(String(element.type || '').trim()) || typeof value !== 'string') return null;
  if (looksNumeric(value)) return null;
  const label = /^currency$/i.test(element.type.trim()) ? 'Currency' : 'Number';
  const locale = /^[-+]?[\d\s.,]*\d[\d\s.,]*$/.test(value.trim()) && /[,\s]/.test(value.trim());
  return {
    kind: 'number',
    text: `${label} holds text ${shown(value)}${locale ? ': a comma or space inside a number is a locale format, not a number' : ''}`
  };
}

function booleanHint(element, value) {
  if (!/^(checkbox|toggle)$/i.test(String(element.type || '').trim()) || typeof value !== 'string') return null;
  if (!/^(true|false)$/i.test(value.trim())) return null;
  return { kind: 'boolean', text: `${element.type.trim()} holds the text ${shown(value)}, not a boolean` };
}

/* The names (the stored data) and values (the label or its key) of static options. */
function staticOptions(propertySet) {
  if (!Array.isArray(propertySet.options) || !propertySet.options.length || hasOptionSource(propertySet)) return null;
  const options = propertySet.options.filter((option) => option && typeof option === 'object');
  return options.length ? options : null;
}

function optionHint(element, value, propertySet) {
  const type = String(element.type || '').trim();
  if (!/^(select|radio)/i.test(type) || /^multi/i.test(type)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const options = staticOptions(propertySet);
  if (!options) return null;

  const stored = String(value);
  const known = options.some((option) => String(option.name) === stored || (option.value !== undefined && String(option.value) === stored));
  if (known) return null;
  const names = options.map((option) => String(option.name)).slice(0, OPTIONS_SHOWN);
  const more = options.length > OPTIONS_SHOWN ? ` +${options.length - OPTIONS_SHOWN}` : '';
  return { kind: 'option', text: `${type} holds ${shown(value)}, which is not one of its options (${names.join(', ')}${more})` };
}

function listHint(element, value) {
  if (!/^multi.?select/i.test(String(element.type || '').trim()) || typeof value !== 'string') return null;
  return { kind: 'list', text: `${element.type.trim()} holds the text ${shown(value)}, not a list` };
}

/* null, or { kind: 'number' | 'date' | 'boolean' | 'option' | 'list', text }:
 * what is off about `value` for `element`, as a sentence. */
export function valueMismatch(element, value) {
  if (!element || value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  /* A bundle saved with Mask values on holds placeholders instead of answers: nothing to judge. */
  if (value === MASK_STRING || value === MASK_NUMBER) return null;
  if (element.hasChildren || element.isSetValues) return null;
  const propertySet = (element.node && element.node.propSetMap) || {};
  return numberHint(element, value) || dateHint(element, value, propertySet) || booleanHint(element, value) ||
    optionHint(element, value, propertySet) || listHint(element, value);
}
