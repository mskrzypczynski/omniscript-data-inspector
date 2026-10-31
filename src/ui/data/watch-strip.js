'use strict';

/* The watch list: a strip above the tree with the value of each pinned path
 * and each typed expression. Rebuilt only when what it shows changed, so a
 * poll that changes nothing leaves hover and focus alone. */

import { watchRows } from '../../core/data/watch.js';
import { expressionRows } from '../../core/data/watch-expr.js';
import { icon } from '../icons.js';
import { memoDraw } from '../memo-draw.js';

const INPUT_TITLE = 'A path, a $ query or a comparison such as Status = "Done". Enter adds it, Esc closes.';

/* The rows to draw: the pinned paths, then the expressions. A pin's id is its
 * path; an expression's is made apart from every path (core/data/watch-expr.js). */
function stripRows(state, mask) {
  /* Evaluating every expression walks the payload (a $.. query walks all of it),
   * so the answer is kept while the payload, the list and Mask values are the
   * same: a redraw for any other reason (a hover, a fold) costs nothing here. */
  const key = JSON.stringify([state.rawVersion, state.pins, state.exprs || [], !!mask]);
  const memo = state.watchRowsMemo;
  if (memo && memo.data === state.data && memo.key === key) return memo.rows;
  const rows = computeRows(state, mask);
  state.watchRowsMemo = { data: state.data, key, rows };
  return rows;
}

function computeRows(state, mask) {
  const pins = watchRows(state.data, state.pins, mask).map((row) => ({ ...row, id: row.path, kind: 'pin', verdict: null }));
  const expressions = expressionRows(state.data, state.exprs || [], mask).map((row) => ({ ...row, kind: 'expr' }));
  return pins.concat(expressions);
}

/* state: { data, pins, notify, exprs, exprNotify, exprEditing, exprDraft,
 * exprError, watchPaint, watchPrev, watchStale, watchRowsMemo } (the watch fields are this
 * module's memory, kept there so a selection change can reset them; notify and
 * exprNotify are the pinned paths and expression texts that announce a change).
 * on: { reveal(path), remove(path), toggleNotify(path), removeExpr(text),
 *       toggleExprNotify(text), editExpr(open), submitExpr(text),
 *       clearExprError(), notify(row, was), mask } (mask: a function that hides
 *       values while Mask values is on, or null; row.text stays the real text so
 *       that switching it never reads as a change) */
export function renderWatchStrip(container, state, on) {
  const rows = stripRows(state, on.mask || null);
  container.hidden = rows.length === 0 && !state.exprEditing;
  const notifying = (row) => (row.kind === 'pin' ? (state.notify || new Set()).has(row.path) : (state.exprNotify || new Set()).has(row.expr));
  if (state.watchStale) { state.watchStale = false; forgetWatchStrip(state); }
  if (!state.watchPaint) state.watchPaint = memoDraw(rowsSignature, drawStrip);
  state.watchPaint.redraw(container, state, on, rows, notifying);
}

/* Forget what the strip shows, so the next render draws it again. */
export function forgetWatchStrip(state) {
  if (state.watchPaint) state.watchPaint.reset();
}

const rowsSignature = (container, state, on, rows, notifying) =>
  JSON.stringify([rows.map((row) => [row.id, row.text, row.shown, notifying(row), row.verdict]), !!state.exprEditing, state.exprError || '']);

function button(className, title, label) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.title = title;
  node.setAttribute('aria-label', label || title);
  return node;
}

/* The box a new expression is typed into. One node for the life of the strip:
 * a redraw (the payload changed while the user types) moves it, keeps the draft
 * and puts the cursor back. */
function expressionInput(state, on) {
  if (state.exprInput) return state.exprInput;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'watch-input';
  input.placeholder = 'Step:Total > 100';
  input.spellcheck = false;
  input.title = INPUT_TITLE;
  input.setAttribute('aria-label', 'Watch an expression');
  input.setAttribute('data-help', 'Watch list');
  input.addEventListener('input', () => {
    state.exprDraft = input.value;
    if (state.exprError) on.clearExprError();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); on.submitExpr(input.value); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); on.editExpr(false); }
  });
  state.exprInput = input;
  return input;
}

function drawStrip(signature, container, state, on, rows, notifying) {
  /* Detaching the box would drop the user's cursor; note it and restore it. */
  const input = state.exprEditing ? expressionInput(state, on) : null;
  const focused = !!input && document.activeElement === input;
  const cursor = focused ? [input.selectionStart, input.selectionEnd] : null;

  container.textContent = '';
  const title = document.createElement('span');
  title.className = 'bar-label';
  title.textContent = 'Watching';
  container.appendChild(title);

  const next = {};
  const announce = [];
  rows.forEach((row) => {
    next[row.id] = row.text;
    const item = document.createElement('span');
    item.className = `watch-item${row.present ? '' : ' is-gone'}${row.kind === 'expr' ? ' is-expr' : ''}${row.error ? ' is-error' : ''}`;
    item.__watch = { label: row.label, value: row.value, present: row.present }; // for a copy that has to apply Mask values
    const was = state.watchPrev[row.id];
    const armed = notifying(row);
    if (was !== undefined && was !== row.text) {
      item.classList.add('is-changed');
      if (armed) { item.classList.add('is-notified'); announce.push([row, was]); }
    }

    const target = row.kind === 'pin' ? row.path : row.paths[0];
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'watch-name';
    name.textContent = row.label;
    name.title = target === undefined ? row.label : 'Show in the tree';
    name.disabled = target === undefined;
    name.addEventListener('click', () => on.reveal(target));
    item.appendChild(name);

    const value = document.createElement('span');
    value.className = 'watch-value';
    value.textContent = row.shown;
    value.title = row.shown;
    item.appendChild(value);

    const bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'watch-notify';
    bell.setAttribute('aria-pressed', String(armed));
    bell.title = armed ? 'Notifying when this changes: click to stop' : 'Notify when this changes';
    bell.setAttribute('aria-label', armed ? `Stop notifying when ${row.label} changes` : `Notify when ${row.label} changes`);
    bell.appendChild(icon('bell'));
    bell.addEventListener('click', () => (row.kind === 'pin' ? on.toggleNotify(row.path) : on.toggleExprNotify(row.expr)));
    item.appendChild(bell);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'watch-remove';
    remove.textContent = '×';
    remove.title = 'Stop watching';
    remove.setAttribute('aria-label', `Stop watching ${row.label}`);
    remove.addEventListener('click', () => (row.kind === 'pin' ? on.remove(row.path) : on.removeExpr(row.expr)));
    item.appendChild(remove);

    container.appendChild(item);
  });

  const add = button('watch-add', 'Watch an expression');
  add.textContent = '+';
  add.setAttribute('data-help', 'Watch list');
  add.setAttribute('aria-pressed', String(!!state.exprEditing));
  add.addEventListener('click', () => on.editExpr(!state.exprEditing));
  container.appendChild(add);

  if (input) {
    container.appendChild(input);
    if (input.value !== (state.exprDraft || '')) input.value = state.exprDraft || '';
    input.setAttribute('aria-invalid', String(!!state.exprError));
    if (state.exprError) {
      const error = document.createElement('span');
      error.className = 'watch-error';
      error.setAttribute('role', 'alert');
      error.textContent = state.exprError;
      error.title = state.exprError;
      container.appendChild(error);
    }
    if (focused || state.exprFocus) {
      state.exprFocus = false;
      input.focus();
      if (cursor) input.setSelectionRange(cursor[0], cursor[1]);
    }
  }

  state.watchPrev = next;
  announce.forEach(([row, was]) => on.notify(row, was));
}
