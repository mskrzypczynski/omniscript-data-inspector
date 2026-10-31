'use strict';

/* When to tell the user that Set Errors have started to fire on the step the
 * script is on, while they are looking at another tab. The panel reads the
 * payload every couple of seconds; each read gives the number of errors firing
 * on the current step, and this decides whether that number is news.
 *
 * News is a change from none to some on the same step, at most once every
 * TOAST_EVERY_MS. Arriving on a step that already has errors firing sets a
 * baseline instead: the user just moved there, and the step's own badge says so.
 *
 * Pure: no DOM, no chrome.*, and no clock - callers pass `now`. */

export const TOAST_EVERY_MS = 30000;

export const NEW_WATCH = Object.freeze({ stepKey: null, count: 0, toastedAt: null });

/* { memory, message } for the read just made. `step` is { key, name } of the
 * step the script is on (null when unknown), `count` the errors firing on it.
 * `message` is the text to toast, or null. */
export function nextErrorWatch(memory, step, count, now) {
  if (!step || !step.key) return { memory: { ...memory, stepKey: null, count: 0 }, message: null };

  if (step.key !== memory.stepKey) {
    return { memory: { ...memory, stepKey: step.key, count }, message: null };
  }

  const started = memory.count === 0 && count > 0;
  const due = memory.toastedAt === null || now - memory.toastedAt >= TOAST_EVERY_MS;
  if (started && due) {
    return {
      memory: { stepKey: step.key, count, toastedAt: now },
      message: `Set Errors fire on ${step.name}: ${count}`
    };
  }
  return { memory: { ...memory, count }, message: null };
}
