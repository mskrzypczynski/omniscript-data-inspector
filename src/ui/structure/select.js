'use strict';

/* The Structure tab's selection: picking an element (by hand, from a jump out
 * of the Data tab, or by following the step the script is on), and what a pick
 * resets. The tab owns the state and the redraw. */

import { shouldFollow } from '../../core/structure/step-follow.js';
import { pickAfterSelection } from '../../core/structure/detail-tabs.js';
import { ownerOfSegments } from '../../core/shared/path-links.js';
import { StatusLine } from '../status-line.js';
import { flashText } from '../util.js';

/* What a new pick starts from: the what-if values, the detail filter's open
 * branches and the property trees belong to the element they were made for. */
function resetSelectionState(state) {
  /* A hand pick of Definition is for the element it was made on: the next one
   * opens on its default tab, never on the raw source. */
  state.pickedTab = pickAfterSelection(state.pickedTab);
  if (state.detailTab === 'definition') state.detailTab = 'value';
  state.whatIf = new Map(); // a what-if belongs to the element it was typed for
  state.whatIfBases = new Map();
  state.filterOpen = {};
  state.propOpen = new Set();
  state.propMore = new Set();
  state.propDocOpen = new Set();
  state.propTrees = {};
  state.expanded = {
    definition: new Set(['']), value: new Set(['']),
    conditions: new Set(['']), validation: new Set([''])
  };
  state.expandedText = {
    definition: new Set(), value: new Set(),
    conditions: new Set(), validation: new Set()
  };
}

/* The open groups of the form belong to the element they were opened on (see formKey in
 * detail-pane.js): leaving it forgets them, so the open state does not pile up. */
function dropFormOpen(state, key) {
  if (key === null || key === undefined) return;
  const prefix = `${key}\u0000`;
  [...state.formOpen].forEach((entry) => { if (entry.startsWith(prefix)) state.formOpen.delete(entry); });
}

/* state, el: the tab's. render(): a full redraw. visible(): the elements the
 * filters show. elementsByKey(), currentElement(): the tab's readers. */
export function createSelecting({ state, el, render, visible, elementsByKey, currentElement, viewChanged }) {
  function selected() {
    return state.elements.find((element) => element.key === state.selectedKey) || null;
  }

  /* A click on a row of the list. */
  function selectFromList(element) {
    state.showProblems = false;
    state.showTimeline = false;
    state.compare = null;
    if (state.selectedKey !== element.key) dropFormOpen(state, state.selectedKey);
    state.selectedKey = element.key;
    state.deselected = false;
    state.followedKey = null; // a hand pick is a hand pick, even of the step Follow was on
    resetSelectionState(state);
    render();
  }

  /* Esc on the list: nothing is selected, and the pane shows the script's
   * summary. Follow current step leaves it so until a pick, Current step or the Follow
   * box makes a selection again. */
  function deselect() {
    if (state.selectedKey === null) return;
    dropFormOpen(state, state.selectedKey);
    state.selectedKey = null;
    state.followedKey = null;
    state.deselected = true;
    state.showProblems = false;
    state.compare = null;
    resetSelectionState(state);
    render();
  }

  /* Selects an element and scrolls it into view. Opens the sections above it;
   * with clearFilters it also drops any filter that would hide it. */
  function selectElement(element, { clearFilters = false, followed = false, keepCompare = false, auto = false } = {}) {
    const byKey = elementsByKey();
    let parent = byKey[element.parentKey];
    while (parent) { state.collapsed.delete(parent.key); parent = byKey[parent.parentKey]; }

    if (clearFilters && !visible().some((candidate) => candidate.key === element.key)) {
      state.filter = '';
      state.actionsOnly = false;
      state.visibleOnly = false;
      document.getElementById('struct-filter').value = '';
      viewChanged(); // the View button's count follows
    }

    /* Follow current step moves the selection on its own, so it must not close what the
     * user opened (the Problems list, a Compare result, the Timeline). Current
     * step is a press, so it brings the step into view, but keeps the Timeline. */
    if (!auto) state.showProblems = false;
    if (!followed) state.showTimeline = false; // a pick of the user's own leaves the Timeline
    if (!keepCompare && !auto) state.compare = null;
    if (state.selectedKey !== element.key) dropFormOpen(state, state.selectedKey);
    state.selectedKey = element.key;
    state.deselected = false;
    state.followedKey = followed ? element.key : null; // only Follow and Current step make a "followed" pick
    resetSelectionState(state);
    render();

    const row = el.list.querySelector('.el-row.is-selected');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
  }

  /* A click on a name in a step's Validation tab. */
  function jumpToKey(key) {
    const target = state.elements.find((element) => element.key === key);
    if (target) selectElement(target, { clearFilters: true });
  }

  function goToCurrentStep() {
    const button = document.getElementById('struct-current');
    const current = currentElement();

    if (!current) {
      flashText(button, state.elements.length ? 'No current step' : 'Nothing loaded');
      return;
    }
    selectElement(current, { clearFilters: true, followed: true });
  }

  /* Auto-follow: runs when the script moves on. Leaves the filters alone — if
   * they hide the step, the detail pane still follows it. It only moves a
   * selection it made itself: an element picked by hand stays selected until
   * the user turns Follow back on or presses Current step. It keeps the
   * Problems list and a Compare result open while it moves. */
  function followStep({ force = false } = {}) {
    if (state.deselected && !force) return;
    const current = currentElement();
    if (!shouldFollow({ current, selectedKey: state.selectedKey, followedKey: state.followedKey, force })) return;
    selectElement(current, { followed: true, auto: true });
  }

  /* A jump from the Data tab: select the element that owns that key. */
  function applyPendingReveal() {
    if (!state.pendingReveal || !state.elements.length) return;
    const owner = ownerOfSegments(state.elements, state.data, state.pendingReveal);
    state.pendingReveal = null;

    if (!owner) {
      StatusLine.right('No element in the definition owns that key');
      return;
    }
    selectElement(owner, { clearFilters: true });
  }

  return { selected, selectFromList, deselect, selectElement, jumpToKey, goToCurrentStep, followStep, applyPendingReveal };
}
