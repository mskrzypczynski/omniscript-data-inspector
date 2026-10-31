'use strict';

/* What the right-click menu of a Structure row offers, and the two things it
 * works out: an element's OmniScript path and the sections inside a branch.
 *
 * Pure: no DOM, no chrome.*. */

import { NAV_TITLE } from './step-nav.js';

/* The element's place the way OmniScript writes it (Step:Block|1:Name): its
 * JSONPath from the definition when it has one, else the names from its step
 * down, joined with colons. */
export function elementPathText(element, byKey) {
  if (element.jsonPath) return element.jsonPath;
  const names = [];
  let node = element;
  let guard = 0;
  while (node && guard++ < 100) {
    names.unshift(node.name);
    node = byKey[node.parentKey];
  }
  return names.join(':');
}

/* The keys of the sections (elements that hold others) in a branch: the element
 * itself, when it is one, and every one inside it at any depth. `elements` is in
 * script order, parents before their children. */
export function branchSections(element, elements) {
  const inside = new Set([element.key]);
  const out = element.hasChildren ? [element.key] : [];
  elements.forEach((candidate) => {
    if (!inside.has(candidate.parentKey)) return;
    inside.add(candidate.key);
    if (candidate.hasChildren) out.push(candidate.key);
  });
  return out;
}

/* The menu as { id, label, disabled? } and '-' for a rule, in order:
 *   Copy name · Copy OmniScript path
 *   Show in Data (greyed when the element has no place in the data) ·
 *   Highlight on page (only for an element that is drawn on the
 *   page: not an action or a validation)
 *   Expand this branch / Collapse this branch (a step or block that holds others)
 *   Previous step / Go to this step (on a step; `navigation` is stepNavigation's)
 *   Select this row
 * `folded` is whether the element is a section that is folded now. */
/* An action or a Set Errors / Messaging element has no component of its own
 * to outline. */
const NOT_ON_PAGE = new Set(['action', 'error']);
const isDrawn = (element) => !NOT_ON_PAGE.has(element.category && element.category.key);

export function rowMenuItems({ element, folded, hasPlace, navigation = null }) {
  const items = [
    { id: 'copy-name', label: 'Copy name' },
    { id: 'copy-path', label: 'Copy OmniScript path' },
    '-',
    { id: 'show-in-data', label: 'Show in Data', disabled: !hasPlace }
  ];
  if (isDrawn(element)) items.push({ id: 'highlight', label: 'Highlight on page' });
  if (element.hasChildren) {
    items.push('-', folded
      ? { id: 'expand-branch', label: 'Expand this branch' }
      : { id: 'collapse-branch', label: 'Collapse this branch' });
  }
  /* A step row can send the running script back to it (step-nav.js). */
  if (navigation) items.push('-', { id: navigation.id, label: navigation.label, title: NAV_TITLE });
  items.push('-', { id: 'select', label: 'Select this row' });
  return items;
}
