'use strict';

/* The words of the Compare data panel: how many differences, how long ago
 * a payload was read, and why "Since step entry" is not on offer. Pure: the
 * caller passes the clock.
 *
 * Pure: no DOM, no chrome.*. */

/* "just now", "12 s ago", "3 min ago", "2 h ago". `ms` is how long ago. */
export function agoText(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/* The line beside a disabled "Since step entry": what is missing. `stamp` is
 * the step the script is on ({ name, visitFrom }, step-stamp.js) or null. */
export function sinceStepReason(stamp) {
  if (!stamp || stamp.visitFrom === null || stamp.visitFrom === undefined) {
    return 'Step not known yet: open the Structure tab once';
  }
  return `Needs two different reads since the script entered ${stamp.name}`;
}
