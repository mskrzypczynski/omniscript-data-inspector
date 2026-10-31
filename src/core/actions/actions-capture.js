'use strict';

/* Which captured calls are kept. Every Aura call the page makes is decoded and
 * stored, OmniStudio's or not, and a busy page makes far more of the others
 * (record lookups, layout and UI traffic) than a script makes of its own. The
 * list is capped, so without a rule the cap fills up with that noise and the
 * script's own calls are the ones that fall off the end.
 *
 * The rule: calls that are not OmniStudio's have a smaller cap of their own,
 * and when the whole list is over its cap they go first, oldest first. The
 * OmniStudio calls only start to drop once there is nothing else to drop.
 *
 * Pure: no DOM, no chrome.*. */

import { insertIndex } from '../shared/actions-model.js';

/* The newest this many calls are kept. */
export const MAX_ENTRIES = 500;

/* Of those, at most this many are calls that are not OmniStudio's. */
export const MAX_OTHER_ENTRIES = 200;

/* The list without its oldest call that is not OmniStudio's, or, when every
 * call is, without its oldest. Returns the call that went. */
function dropOne(list, onlyOther) {
  let at = list.findIndex((entry) => !entry.omni);
  if (at < 0) {
    if (onlyOther) return null;
    at = 0;
  }
  return list.splice(at, 1)[0];
}

/* `record` joins `entries` (kept in the order the requests started) where its
 * start time puts it, and the caps are applied:
 *   { entries: the new list, dropped: [the calls that went, oldest first] }
 * `entries` itself is left as it was. */
export function admit(entries, record, { cap = MAX_ENTRIES, otherCap = MAX_OTHER_ENTRIES } = {}) {
  const list = entries.slice();
  list.splice(insertIndex(list, record.time), 0, record);
  const dropped = [];
  let others = list.filter((entry) => !entry.omni).length;
  while (others > otherCap) {
    dropped.push(dropOne(list, true));
    others -= 1;
  }
  while (list.length > cap) dropped.push(dropOne(list, false));
  return { entries: list, dropped };
}

/* How much of an unreadable request a row keeps. */
export const UNDECODED_KEEP = 200;

/* What a row holds as the input of a request the parser read nothing from: a
 * note with its size and the first characters, never the whole body. A form
 * body carries the session's aura.token and aura.context, which must not reach
 * a copy, an export or a bundle, so those values are cut from what is kept. */
export function undecodedNote(body) {
  const text = typeof body === 'string' ? body : '';
  const secret = /(aura\.(?:token|context))=[^&\s]*/gi;
  const kept = text.slice(0, UNDECODED_KEEP).replace(secret, '$1=…');
  return kept ? `request not decoded (${text.length} bytes): ${kept}` : `request not decoded (${text.length} bytes)`;
}
