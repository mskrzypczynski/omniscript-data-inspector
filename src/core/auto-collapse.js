'use strict';

/* "Collapse done steps": a step folds once when the script passes it and opens
 * again if it becomes the current one; whatever the user does by hand in
 * between is left alone.
 *
 * Pure apart from mutating the sets it is given: no DOM, no chrome.*. */

/* elements: the flattened script; progress: executionStatus() output;
 * sets: { collapsed, autoFolded, handFolded } of element keys.
 * True when the folding changed. */
export function applyAutoCollapse(elements, progress, sets) {
  const { collapsed, autoFolded, handFolded } = sets;
  let changed = false;

  elements.forEach((element) => {
    if (element.category.key !== 'step' || !element.hasChildren || handFolded.has(element.key)) return;
    const status = progress[element.key];
    if ((status === 'done' || status === 'skipped') && !autoFolded.has(element.key)) {
      autoFolded.add(element.key);
      collapsed.add(element.key);
      changed = true;
    } else if ((status === 'current' || status === 'pending') && autoFolded.has(element.key)) {
      autoFolded.delete(element.key);
      collapsed.delete(element.key);
      changed = true;
    }
  });

  return changed;
}
