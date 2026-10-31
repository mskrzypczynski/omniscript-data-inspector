'use strict';

/* The fact cards of the detail pane that list an element's settings (Set
 * Values, Options, Formula, Merge fields, Additional input): the shape of a
 * card's content and of its cells, how a name becomes a link, and the text of
 * a card for Copy, with Mask values applied.
 *
 *   table — { id, title, tip, verdict?, layout, columns, rows, empty }
 *     tip     — what the card is, for its header's tooltip (the card itself
 *               carries no sentence)
 *     verdict — a tag for the header: { text, tone, title }
 *     layout  — 'table': rows of cells under `columns`
 *               'rows':  labelled rows, { label: cell, value: cell }, and
 *                        sub-headings, { heading: 'Elements it reads' }
 *   row   — { cells, tone } (table layout)
 *   cell  — { text, title?, tone?, link?, data?, value?, masked?, tag?, prose?, label?, copy? }
 *     tone   — '' | 'muted' | 'unknown' | 'ok' | 'bad' (also on a row, with 'differs')
 *     tag    — { text, tone, title }: a state after the value, such as "differs"
 *              or "estimated ≈" (fact-words.js TAGS); copied with it
 *     link   — { kind: 'element', key } selects the element,
 *              { kind: 'data', segments } opens the place in the Data tab
 *     label  — the element's label, drawn before its name (Merge fields)
 *     copy   — what a copy says instead of the text (the name as written)
 *     prose  — words, not a name or a value: drawn in the proportional font
 *     data   — the text comes from the live data (or an estimate of it): a copy
 *              made while Mask values is on replaces it
 *     masked — what a masked copy says instead (default: the value masked)
 *     aria   — the words a screen reader says for a mark such as a tick
 *
 * Pure: no DOM, no chrome.*. */

import { maskValues } from '../shared/mask.js';
import { referenceSegments } from '../shared/references.js';
import { treePathFor } from '../shared/path-links.js';
import { display } from './visibility.js';
import { TAGS } from './fact-words.js';

export const CANT_TELL = "can't tell";

export const ESTIMATE_TITLE = TAGS.estimated.title;

/* What a cell says for a value the data does not hold. */
export const NOT_IN_DATA = 'not in data';

/* A cell of plain text from the definition. */
export const textCell = (text, extra = {}) => ({ text: String(text === undefined || text === null ? '' : text), ...extra });

/* A cell that holds a value read from the live data (or estimated from it): an
 * estimate carries the "estimated ≈" tag, a value the data does not hold reads
 * "not in data", dimmed. `data: false` says the value is written in the
 * definition (a literal), so a masked copy keeps it. */
export function valueCell(value, { estimated = false, title = '', data = true } = {}) {
  if (value === undefined) return { text: NOT_IN_DATA, data: false, value, estimated: false, tone: 'unknown', prose: true, title };
  return {
    text: display(value),
    data,
    value,
    estimated,
    tone: '',
    title,
    ...(estimated ? { tag: { ...TAGS.estimated, ...(title ? { title } : {}) } } : {})
  };
}

/* A cell for what cannot be told; `title` says why. */
export const unknownCell = (title = '') => ({ text: CANT_TELL, tone: 'unknown', prose: true, title });

/* The cell of a field a card names. An element of the script is shown by its
 * name, as a link that selects it, with the field as written in the tooltip
 * (and in a copy); a field that is no element is a link to its place in the
 * Data tab when the data holds it, else text. `withLabel` puts the element's
 * label before its name. { refs, data }: the reference index and the data. */
export function fieldCell(field, { refs, data }, extra = {}, { withLabel = false } = {}) {
  const ref = String(field).replace(/^%|%$/g, '');
  const hit = refs.resolve(ref).element;
  const about = extra.title ? ` · ${extra.title}` : '';
  if (hit) {
    const label = withLabel && hit.label && hit.label !== hit.name ? hit.label : '';
    return {
      ...textCell(hit.name, extra),
      link: { kind: 'element', key: hit.key },
      title: `Select ${hit.name}${ref !== hit.name ? ` · ${ref}` : ''}${about}`,
      ...(ref !== hit.name ? { copy: ref } : {}),
      ...(label ? { label } : {})
    };
  }
  const segments = referenceSegments(ref);
  const where = segments && segments.length && data !== undefined && data !== null ? treePathFor(data, segments) : null;
  const cell = textCell(ref, extra);
  if (where && where.exact) {
    cell.link = { kind: 'data', segments };
    cell.title = `Show in Data${about}`;
  }
  return cell;
}

/* What a copy says for the cell: its text, or with `mask` on what the data held
 * replaced by a placeholder (strings and numbers; a boolean or an empty string is
 * not a person's answer). */
export function cellText(cell, { mask = false } = {}) {
  const tag = cell.tag ? ` · ${cell.tag.text}` : '';
  const text = cell.copy !== undefined ? cell.copy : cell.text;
  if (!mask || !cell.data) return `${text}${tag}`;
  if (cell.masked !== undefined) return `${cell.masked}${tag}`;
  return `${display(maskValues(cell.value))}${tag}`;
}

const oneLine = (text) => String(text).replace(/[\t\r\n]+/g, ' ');

/* The card as text for the clipboard: its title (and verdict), then a header
 * line and one line per row, columns separated by tabs; a card of labelled rows
 * is a "label<tab>value" line per row, with its sub-headings on lines of their own. */
export function tableText(table, { mask = false } = {}) {
  const lines = [table.verdict ? `${table.title} · ${table.verdict.text}` : table.title];
  if (table.layout === 'rows') {
    table.rows.forEach((row) => lines.push(row.heading !== undefined
      ? row.heading
      : `${oneLine(cellText(row.label, { mask }))}\t${oneLine(cellText(row.value, { mask }))}`));
    return lines.join('\n');
  }
  lines.push(table.columns.map((column) => column.label).join('\t'));
  table.rows.forEach((row) => lines.push(row.cells.map((cell) => oneLine(cellText(cell, { mask }))).join('\t')));
  return lines.join('\n');
}
