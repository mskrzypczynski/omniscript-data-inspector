'use strict';

/* The Validation tab, live: what a Messaging / Validation element's
 * expression comes to against the data now, which message that selects, and
 * whether it holds the user back; and whether a Set Errors element's condition
 * holds.
 *
 * Best effort: only a rule group can be judged. A formula string is reported
 * as such.
 *
 * Pure: no DOM, no chrome.*. */

import { evaluateExpression, ruleLines } from './visibility.js';
import { activeMessages, blocksNext } from './step-validation.js';

/* { state: 'true' | 'false' | 'unknown', headline, lines, active, blocks }
 *   lines  — ruleLines() of the expression, for a per-rule breakdown
 *   active — [{ type, text, blocks }] the messages the result selects
 *   blocks — true when one of them holds the user back
 *   estimated — the result rests on a formula's estimate
 * null for an element that is not a Messaging / Validation one. */
export function liveMessaging(validation, data, ctx) {
  if (!validation || validation.kind !== 'messaging') return null;
  const raw = validation.raw ? validation.raw.validateExpression : null;
  const { result, tree, estimated } = evaluateExpression(raw, data, ctx);
  const selected = activeMessages(validation, data, ctx);

  if (result === null || !selected) {
    return {
      state: 'unknown', lines: [], active: [], blocks: false,
      headline: typeof raw === 'string' && raw.trim()
        ? "Can't tell: the expression is a formula, which the panel does not evaluate"
        : "Can't tell: the panel cannot evaluate the expression"
    };
  }

  const active = selected.messages.map((message) => ({
    type: message.type, text: message.text, blocks: blocksNext(message)
  }));
  return {
    state: String(result),
    headline: `Expression is ${result}${estimated ? ' (estimated)' : ''}`,
    estimated: !!estimated,
    lines: ruleLines(tree),
    active,
    blocks: active.some((message) => message.blocks)
  };
}

/* Text for the active messages: what is shown now and whether it blocks Next. */
export function describeActive(live) {
  if (!live || live.state === 'unknown') return '';
  if (!live.active.length) return 'No message is active now';
  return live.active
    .map((message) => `${message.type}: “${message.text}” — ${message.blocks ? 'blocks Next' : 'does not block Next'}`)
    .join('\n');
}

/* A Set Errors element: is its condition true now? `info` is the element's
 * entry from computeVisibility. */
export function liveSetErrors(validation, info) {
  if (!validation || validation.kind !== 'set-errors') return null;
  if (!validation.triggerExpr) {
    /* What the runtime does with a Set Errors that has no condition is not in the
     * definition, and what may stop Next does not count it, so neither claims it. */
    return { state: 'unknown', headline: 'No condition is set, so the panel cannot tell when the error is set', blocks: false };
  }
  if (!info || !info.live || !info.evaluation) {
    return { state: 'unknown', headline: "Can't tell: the panel cannot evaluate the condition", blocks: false };
  }
  const isTrue = info.evaluation.result === true;
  const tail = info.estimated ? ' (estimated)' : '';
  if (!isTrue) return { state: 'false', headline: `Condition is false now: no error is set${tail}`, blocks: false };
  if (info.hidden) return { state: 'false', headline: `Hidden by a parent: no error is set${tail}`, blocks: false };
  return { state: 'true', headline: `Condition is true now: the error is set and blocks Next${tail}`, blocks: true };
}
