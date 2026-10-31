'use strict';

/* Is the script the top bar points at the one the Structure tab has loaded?
 * The top bar says "hosts" whenever any host appears or vanishes (a child
 * element rendered on the next step, say) even though the selected script is
 * the same one; only a different script makes what the tab holds meaningless.
 *
 * Pure: no DOM, no chrome.*. */

import { keysMatch } from './targets-model.js';

/* What identifies a script across rescans: its host objects are rebuilt every
 * time, but the frame, Type/SubType/Language key and label stay. */
export function scriptIdentity(host) {
  return host ? { frame: host.frame || '', key: host.key || '', label: host.label || '' } : null;
}

export function sameScript(a, b) {
  if (!a || !b) return false;
  return a.frame === b.frame && keysMatch(a.key, b.key) && a.label === b.label;
}

/* After the top bar changed for `reason`, may the tab keep its selection and
 * folds (and just reload)? Only for a host-list change that left the selected
 * script alone; a new selection, new properties or a navigation reset it. */
export function keepsSelection(reason, loaded, current) {
  return reason === 'hosts' && sameScript(loaded, current);
}

/* What the status bar calls the selected script, on every tab: the
 * Type/SubType/Language people know it by, else the element's own label. A
 * script read from a file is named by the bar that says so, not here. */
export function statusScriptName(host) {
  if (!host || host.session) return '';
  return String(host.key || host.label || '').trim();
}
