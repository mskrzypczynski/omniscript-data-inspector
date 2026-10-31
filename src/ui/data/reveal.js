'use strict';

/* Opening a path in the tree, or in the Form, which draws the same branches: expand
 * what hides it and focus the row. One
 * implementation for the watch list, the next/previous-change keys and a jump
 * from the Structure tab. */

import { ancestorsOf } from '../../core/data/changes.js';

/* setView(view, redraw) switches the view; from Raw, Sizes or Changes a jump lands in the
 * tree, from the Form it stays in the Form. The returned function
 * only updates state; the caller redraws (consumeReveal runs inside a render).
 *
 * options:
 *   clearFilters  drop the search text and, unless keepChangedOnly, the
 *                 changed-only switch, which would otherwise hide the row
 *   keepChangedOnly  leave changed-only on (stepping through marked changes)
 *   expandSelf    also open the row itself (a jump to a container) */
export function createReveal(state, el, setView) {
  /* A jump is the user's own request, so it is not held back by text they had
   * selected in the tree (a redraw waits for that selection to go): let go of it. */
  function releaseSelection() {
    const selection = window.getSelection && window.getSelection();
    const anchor = selection && !selection.isCollapsed && selection.rangeCount ? selection.anchorNode : null;
    if (anchor && el.viewport && el.viewport.contains(anchor)) selection.removeAllRanges();
  }

  return function revealPath(path, { clearFilters = true, keepChangedOnly = false, expandSelf = false } = {}) {
    releaseSelection();
    if (state.view !== 'tree' && state.view !== 'form') setView('tree', false);
    if (clearFilters) {
      if (state.filter) { state.filter = ''; el.filter.value = ''; }
      if (!keepChangedOnly) { state.changedOnly = false; if (el.changedOnly) el.changedOnly.checked = false; }
    }
    /* While a filter is on, the user's toggles (filterOpen) decide what is
     * open; dropping the target's entries lets its matches default to open. */
    ancestorsOf(path).forEach((ancestor) => { state.expanded.add(ancestor); state.filterOpen.delete(ancestor); });
    if (expandSelf) { state.expanded.add(path); state.filterOpen.delete(path); }
    state.focus = path;
    state.jumpedAt = Date.now();
    state.scrollToFocus = true;
  };
}
