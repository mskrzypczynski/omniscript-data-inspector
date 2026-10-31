'use strict';

/* "Where did this value come from?": for one place in the payload, what the
 * panel knows about how it got its value. Three facts, each optional:
 *  - the last change the Data tab logged for that path (when, on which step,
 *    was → now). The log exists only while Track changes is on;
 *  - the call that was in flight, or had just ended, when that change was
 *    noticed (a read sees the effect of a call a moment after it ends, so the
 *    window runs from the call's start to five seconds after its end);
 *  - the Set Values elements whose assignments write that place.
 * Nothing here guesses: a fact the panel cannot support is simply absent.
 *
 * Pure: no DOM, no chrome.*. */

import { assignmentsOf, createReferences, referenceSegments } from '../shared/references.js';
import { dataSegments, ownerIndex } from '../shared/path-links.js';
import { callEndMs, CHANGE_WINDOW_MS } from '../shared/actions-changes.js';
import { clockText } from '../shared/change-log.js';

const msOf = (time) => (time instanceof Date ? time.getTime() : Number(time));

/* The newest log entry for exactly this path, or null. `changes` is the change
 * log, oldest first. */
export function lastChange(path, changes) {
  const list = Array.isArray(changes) ? changes : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].path === path) return list[i];
  }
  return null;
}

/* The call whose window holds the change: started at or before it, and not
 * ended more than five seconds before it. When several qualify, the one that
 * started last. null when none does. */
export function callFor(change, calls) {
  if (!change) return null;
  const at = msOf(change.time);
  if (Number.isNaN(at)) return null;
  let best = null;
  let bestStart = -Infinity;
  (Array.isArray(calls) ? calls : []).forEach((call) => {
    const start = msOf(call.time);
    if (Number.isNaN(start) || start > at) return;
    if (at > callEndMs(call) + CHANGE_WINDOW_MS) return;
    if (start >= bestStart) { best = call; bestStart = start; }
  });
  return best;
}

/* "Last changed 10:42:03 after Onboarding_GetPlans", or without the call, or
 * '' when no change is known. The tooltip of a row. */
export function changeNote(change, call) {
  if (!change) return '';
  const when = `Last changed ${clockText(change.time instanceof Date ? change.time : new Date(change.time))}`;
  return call && call.name ? `${when} after ${call.name}` : when;
}

/* The Set Values elements that write this place, each once: { key, name,
 * target, expression }. A target counts when it names the element that owns
 * the place, or, for a target that is no element (it creates the data), when
 * its keys end the place's keys. `data` is the payload the path belongs to
 * (it turns the repeat positions of a tree path into keys). */
export function writersOf(path, elements, data) {
  const list = Array.isArray(elements) ? elements : [];
  if (!list.some((element) => element.isSetValues)) return [];

  const segments = path ? dataSegments(data, path) : [];
  if (!segments.length) return [];
  const owner = ownerIndex(list, data)(segments);
  const refs = createReferences(list);

  const found = [];
  list.forEach((element) => {
    if (!element.isSetValues) return;
    const hit = assignmentsOf(element).find(({ target }) => {
      const resolved = refs.resolve(target).element;
      if (resolved) return !!owner && resolved.key === owner.element.key;
      const keys = referenceSegments(target);
      return keys.length > 0 && keys.every((key, i) => key === segments[segments.length - keys.length + i]);
    });
    if (hit) found.push({ key: element.key, name: element.name, target: hit.target, expression: hit.expression });
  });
  return found;
}

/* Everything known about a path: { change, call, writers }, and `empty` when
 * none of it is. ctx: { changes, calls, elements, data }. */
export function lineageFor(path, ctx = {}) {
  const change = lastChange(path, ctx.changes);
  const call = callFor(change, ctx.calls);
  const writers = writersOf(path, ctx.elements, ctx.data);
  return { change, call, writers, empty: !change && !writers.length };
}
