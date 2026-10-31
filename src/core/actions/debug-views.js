'use strict';

/* The views of the Debug tab: which parts of a debug run the picker offers,
 * what each one shows and copies, the chips that narrow the debug log, and
 * the steps as a table for a ticket. The model of the run itself is
 * debug-run.js; the tab that draws these is src/ui/actions/debug-view.js.
 *
 * A view is { id, label, kind }. Ids: 'overview', 'full', 'response',
 * 'original', 'output', 'errors', 'created', 'log', and 'step:<n>' for the
 * element at place n of the run (a name can appear twice, so a place, not a
 * name). An option exists only when its data exists.
 *
 * Pure: no DOM, no chrome.*. */

import { safeParse, ipRoot, ipRootOf, debugBlockOf } from '../shared/actions-model.js';
import { formatTime } from '../shared/time-format.js';
import { lineShown, offsetText, debugCopy, isSkipped, knownWordOrMasked, stepWithKnownWords } from './debug-run.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const OVERVIEW = 'overview';
export const stepViewId = (index) => `step:${index}`;
const STEP_VIEW = /^step:(\d+)$/;

/* The place in the run a step view id names, or -1. */
export function stepIndexOfView(id) {
  const hit = STEP_VIEW.exec(String(id));
  return hit ? Number(hit[1]) : -1;
}

/* ------------------------------------------------------ the data */

/* The whole of the run as the answer carried it: an Integration Procedure's
 * level that holds the run (a preview's fullDataJson, the IPResult of a call
 * made with isDebug, see ipRootOf), a DataRaptor's result. An empty object
 * when it has none. */
export function debugFullData(entry) {
  if (!entry) return {};
  if (entry.debug === 'dr') {
    const top = safeParse(entry.output);
    return isObject(top) ? top : {};
  }
  return ipRoot(entry.output);
}

/* The name of the Full data JSON view's root row: the key the run was found
 * under (fullDataJson, IPResult), "output" when it is the answer itself, and
 * "result" for a DataRaptor. */
export function fullDataLabel(entry) {
  if (entry && entry.debug === 'dr') return 'result';
  return (entry && ipRootOf(entry.output).key) || 'output';
}

/* One element's four roots: what it was given (input, options), what it
 * produced (output) and the rest of its Debug block (status, type, times,
 * anything else the block holds). A root the answer has nothing for is left
 * out, so an element that left nothing is {}. */
export function elementValue(entry, model, index) {
  const step = model && model.steps ? model.steps[index] : null;
  if (!step) return undefined;
  const block = debugBlockOf(debugFullData(entry), step.name);
  const rest = {};
  if (isObject(block)) {
    Object.keys(block).filter((key) => key !== 'Input' && key !== 'Options').forEach((key) => {
      Object.defineProperty(rest, key, { value: block[key], enumerable: true, writable: true, configurable: true });
    });
  }
  const value = {};
  [['input', step.input], ['options', step.options], ['output', step.output]].forEach(([root, part]) => {
    if (part !== undefined) value[root] = part;
  });
  if (Object.keys(rest).length) value.debug = rest;
  return value;
}

/* Whether an element's value holds nothing at all. */
export const leftNothing = (value) => isObject(value) && Object.keys(value).length === 0;

/* ------------------------------------------------------ the picker */

const hasKeys = (value) => isObject(value) && Object.keys(value).length > 0;

/* null, undefined, {} and []: nothing worth a view of its own. */
const isEmpty = (value) => value === undefined || value === null
  || (Array.isArray(value) ? value.length === 0 : isObject(value) && Object.keys(value).length === 0);

function elementLabels(steps) {
  const seen = new Map();
  steps.forEach((step) => seen.set(step.name, (seen.get(step.name) || 0) + 1));
  return steps.map((step, index) => (seen.get(step.name) > 1 ? `${step.name} (${index + 1})` : step.name));
}

/* The options of the picker for a run, in order: the Overview, the whole
 * data, the Response and the Original input (an Integration Procedure; a
 * DataRaptor has its Output, Errors and Created objects), the Debug log, then
 * one option per element in run order. */
export function debugViews(model, entry) {
  if (!model || !entry) return [];
  const views = [{ id: OVERVIEW, label: 'Overview', kind: 'overview' }];
  if (entry.debug === 'dr') {
    if (model.output !== undefined) views.push({ id: 'output', label: 'Output', kind: 'tree' });
    if (hasKeys(model.errors)) views.push({ id: 'errors', label: 'Errors', kind: 'tree' });
    if (hasKeys(model.created)) views.push({ id: 'created', label: 'Created objects', kind: 'tree' });
    if (model.log.length) views.push({ id: 'log', label: 'Debug log', kind: 'log' });
    if (hasKeys(debugFullData(entry))) views.push({ id: 'full', label: 'Full response', kind: 'tree' });
    return views;
  }
  if (hasKeys(debugFullData(entry))) views.push({ id: 'full', label: 'Full data JSON', kind: 'tree' });
  if (!isEmpty(model.response)) views.push({ id: 'response', label: 'Response', kind: 'tree' });
  if (model.originalInput !== undefined && model.originalInput !== null) views.push({ id: 'original', label: 'Original input', kind: 'tree' });
  if (model.log.length) views.push({ id: 'log', label: 'Debug log', kind: 'log' });
  const labels = elementLabels(model.steps);
  model.steps.forEach((step, index) => views.push({ id: stepViewId(index), label: labels[index], kind: 'element' }));
  return views;
}

/* The view to show: the one chosen when the run still offers it, else the Overview. */
export function resolveView(views, chosen) {
  return views.some((view) => view.id === chosen) ? chosen : OVERVIEW;
}

/* The value a tree view draws, undefined for a view that is not one tree. */
export function viewValue(entry, model, id) {
  if (!model) return undefined;
  if (id === 'full') return debugFullData(entry);
  if (id === 'response') return model.response;
  if (id === 'original') return model.originalInput;
  if (id === 'output') return model.output;
  if (id === 'errors') return model.errors;
  if (id === 'created') return model.created;
  const index = stepIndexOfView(id);
  return index >= 0 ? elementValue(entry, model, index) : undefined;
}

/* ------------------------------------------------------ the log chips */

/* Which kinds of line each chip shows; a count line (Query results found)
 * belongs with its query. `counted` is what the chip's number counts: the
 * Queries chip counts the queries only, so it agrees with the totals line and
 * the head line, not the queries plus their count lines. */
const CHIPS = [
  { id: 'queries', label: 'Queries', kinds: ['query', 'count'], counted: ['query'], title: 'Show only the queries and how many records they found' },
  { id: 'timing', label: 'Timing', kinds: ['time'], counted: ['time'], title: 'Show only the lines that give a time (Query time, Time in Server)' },
  { id: 'info', label: 'Info', kinds: ['info'], counted: ['info'], title: 'Show only the other lines of the log' }
];

/* The chips a log has: [{ id, label, title, count }], only those with lines. */
export function logChips(lines) {
  return CHIPS
    .map((chip) => ({ id: chip.id, label: chip.label, title: chip.title, count: lines.filter((line) => chip.counted.includes(line.kind)).length }))
    .filter((chip) => chip.count > 0);
}

/* Whether a line is shown with these chips pressed (none pressed shows all)
 * and this filter text (a case-insensitive piece of the line as shown). */
export function logLineShown(line, pressed, filter, masked) {
  if (pressed && pressed.size && !CHIPS.some((chip) => pressed.has(chip.id) && chip.kinds.includes(line.kind))) return false;
  const text = String(filter || '').trim().toLowerCase();
  return !text || lineShown(line, masked).toLowerCase().includes(text);
}

export function visibleLog(lines, pressed, filter, masked) {
  return lines.filter((line) => logLineShown(line, pressed, filter, masked));
}

/* ------------------------------------------------------ the steps */

/* The place of the slowest step, or -1 when there is nothing to single out:
 * fewer than two steps with a time (0 ms is a time; a step that did not run
 * has none), or a tie for the longest. */
export function slowestStep(steps) {
  const timed = steps
    .map((step, index) => ({ index, ms: isSkipped(step) ? null : step.elapsedMs }))
    .filter((step) => typeof step.ms === 'number' && Number.isFinite(step.ms) && step.ms >= 0);
  if (timed.length < 2) return -1;
  const longest = timed.reduce((best, step) => (step.ms > best.ms ? step : best), timed[0]);
  return timed.filter((step) => step.ms === longest.ms).length > 1 ? -1 : longest.index;
}

const cell = (text) => String(text === undefined || text === null ? '' : text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const timeCell = (ms, format) => (ms === null || ms === undefined ? '' : formatTime(ms, format));

/* The steps in view: [{ step, index }] for those holding the filter text,
 * `index` being the step's place in the run. */
export function visibleSteps(model, filter) {
  if (!model || !model.steps) return [];
  return model.steps.map((step, index) => ({ step, index })).filter((one) => stepMatches(one.step, filter));
}

/* The steps as a Markdown table: #, element, type, status, elapsed, CPU.
 * Names, types, statuses and times only, nothing a step was given or made. A
 * step that did not run reads Skipped with no times. opts: { masked, filter }.
 * Masked, a type or status stays only when it is a known word (see
 * knownWordOrMasked); element names are keys of the data, which Mask values
 * keeps. With a filter, the rows the filter shows, numbered as in the run.
 * '' for a run with no steps or no step in view. */
export function stepsMarkdown(model, format, opts = {}) {
  const shown = visibleSteps(model, opts.filter);
  if (!shown.length) return '';
  const lines = ['| # | Element | Type | Status | Elapsed | CPU |', '|---|---|---|---|---|---|'];
  shown.forEach(({ step: made, index }) => {
    const step = opts.masked ? stepWithKnownWords(made) : made;
    lines.push(`| ${index + 1} | ${cell(step.name)} | ${cell(step.type)} | ${cell(step.status)} | ${timeCell(step.elapsedMs, format)} | ${timeCell(step.cpuMs, format)} |`);
  });
  return lines.join('\n');
}

/* A step whose name or type or status holds the filter text (case-insensitive). */
export function stepMatches(step, filter) {
  const text = String(filter || '').trim().toLowerCase();
  return !text || [step.name, step.type, step.status].some((part) => String(part || '').toLowerCase().includes(text));
}

/* ------------------------------------------------------ copying */

/* What Copy puts on the clipboard for the view shown, as text. The Overview
 * copies the whole run; a tree view its value; the log the lines in view, one
 * per line with their offset. `mask` is the masking function while Mask values
 * is on, undefined otherwise; log lines go through maskLogLine either way via
 * lineShown. opts: { chips, filter, format }. */
export function viewCopyText(entry, model, id, mask, opts = {}) {
  if (!model) return '';
  if (id === OVERVIEW) return JSON.stringify(debugCopy(entry, model, mask), null, 2);
  if (id === 'log') {
    return visibleLog(model.log, opts.chips, opts.filter, !!mask)
      .map((line) => `${offsetText(line, opts.format)}\t${lineShown(line, !!mask)}`.replace(/^\t/, ''))
      .join('\n');
  }
  const value = viewValue(entry, model, id);
  if (value === undefined) return '';
  if (!mask) return JSON.stringify(value, null, 2);
  return JSON.stringify(stepIndexOfView(id) >= 0 ? maskElement(value, mask) : mask(value), null, 2);
}

/* An element's value masked: its values become placeholders, except that the
 * Status and Type in its debug root stay when they are known words, as in the
 * steps table. */
export function maskElement(value, mask) {
  const masked = mask(value);
  if (!isObject(value.debug) || !isObject(masked.debug)) return masked;
  const debug = { ...masked.debug };
  ['Status', 'Type'].forEach((key) => {
    if (typeof value.debug[key] === 'string') debug[key] = knownWordOrMasked(value.debug[key]);
  });
  return { ...masked, debug };
}

/* Whether Copy has nothing to put on the clipboard for the view shown: a log
 * with no line in view, or an element that left nothing. The tab says so in a
 * toast instead of copying. */
export function nothingToCopy(entry, model, id, opts = {}) {
  if (!model) return true;
  if (id === OVERVIEW) return false;
  if (id === 'log') return visibleLog(model.log, opts.chips, opts.filter, false).length === 0;
  const value = viewValue(entry, model, id);
  return value === undefined || (stepIndexOfView(id) >= 0 && leftNothing(value));
}

/* The tooltip of Copy for the view shown. */
export function viewCopyTitle(id) {
  if (id === OVERVIEW) return 'Copy this run (steps, response and log) as JSON. Honours Mask values.';
  if (id === 'log') return 'Copy the lines of the log in view, one per line. Honours Mask values.';
  return 'Copy this view as JSON. Honours Mask values.';
}
