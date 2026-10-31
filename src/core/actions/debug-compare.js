'use strict';

/* Two debug runs side by side: the steps of an Integration Procedure matched
 * by element name, with their status and time in each run and what changed.
 * Used by the Compare tab when both calls are debug runs of the same kind,
 * ahead of the usual input and output differences.
 *
 * Run A is the baseline (the earlier call), run B the call on show. A delta is
 * B minus A, so a positive one is slower.
 *
 * Pure: no DOM, no chrome.*. */

import { formatTime } from '../shared/time-format.js';
import { isSkipped, isPlainSuccess } from './debug-run.js';

/* A change counts as slower or faster from this size: a fifth of run A's time
 * and at least 10 ms, so a few milliseconds on a fast step say nothing. */
export const SIGNIFICANT_SHARE = 0.2;
export const SIGNIFICANT_MS = 10;

const known = (ms) => typeof ms === 'number' && Number.isFinite(ms);

/* B minus A, null when either time is unknown. */
function deltaOf(a, b) {
  return known(a) && known(b) ? b - a : null;
}

/* 'slower' or 'faster' for a delta that is big enough, '' otherwise. */
export function verdictOf(a, delta) {
  if (delta === null || Math.abs(delta) < SIGNIFICANT_MS) return '';
  if (known(a) && a > 0 && Math.abs(delta) / a < SIGNIFICANT_SHARE) return '';
  return delta > 0 ? 'slower' : 'faster';
}

/* A signed time: "+30 ms", "-1.2 s", "0 ms"; '' when unknown. */
export function deltaText(delta, format) {
  if (delta === null || delta === undefined) return '';
  if (delta === 0) return formatTime(0, format);
  return `${delta > 0 ? '+' : '-'}${formatTime(Math.abs(delta), format)}`;
}

/* The steps of a model keyed by name and occurrence, so an element that ran
 * twice is matched first with first, second with second. */
function keyed(steps) {
  const seen = new Map();
  return steps.map((step) => {
    const count = (seen.get(step.name) || 0) + 1;
    seen.set(step.name, count);
    return { key: `${step.name}\u0000${count}`, occurrence: count, step };
  });
}

/* A step that did not run has no time to compare. */
const timeOf = (step) => (step && !isSkipped(step) ? step.elapsedMs : null);
const cpuOf = (step) => (step && !isSkipped(step) ? step.cpuMs : null);

/* 'ran' when the step was skipped in run A and ran in run B, 'skipped' the
 * other way round, '' otherwise (also when one run lacks the step). */
export function ranChange(a, b) {
  if (!a || !b || isSkipped(a) === isSkipped(b)) return '';
  return isSkipped(a) ? 'ran' : 'skipped';
}

function rowOf(first, second) {
  const a = first ? first.step : null;
  const b = second ? second.step : null;
  const delta = deltaOf(timeOf(a), timeOf(b));
  const named = first || second;
  return {
    name: named.step.name,
    occurrence: named.occurrence,
    presence: a && b ? 'both' : (a ? 'a-only' : 'b-only'),
    statusA: a ? a.status : '',
    statusB: b ? b.status : '',
    elapsedA: timeOf(a),
    elapsedB: timeOf(b),
    deltaMs: delta,
    verdict: verdictOf(timeOf(a), delta),
    ranChange: ranChange(a, b),
    cpuDeltaMs: deltaOf(cpuOf(a), cpuOf(b))
  };
}

/* The comparison of two debug run models (debugModelOf) of one kind:
 *   { rows, totals, identical }
 * rows: one per element name (and occurrence), the first run's order first and
 * then the elements only the second run has, each
 *   { name, occurrence, presence: 'both' | 'a-only' | 'b-only', statusA,
 *     statusB, elapsedA, elapsedB, deltaMs, verdict, ranChange, cpuDeltaMs }
 * (a step that was skipped has no time; ranChange is 'ran' or 'skipped' for a
 * step skipped in only one run)
 * totals: { statusA, statusB, elapsedA, elapsedB, deltaMs, verdict, cpuA,
 *   cpuB, cpuDeltaMs } of the whole runs (Succeeded or Failed as the status).
 * orderChanged: the elements both runs have came in another order in run B.
 * identical: no element differs in status, time or presence, the order is the
 * same and the totals match. A DataRaptor has no steps: its rows are empty and
 * the totals say it. */
export function compareDebugRuns(modelA, modelB) {
  const stepsA = keyed(modelA && modelA.steps ? modelA.steps : []);
  const stepsB = keyed(modelB && modelB.steps ? modelB.steps : []);
  const byKeyB = new Map(stepsB.map((item) => [item.key, item]));
  const inA = new Set(stepsA.map((item) => item.key));
  const rows = stepsA.map((item) => rowOf(item, byKeyB.get(item.key) || null))
    .concat(stepsB.filter((item) => !inA.has(item.key)).map((item) => rowOf(null, item)));

  const elapsedA = modelA && known(modelA.elapsedMs) ? modelA.elapsedMs : null;
  const elapsedB = modelB && known(modelB.elapsedMs) ? modelB.elapsedMs : null;
  const cpuA = modelA && known(modelA.cpuMs) ? modelA.cpuMs : null;
  const cpuB = modelB && known(modelB.cpuMs) ? modelB.cpuMs : null;
  const totalDelta = deltaOf(elapsedA, elapsedB);
  const totals = {
    statusA: modelA && modelA.ok ? 'Succeeded' : 'Failed',
    statusB: modelB && modelB.ok ? 'Succeeded' : 'Failed',
    elapsedA,
    elapsedB,
    deltaMs: totalDelta,
    verdict: verdictOf(elapsedA, totalDelta),
    cpuA,
    cpuB,
    cpuDeltaMs: deltaOf(cpuA, cpuB)
  };
  const byKeyA = new Map(stepsA.map((item) => [item.key, item]));
  const orderChanged = JSON.stringify(sequenceOf(stepsA, byKeyB)) !== JSON.stringify(sequenceOf(stepsB, byKeyA));
  const identical = !rows.some(rowChanged) && !orderChanged && totals.statusA === totals.statusB && elapsedA === elapsedB && cpuA === cpuB;
  return { rows, totals, identical, orderChanged };
}

/* The keys of the steps the other run also has, in this run's order. */
function sequenceOf(items, other) {
  return items.filter((item) => other.has(item.key)).map((item) => item.key);
}

/* Whether a row shows any difference at all: an element only one run has,
 * another status or another time, down to the millisecond. */
export function rowChanged(row) {
  return row.presence !== 'both' || row.statusA !== row.statusB || row.elapsedA !== row.elapsedB;
}

/* Whether a row is worth the reader's eye, and counts in the heading: an
 * element only one run has, another status, or a time that is slower or faster
 * by the rule above. Milliseconds of noise do not count. */
export function rowDiffers(row) {
  return row.presence !== 'both' || row.statusA !== row.statusB || row.verdict !== '';
}

/* The heading of the comparison: "2 of 3 steps differ", "identical", with
 * "order changed" and the total's verdict added when they apply. A DataRaptor
 * has no steps: "Run - identical" or "Run - differs". */
export function compareHeading(result, kind) {
  if (kind !== 'ip') return `Run — ${result.identical ? 'identical' : 'differs'}`;
  if (result.identical) return 'Steps — identical';
  const parts = [`${result.rows.filter(rowDiffers).length} of ${result.rows.length} steps differ`];
  if (result.orderChanged) parts.push('order changed');
  if (result.totals.verdict) parts.push(`total ${result.totals.verdict}`);
  return `Steps — ${parts.join(' · ')}`;
}

/* Whether two calls are debug runs of one kind, so their runs can be set
 * side by side. */
export function comparableRuns(entry, baseline) {
  return !!entry && !!baseline && (entry.debug === 'ip' || entry.debug === 'dr') && entry.debug === baseline.debug;
}

/* Whether a row's statuses are worth tags: not when both runs ended it with
 * the ordinary Succeeded. A failure, a warning, a skip or a change shows. */
export function showCompareStatus(statusA, statusB) {
  return !(isPlainSuccess(statusA) && isPlainSuccess(statusB));
}

/* The element column's text: the name, with its place when it ran twice. */
export function rowName(row) {
  return row.occurrence > 1 ? `${row.name} (${row.occurrence})` : row.name;
}

/* How a row's presence reads in words, for the cell and its tooltip: '' when
 * both runs have the element. */
export function presenceNote(row) {
  if (row.presence === 'a-only') return 'only before';
  if (row.presence === 'b-only') return 'only after';
  return '';
}
