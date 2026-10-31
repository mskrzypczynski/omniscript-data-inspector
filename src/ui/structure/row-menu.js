'use strict';

/* The right-click menu of a Structure row. The row that was clicked is marked
 * while the menu is open, so it is clear which element the menu is about. */

import { openContextMenu } from '../context-menu.js';
import { copyWithToast } from '../clipboard.js';
import { Targets } from '../targets.js';
import { Nav } from '../nav.js';
import { toast } from '../toast.js';
import { elementSegments } from '../../core/shared/path-links.js';
import { elementPathText, branchSections, rowMenuItems } from '../../core/structure/row-menu.js';
import { navNote } from '../../core/structure/step-nav.js';

/* How long the page gets to show the earlier step before the panel says the
 * script ignored the request (each hop is 0.7 s apart, up to 10, and the poll
 * reads the step about every second). */
const NAV_CHECK_MS = 9000;

/* Marks the row until the menu goes away, however it closes (a choice, a click
 * elsewhere, Escape, a scroll). The menu is a node in the body; its removal is
 * the signal. The key is kept in state so a redraw of the list while the menu
 * is open (the rows are rebuilt) draws the row marked again. */
function markWhileOpen(state, row, element) {
  const menu = document.querySelector('.ctx-menu');
  if (!menu) return;
  state.menuKey = element.key;
  row.classList.add('is-menu-target');
  const done = new MutationObserver(() => {
    if (menu.isConnected) return;
    if (state.menuKey === element.key) state.menuKey = null;
    document.querySelectorAll('.el-row.is-menu-target').forEach((marked) => marked.classList.remove('is-menu-target'));
    done.disconnect();
  });
  done.observe(document.body, { childList: true });
}

/* state: the tab's. byKey(): elements by key. select(element): a pick as from a click.
 * renderList(): redraws the list after sections were folded or unfolded.
 * navigationFor(element): step-nav.js's verdict for the row (null for none).
 * note(text): a line for the status bar.
 * Returns { open(ev, element, row), goBack(element) }. */
export function createRowMenu({ state, byKey, select, renderList, navigationFor = () => null, note = () => {} }) {
  /* Asks the script to go back; if the step has not moved a few seconds later
   * (the next poll would have shown it), says that it ignored the request. */
  function goBack(element) {
    const navigation = navigationFor(element);
    if (!navigation) return;
    const before = state.activeIndex;
    Targets.navigate(navigation.hops, (result) => {
      if (!result.ok) { note(navNote('none', navigation.hops)); return; }
      note(navNote(result.how, navigation.hops));
      setTimeout(() => {
        if (state.activeIndex === before) note(navNote('none', navigation.hops));
      }, NAV_CHECK_MS);
    });
  }

  function setBranch(element, open) {
    const sections = branchSections(element, state.elements);
    sections.forEach((key) => {
      if (open) state.collapsed.delete(key); else state.collapsed.add(key);
      state.handFolded.add(key); // a hand-made choice: auto-collapse leaves it alone
    });
    renderList();
  }

  function actions(element) {
    return {
      'copy-name': () => copyWithToast(element.name, 'Copied name'),
      'copy-path': () => copyWithToast(elementPathText(element, byKey()), 'Copied path'),
      'show-in-data': () => Nav.go('data', { segments: elementSegments(element, state.data) }),
      highlight: () => Targets.highlight(element, true, (found) => {
        if (!found) toast('Not found on page');
      }),
      'expand-branch': () => setBranch(element, true),
      'collapse-branch': () => setBranch(element, false),
      'previous-step': () => goBack(element),
      'go-to-step': () => goBack(element),
      select: () => select(element)
    };
  }

  function openRowMenu(ev, element, row) {
    const segments = elementSegments(element, state.data);
    const items = rowMenuItems({
      element,
      folded: state.collapsed.has(element.key),
      hasPlace: !!(segments && segments.length),
      navigation: navigationFor(element)
    });
    const run = actions(element);
    ev.preventDefault();
    openContextMenu(ev, items.map((item) => (item === '-' ? item : { ...item, action: run[item.id] })));
    markWhileOpen(state, row, element);
  }

  /* The menu, and the request its Previous step / Go to this step items make, which the
   * head of a step makes too. */
  return { open: openRowMenu, goBack };
}
