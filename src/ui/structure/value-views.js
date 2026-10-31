'use strict';

/* What the Current value card holds: a simple value with its type hint, or for
 * a step or block one of three views, Form, Tree (the JSON tree, drawn by
 * json-tree-view.js) and Raw. This file draws the simple value, the switch
 * between the views (it sits in the card's header), the Form and the Raw text;
 * which rows the form has comes from core/structure/form-rows.js.
 *
 * Only DOM here. */

import { icon } from '../icons.js';
import { VIEWS, VIEW_LABELS, VIEW_TITLES } from '../../core/structure/form-rows.js';
import { formRowHint } from '../../core/structure/fact-words.js';
import { countLines } from '../../core/shared/text-search.js';
import { factRows, factRow, monoNode, unknownNode, hintNode } from './fact-card.js';

const MAX_NUMBERED_LINES = 20000;

/* Form | Tree | Raw as a segmented control, for the Current value card's header.
 * `current` is the view on show and onPick(view) the choice. */
export function renderViewSwitch(current, onPick) {
  const strip = document.createElement('div');
  strip.className = 'seg value-views';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'How the value is shown');
  VIEWS.forEach((view) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `seg-btn${current === view ? ' is-on' : ''}`;
    button.dataset.view = view;
    button.textContent = VIEW_LABELS[view];
    button.title = VIEW_TITLES[view];
    button.setAttribute('aria-pressed', String(current === view));
    button.setAttribute('data-help', 'Current value views');
    button.addEventListener('click', () => onPick(view));
    strip.appendChild(button);
  });
  return strip;
}

/* A simple value on the Current value card: the value in mono, then its quiet
 * type hint; nothing in the data is the dimmed "not in data". `fact` is
 * core/structure/fact-words.js currentValueFact(). */
export function simpleValue(fact) {
  if (fact.unknown) return [unknownNode(fact.text)];
  const value = monoNode(fact.text);
  value.classList.add('fc-big');
  return fact.hint ? [value, hintNode(fact.hint)] : [value];
}

/* One row of the form: the label, the element's name dimmed after it, and the
 * value as plain text with its hint, or for an object or list a button that
 * opens what it holds in place. */
function formRow(rows, row, onToggle) {
  const label = [document.createTextNode(row.label)];
  if (row.name) {
    // The element's name after the page's label, so a row can be found in the definition and the data.
    const name = document.createElement('span');
    name.className = 'fc-elname';
    name.textContent = row.name;
    label.push(document.createTextNode(' '), name);
  }

  const value = [];
  if (row.kind === 'group') {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'form-open';
    open.disabled = !row.canOpen;
    open.setAttribute('aria-expanded', String(row.open));
    open.title = row.canOpen ? (row.open ? `Close ${row.label}` : `Open ${row.label} in place`) : 'Nothing inside';
    if (row.canOpen) open.appendChild(icon('chevron-right'));
    const count = document.createElement('span');
    count.textContent = row.text;
    open.appendChild(count);
    open.addEventListener('click', () => onToggle(row.id));
    value.push(open);
  } else if (row.kind === 'empty') {
    value.push(unknownNode('empty'));
  } else {
    const text = monoNode(row.text, row.text ? `${row.title}\n${row.text}` : row.title);
    text.classList.add('form-field');
    value.push(text);
    const hint = formRowHint(row.kind);
    if (hint) value.push(hintNode(hint));
  }

  const line = factRow(rows, label, value, { isName: true, className: `form-row is-${row.kind}` });
  line.style.setProperty('--depth', String(row.depth));
  line.dataset.id = row.id;
  line.setAttribute('role', 'group');
  line.setAttribute('aria-label', row.name ? `${row.label} (${row.name})` : row.label);
  line.firstChild.title = row.title;
  line.firstChild.classList.add('form-label');
  return line;
}

/* The form, from formRows()'s result, as labelled rows: inside the Current value
 * card, or framed on its own elsewhere (Compare JSON). onToggle(id) opens or
 * closes a group. */
export function renderForm(result, container, onToggle) {
  const rows = factRows(container);
  rows.classList.add('form-view');
  result.rows.forEach((row) => formRow(rows, row, onToggle));
  if (!result.rows.length) {
    const none = document.createElement('div');
    none.className = 'fc-empty';
    none.appendChild(unknownNode('Nothing in the value to list.'));
    rows.appendChild(none);
  }
  if (result.truncated) {
    const more = document.createElement('div');
    more.className = 'fc-empty';
    more.appendChild(unknownNode(`${result.truncated} more rows are not drawn. The Tree and Raw views hold them all.`));
    rows.appendChild(more);
  }
  return rows;
}

/* The value as JSON text, a numbered line each (the numbers are a CSS counter, never
 * part of a copied selection), so a line number here is the one the tree shows. */
export function renderRaw(text, container) {
  const pre = document.createElement('pre');
  const lines = countLines(text);
  /* A block per line costs more than it is worth past this many: the text is drawn whole. */
  if (lines > MAX_NUMBERED_LINES) {
    pre.className = 'raw is-wrap';
    pre.textContent = text;
    container.appendChild(pre);
    return pre;
  }
  pre.className = 'raw is-wrap is-numbered';
  pre.style.setProperty('--gutter', `calc(${String(lines).length}ch + 14px)`);
  text.split('\n').forEach((part) => {
    const line = document.createElement('div');
    line.className = 'raw-line';
    line.textContent = part;
    pre.appendChild(line);
  });
  container.appendChild(pre);
  return pre;
}
