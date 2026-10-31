'use strict';

/* The fact cards that list an element's settings: Set Values, Options, Formula,
 * Merge fields, Additional input and Remote options, drawn in the one frame of
 * fact-card.js. A card is either labelled rows (Formula) or a table whose cells
 * stack under their column's name in a narrow pane.
 *
 * Only DOM here; every row and every cell comes from src/core/structure/
 * (table-model.js and the modules that build the tables). */

import { Nav } from '../nav.js';
import { Mask } from '../mask-setting.js';
import { tableText } from '../../core/structure/table-model.js';
import {
  factCard, factRows, factRow, factHeading, factTable, linkNode, monoNode, unknownNode, tagNode
} from './fact-card.js';

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

/* What a cell shows: a name as a link that selects its element (or opens its
 * place in Data), a mark, a value in mono, words or an unknown dimmed; then its tag. */
export function cellContent(cell, select) {
  const parts = [];
  const link = cell.link;
  if (cell.label) parts.push(span('fc-prose fc-label-text', cell.label), ' ');
  if (link && link.kind === 'element') {
    parts.push(linkNode(cell.text, cell.title || 'Select this element', () => select(link.key), cell.label ? 'fc-elname' : ''));
  } else if (link && link.kind === 'data') {
    parts.push(linkNode(cell.text, cell.title || 'Show in Data', () => Nav.go('data', { segments: link.segments })));
  } else if (cell.aria) {
    /* A mark such as a tick: read out as the words, drawn as the mark. */
    const mark = span('fc-tick', cell.text);
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', cell.aria);
    if (cell.title) mark.title = cell.title;
    parts.push(mark);
  } else if (cell.tone === 'unknown') {
    parts.push(unknownNode(cell.text, cell.title));
  } else if (cell.prose) {
    const words = span(`fc-prose${cell.tone === 'muted' ? ' fc-dim' : ''}`, cell.text);
    if (cell.title) words.title = cell.title;
    parts.push(words);
  } else if (cell.text !== '') {
    parts.push(monoNode(cell.text, cell.title));
  }
  if (cell.tag) parts.push(tagNode(cell.tag));
  return parts;
}

function drawRows(table, body, select) {
  const rows = factRows(body);
  table.rows.forEach((row) => {
    if (row.heading !== undefined) { factHeading(rows, row.heading); return; }
    const isName = !!row.label.link;
    factRow(rows, isName ? cellContent(row.label, select) : row.label.text, cellContent(row.value, select), { isName });
  });
}

function drawTable(table, body, select) {
  factTable(body, {
    label: table.title,
    className: `fc-${table.id}`,
    columns: table.columns,
    rows: table.rows.map((row) => ({
      className: `fc-tr${row.tone ? ` is-${row.tone}` : ''}`,
      cells: row.cells.map((cell) => ({ content: cellContent(cell, select) }))
    }))
  });
}

/* table: a table of core/structure/table-model.js. select(key) selects another
 * element. `help` names the help entry the Copy button belongs to. Returns the
 * card. */
export function renderTableCard(table, container, { select, help = '' }) {
  const { card, body } = factCard(container, {
    name: table.title,
    id: table.id,
    tip: table.tip,
    verdict: table.verdict || null,
    copy: table.rows.length ? {
      text: () => tableText(table, { mask: Mask.on() }),
      title: `Copy the ${table.title} card as text. Honours Mask values.`,
      help
    } : null
  });
  if (!table.rows.length) {
    const none = document.createElement('div');
    none.className = 'fc-empty';
    none.appendChild(unknownNode(table.empty || 'Nothing to list.'));
    body.appendChild(none);
  } else if (table.layout === 'rows') {
    drawRows(table, body, select);
  } else {
    drawTable(table, body, select);
  }
  return card;
}
