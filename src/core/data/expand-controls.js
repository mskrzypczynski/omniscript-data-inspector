'use strict';

/* Expand all and Collapse all open and close the branches of the Tree and the
 * groups of the Form; the other views have nothing to open. The buttons stay
 * where they are so the toolbar does not jump when the view changes: here is
 * what they say and whether they work. */

const BRANCH_VIEWS = ['tree', 'form'];

export const EXPAND_TITLE = 'Open every branch of the Tree or Form';
export const COLLAPSE_TITLE = 'Close every branch to the top level';

export const hasBranches = (view) => BRANCH_VIEWS.includes(view);

/* view: the Data view in use. Returns { disabled, expandTitle, collapseTitle };
 * the title of a button that does nothing here says why. */
export function expandControls(view) {
  if (hasBranches(view)) return { disabled: false, expandTitle: EXPAND_TITLE, collapseTitle: COLLAPSE_TITLE };
  const why = 'Only in the Tree and the Form';
  return { disabled: true, expandTitle: `Expand all: ${why}`, collapseTitle: `Collapse all: ${why}` };
}
