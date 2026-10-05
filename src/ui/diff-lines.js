'use strict';

/* One line of a diff, as the Data tab's payload comparison and the Remote
 * actions call comparison both draw it: + added, − removed, ~ changed. */

const show = (value) => (value === undefined ? '' : JSON.stringify(value));

export function diffLine(change) {
  const line = document.createElement('div');
  line.className = `diff-line is-${change.kind}`;
  line.textContent = change.kind === 'added' ? `+ ${change.path}: ${show(change.after)}`
    : change.kind === 'removed' ? `− ${change.path}: ${show(change.before)}`
      : `~ ${change.path}: ${show(change.before)} → ${show(change.after)}`;
  return line;
}
