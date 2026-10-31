'use strict';

/* Which step the script was on when a payload was read, so a snapshot can say
 * "12:01:03 · Step2" and "since step entry" has something to go by.
 *
 * Pure: no DOM, no chrome.*. */

/* The stamp for a snapshot, from what the Structure tab reports
 * ({ key, name, visits: [{ key, from, to }] }, oldest visit first): the step's
 * name and the millisecond time the current visit began. null when no step is
 * known (the definition is not loaded, or the script is on none). */
export function stepStamp(step) {
  if (!step || !step.key || !step.name) return null;
  const visits = Array.isArray(step.visits) ? step.visits : [];
  let visitFrom = null;
  for (let i = visits.length - 1; i >= 0; i--) {
    if (visits[i].key === step.key) { visitFrom = visits[i].from; break; }
  }
  return { name: step.name, visitFrom: Number.isFinite(visitFrom) ? visitFrom : null };
}

const msOf = (time) => (time instanceof Date ? time.getTime() : Number(time));

/* From and To for "since step entry": the first snapshot read during the
 * current visit to the step (by the stamp it carries, else by its time), and
 * the latest. null when no step is known, there is nothing read since the step
 * was entered, or the only snapshot of the visit is also the latest. */
export function sinceStepEntry(history, step) {
  const stamp = stepStamp(step);
  if (!stamp || stamp.visitFrom === null || !history.length) return null;
  const latest = history[history.length - 1];
  const first = history.find((snapshot) => (snapshot.step
    ? snapshot.step.name === stamp.name && snapshot.step.visitFrom === stamp.visitFrom
    : msOf(snapshot.time) >= stamp.visitFrom));
  if (!first || first === latest) return null;
  return { from: first, to: latest };
}
