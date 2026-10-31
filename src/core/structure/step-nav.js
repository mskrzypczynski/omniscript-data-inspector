'use strict';

/* Going back to an earlier step from the row menu: which rows offer
 * it and how many Previous clicks it takes. Decisions only; the page side is
 * hostNavigate in ui/targets.js.
 *
 * Pure: no DOM, no chrome.*. */

/* Previous is asked for at most this many times in a row. */
export const MAX_HOPS = 10;

export const NAV_TITLE = 'Acts on the page, not in the panel: presses the script\'s own Previous button (or sends its previous event) ' +
  'to show this step again, even when that button is hidden. ' +
  'Check the result on the page: a script that hid the button may not allow going back.';

const isSkipped = (progress, element) => progress[element.key] === 'skipped';

/* null when the row offers nothing, else { id, label, hops }.
 *   elements — every element, in script order (only the top-level steps count);
 *   progress — executionStatus()'s output: a step the script skipped is not a stop
 *              on the way back, so it is not counted and is not offered;
 *   currentKey — the step the script is on (it must be a step);
 *   targetKey — the step whose row the menu is for.
 * The current step offers "Go back on page" (one hop, if an earlier step was not
 * skipped); an earlier step offers "Go to this step on page" with the hops it takes.
 * The current step as "Go to this step on page", a later step and a trip of more than
 * MAX_HOPS are not offered. */
export function stepNavigation({ elements, progress = {}, currentKey, targetKey }) {
  const steps = elements.filter((element) => element.depth === 0 && element.category.key === 'step');
  const current = steps.findIndex((step) => step.key === currentKey);
  const target = steps.findIndex((step) => step.key === targetKey);
  if (current < 1 || target < 0 || target > current) return null;

  if (target === current) {
    const hasEarlier = steps.slice(0, current).some((step) => !isSkipped(progress, step));
    return hasEarlier ? { id: 'previous-step', label: 'Go back on page', hops: 1 } : null;
  }
  if (isSkipped(progress, steps[target])) return null;
  const hops = steps.slice(target + 1, current + 1).filter((step) => !isSkipped(progress, step)).length;
  if (hops < 1 || hops > MAX_HOPS) return null;
  return { id: 'go-to-step', label: 'Go to this step on page', hops };
}

/* The button the head of a step shows for the same request as the row menu's
 * item: null for none, else { id, label, title, icon }. The
 * label and the tooltip are the menu item's. `navigation` is stepNavigation's. */
export function headNavButton({ navigation }) {
  if (!navigation) return null;
  return { id: navigation.id, label: navigation.label, title: NAV_TITLE, icon: 'external' };
}

/* The status bar's note once the page answered. `how` is hostNavigate's. */
export function navNote(how, hops) {
  if (how === 'none') return 'Could not go back: the script has no Previous button and ignored the request.';
  return `Asked the script to go back ${hops} ${hops === 1 ? 'step' : 'steps'}`;
}
