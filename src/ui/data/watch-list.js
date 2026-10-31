'use strict';

/* The Data tab's watch list: pinning a path, typing an expression, arming a
 * change notice, and the strip above the tree that shows them all
 * (./watch-strip.js draws it). */

import { renderWatchStrip, forgetWatchStrip } from './watch-strip.js';
import { addExpression } from '../../core/data/watch-expr.js';
import { omniPath } from '../../core/shared/path-links.js';
import { toast } from '../toast.js';
import { Mask } from '../mask-setting.js';

/* state, el: the tab's. render(): a full redraw. revealPath(path, options):
 * open a path in the tree. changed(): the pins, expressions or bells changed
 * (to be remembered). */
export function createWatchList({ state, el, render, revealPath, changed = () => {} }) {
  function togglePin(path) {
    if (!path) return; // the root has no path to watch
    const at = state.pins.indexOf(path);
    if (at === -1) state.pins.push(path); else { state.pins.splice(at, 1); state.notify.delete(path); }
    forgetWatchStrip(state);
    render();
    changed();
  }

  function toggleNotify(path) {
    if (state.notify.has(path)) state.notify.delete(path); else state.notify.add(path);
    forgetWatchStrip(state);
    render();
    changed();
  }

  /* The box a typed expression goes into. `draft` starts it with some text. */
  function editExpression(open, draft) {
    state.exprEditing = open;
    state.exprError = '';
    if (open) {
      if (draft !== undefined) state.exprDraft = draft;
      state.exprFocus = true;
    } else {
      state.exprDraft = '';
    }
    forgetWatchStrip(state);
    render();
  }

  /* The row menu's "Watch an expression…": the box, started with that row's
   * path as the OmniScript writes it. */
  function watchExpressionFor(treePath) {
    editExpression(true, (state.data === undefined ? '' : omniPath(state.data, treePath)) || '');
  }

  function submitExpression(text) {
    const result = addExpression(state.exprs, text);
    state.exprError = result.error;
    if (result.error) { state.exprDraft = text; forgetWatchStrip(state); render(); return; }
    state.exprs = result.texts;
    state.exprEditing = false;
    state.exprDraft = '';
    forgetWatchStrip(state);
    render();
    changed();
  }

  function removeExpression(text) {
    state.exprs = state.exprs.filter((expr) => expr !== text);
    state.exprNotify.delete(text);
    forgetWatchStrip(state);
    render();
    changed();
  }

  function toggleExpressionNotify(text) {
    if (state.exprNotify.has(text)) state.exprNotify.delete(text); else state.exprNotify.add(text);
    forgetWatchStrip(state);
    render();
    changed();
  }

  function clearExpressionError() {
    state.exprError = '';
    forgetWatchStrip(state);
    render();
  }

  function draw() {
    renderWatchStrip(el.watch, state, {
      reveal: (path) => { revealPath(path, { clearFilters: true }); render(); },
      remove: togglePin,
      toggleNotify,
      removeExpr: removeExpression,
      toggleExprNotify: toggleExpressionNotify,
      editExpr: editExpression,
      submitExpr: submitExpression,
      clearExprError: clearExpressionError,
      mask: Mask.on() ? Mask.apply : null,
      /* With Mask values on, a notice says that it changed, not what to. */
      notify: (row, was) => toast(Mask.on() ? `${row.label} changed` : `${row.label} changed: ${was} → ${row.text}`)
    });
  }

  /* The strip sits above the tree, so adding the first pin (or removing the last)
   * would push the tree down or up by its height under the pointer. The tree
   * scrolls by the same amount instead, so what is on screen stays where it is. */
  function renderWatch() {
    const before = el.watch.offsetHeight;
    draw();
    const delta = el.watch.offsetHeight - before;
    if (delta) el.viewport.scrollTop = Math.max(0, el.viewport.scrollTop + delta);
  }

  return { togglePin, toggleNotify, renderWatch, watchExpressionFor };
}
