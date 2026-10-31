'use strict';

/* The one frame every fact card of the Structure detail pane is drawn in
 * (Current value, Formula, Set Values, Options, Merge fields, Visibility,
 * Validation): a bordered box with a header line (the card's name in small
 * caps, an element's name as a link, the verdict and other tags, any view
 * switch, Copy at the right), and a body of labelled rows, a table, or a tree.
 * The sentence that says what a card is lives in its header's tooltip and in
 * the help, never inside the card.
 *
 * At a narrow pane the stylesheet puts each label above its value and stacks a
 * table's cells, each under its column's name (data-label).
 *
 * Only DOM here: which words, tags and verdicts a card carries is decided in
 * src/core/structure/ (fact-words.js, table-model.js and the table modules). */

import { decorateButton, icon } from '../icons.js';
import { copyWithButton } from '../clipboard.js';
import { tagClasses } from '../../core/shared/tag-tone.js';

function node(tag, className, text) {
  const out = document.createElement(tag);
  if (className) out.className = className;
  if (text !== undefined) out.textContent = text;
  return out;
}

const append = (parent, content) => {
  (Array.isArray(content) ? content : [content]).forEach((part) => {
    if (part === null || part === undefined || part === '') return;
    parent.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
  });
};

/* A tag: a state after a value or in a header. `tone` is a fact-words.js tone;
 * 'outline' is the bare outlined tag. */
export function tagNode({ text, tone = 'neutral', title = '' }) {
  const tag = node('span', tone === 'outline' ? 'tag fc-tag' : `${tagClasses(tone)} fc-tag`, text);
  if (title) tag.title = title;
  return tag;
}

/* An element's or a field's name as a link: accent blue, underlined, mono. */
export function linkNode(text, title, onClick, extraClass = '') {
  const button = node('button', `fc-link${extraClass ? ` ${extraClass}` : ''}`, text);
  button.type = 'button';
  if (title) button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

/* A name or a value, in the monospace font. */
export const monoNode = (text, title) => {
  const out = node('span', 'fc-mono', text);
  if (title) out.title = title;
  return out;
};

/* What cannot be known, dimmed and italic: "can't tell", "not in data". */
export const unknownNode = (text, title) => {
  const out = node('span', 'fc-unknown', text);
  if (title) out.title = title;
  return out;
};

/* The quiet hint after a value: "number", "true/false". */
export const hintNode = (text) => node('span', 'fc-hint', text);

/* The heading between cards on a tab ("Validation rules (2)"). */
export function factSection(container, text) {
  const heading = node('h4', 'fc-section', text);
  container.appendChild(heading);
  return heading;
}

/* A dimmed line after the cards, such as what a custom component may hide. */
export function factNote(container, text) {
  const line = node('div', 'fc-note', text);
  container.appendChild(line);
  return line;
}

let cardCount = 0;

/* The card. Options:
 *   name     — the card's name, in the header's small caps ("Formula", "Messaging")
 *   link     — { text, title, onClick }: an element's name after it, as a link
 *   verdict  — { text, tone, title }: the tag that says how it stands now
 *   tags     — more tags after the verdict ("estimated ≈", "what if")
 *   why      — what a closed card says on its header line: text, or [nodes]
 *   tip      — what the card is: the header's tooltip
 *   controls — nodes before Copy (a view switch)
 *   copy     — { text(), title, help }: the Copy button at the right; text() gives
 *              what goes on the clipboard (Mask values already applied)
 *   fold     — { open, onToggle(open) }: the card opens and closes on its header
 *   indent   — no fold, but the room of its chevron, so the card lines up with foldable ones
 *   id       — data-card, for the stylesheet and tests
 * Returns { card, head, body }: put the content in `body`. */
export function factCard(container, {
  name, link = null, verdict = null, tags = [], why = '', tip = '', controls = [], copy = null, fold = null, indent = false, id = ''
}) {
  const card = node('section', 'detail-card fc-card');
  if (id) card.dataset.card = id;
  cardCount += 1;
  const label = [name, link ? link.text : ''].filter(Boolean).join(' ');
  card.setAttribute('aria-label', label);

  const head = node('h3', 'detail-card-head fc-head');
  if (tip) head.title = tip;
  head.id = `fc-head-${cardCount}`;
  let toggle = null;
  if (fold) {
    toggle = node('button', 'fc-toggle detail-card-toggle');
    toggle.type = 'button';
    toggle.appendChild(icon('chevron-right'));
    head.appendChild(toggle);
  } else if (indent) {
    head.appendChild(node('span', 'fc-toggle-gap'));
  }
  if (name) head.appendChild(node('span', 'fc-name', name));
  if (link) head.appendChild(linkNode(link.text, link.title, link.onClick, 'fc-el'));
  if (verdict) head.appendChild(tagNode(verdict));
  tags.forEach((tag) => head.appendChild(tagNode(tag)));
  if (why) {
    const line = node('span', 'fc-why');
    append(line, why);
    head.appendChild(line);
  }
  controls.forEach((control) => head.appendChild(control));
  if (copy) {
    const button = node('button', 'icon-btn tiny fc-copy', 'Copy');
    button.type = 'button';
    decorateButton(button, 'copy', 'Copy');
    button.title = copy.title || 'Copy this card as text. Honours Mask values.';
    if (copy.help) button.setAttribute('data-help', copy.help);
    button.addEventListener('click', (ev) => {
      ev.stopPropagation();
      copyWithButton(copy.text(), button);
    });
    head.appendChild(button);
  }
  card.appendChild(head);

  const body = node('div', 'fc-body');
  card.appendChild(body);

  if (fold) {
    const show = (open) => {
      card.classList.toggle('is-open', open);
      card.classList.toggle('is-closed', !open);
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `${open ? 'Close' : 'Open'} ${label}`);
      toggle.title = open ? `Close ${label}` : `Open ${label}`;
    };
    show(!!fold.open);
    const flip = () => {
      const open = body.hidden;
      show(open);
      if (fold.onToggle) fold.onToggle(open);
    };
    toggle.addEventListener('click', (ev) => { ev.stopPropagation(); flip(); });
    /* The whole header opens and closes the card, except its links and buttons. */
    head.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, input, summary')) return;
      flip();
    });
    head.classList.add('is-foldable');
  }

  container.appendChild(card);
  return { card, head, body };
}

/* The labelled rows of a card: returns the box to add rows to. */
export function factRows(parent) {
  const rows = node('div', 'fc-rows');
  parent.appendChild(rows);
  return rows;
}

/* One labelled row: the label in small caps (or, with `isName`, a name as it is
 * written, such as a link to an element), the value beside it at a wide pane
 * and under it at a narrow one. `label` and `value` are text or nodes. */
export function factRow(rows, label, value, { isName = false, className = '' } = {}) {
  const row = node('div', `fc-row${className ? ` ${className}` : ''}`);
  const labelBox = node('div', `fc-label${isName ? ' is-name' : ''}`);
  append(labelBox, label);
  const valueBox = node('div', 'fc-value');
  append(valueBox, value);
  row.appendChild(labelBox);
  row.appendChild(valueBox);
  rows.appendChild(row);
  return row;
}

/* A row with no label: a card that holds one fact (Current value of a simple value). */
export function factSingle(rows, value) {
  const row = node('div', 'fc-row fc-single');
  const valueBox = node('div', 'fc-value');
  append(valueBox, value);
  row.appendChild(valueBox);
  rows.appendChild(row);
  return row;
}

/* A sub-heading among the rows ("Elements it reads"). */
export function factHeading(rows, text) {
  const heading = node('div', 'fc-group', text);
  rows.appendChild(heading);
  return heading;
}

/* A table inside a card: `columns` [{ id, label }], `rows` [{ className, cells }]
 * with each cell { content, className } (content: text or nodes). Each cell
 * carries its column's name for the narrow layout, which stacks it under it. */
export function factTable(parent, { label, columns, rows, className = '' }) {
  const table = node('table', `fc-table${className ? ` ${className}` : ''}`);
  table.setAttribute('aria-label', label);
  const thead = node('thead');
  const headRow = node('tr');
  columns.forEach((column) => {
    const th = node('th', column.id ? `fc-col-${column.id}` : '');
    th.scope = 'col';
    if (column.hidden) th.appendChild(node('span', 'sr-only', column.label));
    else th.textContent = column.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  rows.forEach((row) => {
    const body = node('tbody');
    const tr = node('tr', row.className || '');
    row.cells.forEach((cell, index) => {
      const column = columns[index];
      const td = node('td', [column.id ? `fc-col-${column.id}` : '', cell.className || ''].filter(Boolean).join(' '));
      if (!column.hidden) td.dataset.label = column.label;
      if (cell.title) td.title = cell.title;
      append(td, cell.content);
      tr.appendChild(td);
    });
    body.appendChild(tr);
    table.appendChild(body);
  });
  parent.appendChild(table);
  return table;
}
