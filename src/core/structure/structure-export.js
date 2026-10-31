'use strict';

/* The Structure tab's Export menu, as text: the script's structure as a
 * Markdown table or a CSV, and its custom labels as a CSV. Built from the
 * flattened element list (structure-model.js flatten) and the script header.
 * Only the definition goes out - names, labels, rules, targets - never a value
 * from the live data, so Mask values has nothing to hide here.
 *
 * Pure: no DOM, no chrome.*. */

import { makeResolver, translatableKeys, stripHtml } from '../shared/structure-model.js';

const INDENT = '  '; // survives the trimming of a Markdown table cell

/* One line for an element's validation: what it is, when, and what it says. */
export function validationSummary(validation) {
  if (!validation || !validation.has) return '';
  const parts = [validation.kind === 'set-errors' ? 'Set Errors' : 'Messaging'];
  if (validation.triggerExpr) parts.push(`when ${validation.triggerExpr}`);
  if (validation.validateExpr) parts.push(`checks ${validation.validateExpr}`);
  validation.errorMap.forEach((entry) => parts.push(`${entry.element}: ${entry.message}`));
  if (validation.message) parts.push(validation.message);
  validation.messages.forEach((message) => parts.push(`${message.type}: ${message.text}`));
  return parts.join('; ');
}

const flat = (text) => stripHtml(String(text === undefined || text === null ? '' : text));
const cellOf = (text) => flat(text).replace(/\|/g, '\\|');
const yes = (flag) => (flag ? 'yes' : '');

const isStep = (element) => element.category && element.category.key === 'step';

/* A table row for each element: # | Name | Type | Label | Required | Show rule | Calls | Validation */
function markdownRow(element, index, base) {
  const indent = INDENT.repeat(Math.max(0, element.depth - base));
  const cells = [index, element.name, element.type, element.label, yes(element.required), element.showExpr, element.remote,
    validationSummary(element.validation)].map((cell) => cellOf(cell));
  cells[1] = `${indent}${cells[1]}`;
  return `| ${cells.join(' | ')} |`;
}

const MARKDOWN_HEAD = ['| # | Name | Type | Label | Required | Show rule | Calls | Validation |', '| --- | --- | --- | --- | :-: | --- | --- | --- |'];

/* The structure as Markdown: a heading per step, then a table of what is in it,
 * indented by depth. Elements outside any step are in a table of their own.
 * `title` is the script's name for the first line. */
export function structureMarkdown(elements, { title = 'OmniScript structure' } = {}) {
  const lines = [`# ${flat(title)}`, '', `${elements.length} ${elements.length === 1 ? 'element' : 'elements'}.`];
  const number = new Map(elements.map((element, i) => [element.key, i + 1]));
  const roots = elements.filter((element) => element.depth === 0);

  /* Parents come before their children, so one pass finds every element's top-level ancestor. */
  const rootKey = new Map();
  elements.forEach((element) => rootKey.set(element.key, element.depth === 0 ? element.key : rootKey.get(element.parentKey)));
  const inside = (root) => elements.filter((element) => element.depth > 0 && rootKey.get(element.key) === root.key);
  const outside = [];

  roots.forEach((root) => {
    if (!isStep(root)) { outside.push(root); return; }
    lines.push('', `## ${number.get(root.key)}. ${flat(root.name)}${root.label && root.label !== root.name ? ` (${flat(root.label)})` : ''}`);
    const body = inside(root);
    if (root.showExpr) lines.push('', `Shown when: ${flat(root.showExpr)}`);
    if (!body.length) { lines.push('', '_No elements._'); return; }
    lines.push('', ...MARKDOWN_HEAD, ...body.map((element) => markdownRow(element, number.get(element.key), 1)));
  });

  if (outside.length) {
    lines.push('', '## Outside steps', '', ...MARKDOWN_HEAD);
    outside.forEach((root) => {
      lines.push(markdownRow(root, number.get(root.key), 0));
      inside(root).forEach((element) => lines.push(markdownRow(element, number.get(element.key), 0)));
    });
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ CSV */

/* A cell that a spreadsheet would run as a formula starts with ' instead. */
function csvCell(value) {
  let text = String(value === undefined || value === null ? '' : value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvLine = (cells) => cells.map(csvCell).join(',');

export const STRUCTURE_CSV_HEADER = ['#', 'Name', 'Type', 'Label', 'Required', 'Show rule', 'Calls', 'Validation', 'Depth', 'Parent'];

/* One row per element, in script order, with its depth and its parent's name. */
export function structureCsv(elements) {
  const byKey = new Map(elements.map((element) => [element.key, element]));
  const rows = elements.map((element, i) => {
    const parent = byKey.get(element.parentKey);
    return csvLine([
      i + 1, element.name, element.type, flat(element.label), yes(element.required), element.showExpr,
      element.remote, validationSummary(element.validation), element.depth, parent ? parent.name : ''
    ]);
  });
  return `${[csvLine(STRUCTURE_CSV_HEADER), ...rows].join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------ labels */

/* The text of one custom label for each language it has. allCustomLabels holds
 * either the text (or { value | text | label }) for the script's language, or,
 * in a script with several, an object of text per language code. */
function labelTexts(value) {
  if (typeof value === 'string') return { '': value };
  if (!value || typeof value !== 'object') return { '': '' };
  const direct = value.value || value.text || value.label;
  if (typeof direct === 'string') return { '': direct };
  const out = {};
  Object.keys(value).forEach((language) => {
    if (typeof value[language] === 'string') out[language] = value[language];
  });
  return Object.keys(out).length ? out : { '': '' };
}

/* { keys: [{ key, texts, usedBy, missing }], languages } for the labels of a
 * script: every key the map holds and every key an element uses, so a key that
 * is used but absent is a row with missing: true. `languages` is empty for a
 * single-language map. */
export function customLabelRows(elements, header) {
  const resolver = makeResolver(header);
  const labels = (header && header.allCustomLabels) || {};
  const usedBy = new Map();

  if (resolver.multiLang) {
    elements.forEach((element) => {
      translatableKeys(element.node || {}, (element.node && element.node.propSetMap) || {}).forEach((use) => {
        if (!usedBy.has(use.key)) usedBy.set(use.key, []);
        const entry = `${element.name} (${use.where})`;
        if (!usedBy.get(use.key).includes(entry)) usedBy.get(use.key).push(entry);
      });
    });
  }

  const keys = [...new Set([...Object.keys(labels), ...usedBy.keys()])];
  const languages = [];
  const rows = keys.map((key) => {
    const present = Object.prototype.hasOwnProperty.call(labels, key);
    const texts = present ? labelTexts(labels[key]) : { '': '' };
    Object.keys(texts).forEach((language) => { if (language && !languages.includes(language)) languages.push(language); });
    return { key, texts, usedBy: usedBy.get(key) || [], missing: !present };
  });
  return { rows, languages, multiLang: resolver.multiLang };
}

/* Does the script have custom labels worth exporting? */
export function hasCustomLabels(elements, header) {
  return customLabelRows(elements, header).rows.length > 0;
}

/* Key, the text it resolves to (one column per language when there are
 * several), the elements that use it, and whether it is missing from the map. */
export function customLabelsCsv(elements, header) {
  const { rows, languages } = customLabelRows(elements, header);
  const textColumns = languages.length ? languages.map((language) => `Text (${language})`) : ['Text'];
  const head = ['Key', ...textColumns, 'Used by', 'Missing'];
  const lines = rows.map((row) => csvLine([
    row.key,
    ...(languages.length ? languages.map((language) => flat(row.texts[language] || '')) : [flat(row.texts[''] || '')]),
    row.usedBy.join('; '),
    row.missing ? 'yes' : 'no'
  ]));
  return `${[csvLine(head), ...lines].join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------- names */

/* "omniscript-structure-demo_flow.md": the script's Type_SubType when the
 * definition has them, else the time. */
export function exportFileName(definition, what, extension, now) {
  const type = definition && typeof definition === 'object' ? definition : {};
  const script = [type.bpType, type.bpSubType].filter((part) => typeof part === 'string' && part).join('_')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const stamp = script || now.toISOString().replace(/[:.]/g, '-');
  return `omniscript-${what}-${stamp}.${extension}`;
}

/* "demo / flow (English)": what the Markdown file is headed with. */
export function exportTitle(definition) {
  const source = definition && typeof definition === 'object' ? definition : {};
  const name = [source.bpType, source.bpSubType].filter((part) => typeof part === 'string' && part).join(' / ');
  const language = typeof source.bpLang === 'string' && source.bpLang ? ` (${source.bpLang})` : '';
  return name ? `${name}${language}` : 'OmniScript structure';
}
