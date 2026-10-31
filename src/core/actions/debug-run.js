'use strict';

/* Debug runs: the designers' Preview of an Integration Procedure or a
 * DataRaptor, which goes over Visualforce remoting with debug information on,
 * and an Integration Procedure a page called with isDebug in its options,
 * which answers with the same run (debugFlavourOf in the shared actions model
 * tells both).
 * This module reads such a call and its answer into the models the Debug tab
 * draws: the head line, the steps of an Integration Procedure with their time
 * and share, the output and errors of a DataRaptor, and the debug log with the
 * offsets of its lines. How the request is told apart is decodeDebugCall in
 * the shared actions model (parseRequest uses it); how a re-run is written
 * back is call-wire.js.
 *
 * Best effort, like the rest of the tab: a key that is missing gives an empty
 * section, never an exception, and keys the models do not know are ignored
 * (they stay in the Output tab).
 *
 * Pure: no DOM, no chrome.*. */

import {
  safeParse, decodeDebugCall, failed, isStepFailure, debugRunFailure, ipRoot, ipStepNames, stepFacts, debugBlockOf, timeOrNull, readSkeleton, parseDebugLog, kindOfLine
} from '../shared/actions-model.js';
import { MASK_STRING } from '../shared/mask.js';
import { formatTime } from '../shared/time-format.js';

export { parseDebugLog };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ------------------------------------------------------ the request */

/* What a decoded remoting action asks for, when it is a designer preview:
 * { flavour: 'ip' | 'dr', recordId, name, input, options }; null otherwise.
 * Works on the action parseRequest made, and, for a bare call, on the call. */
export function debugRunOf(action) {
  if (!isObject(action)) return null;
  if (action.debug === 'ip' || action.debug === 'dr') {
    return {
      flavour: action.debug,
      recordId: typeof action.recordId === 'string' ? action.recordId : '',
      name: action.debug === 'dr' && typeof action.remoteMethod === 'string' ? action.remoteMethod : '',
      input: action.input,
      options: action.options
    };
  }
  const found = decodeDebugCall(isObject(action.rawRequest) ? action.rawRequest : action);
  if (!found) return null;
  return { flavour: found.flavour, recordId: found.recordId, name: found.name, input: found.input, options: found.options };
}

/* ------------------------------------------------------ the debug log */

/* A log line as it may leave the panel while Mask values is on. Only lines
 * of a known kind keep their shape, with their literals hidden:
 *   - Query: the SOQL, its string literals (single or double quoted, one left
 *     open runs to the end of the line), the values after a comparison
 *     operator or in an IN list, and Salesforce Ids;
 *   - Query results found, Query time, Time in Server: kept when all that
 *     follows is a number (a count or a time, no value of the org).
 * Any other line is free text of the script, which cannot be told from a
 * value, so it becomes its kind word and a placeholder ("Info: •••"). */
export const MASKED_TEXT = '•••';

const STRING_LITERAL = /'(?:[^'\\]|\\.|\\$)*(?:'|$)|"(?:[^"\\]|\\.|\\$)*(?:"|$)/g;
const SALESFORCE_ID = /(?<![A-Za-z0-9_])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?(?![A-Za-z0-9_])/g;
const AFTER_OPERATOR = /([!<>=]{1,2}\s*)([^\s,()]+)/g;
const IN_LIST = /(\bIN\s*\(\s*)((?!SELECT\b)[^)]*)\)/gi;
const KEPT_VALUE = /^(?:'•••'|"•••"|•••|true|false|null)$/i;
const NUMBER_ONLY = /^\s*-?\d+(?:\.\d+)?\s*(?:ms)?\s*$/i;

const placeholderFor = (token) => (token[0] === '"' ? `"${MASKED_TEXT}"` : `'${MASKED_TEXT}'`);

/* The SOQL of a query with its values hidden. */
export function maskQuery(soql) {
  return String(soql === undefined || soql === null ? '' : soql)
    .replace(STRING_LITERAL, placeholderFor)
    .replace(AFTER_OPERATOR, (whole, operator, token) => (KEPT_VALUE.test(token) ? whole : `${operator}${MASKED_TEXT}`))
    .replace(IN_LIST, (whole, open, items) => `${open}${items.split(',').map((item) => {
      const value = item.trim();
      return !value || KEPT_VALUE.test(value) ? item : item.replace(value, MASKED_TEXT);
    }).join(',')})`)
    .replace(SALESFORCE_ID, MASKED_TEXT);
}

/* What stays of a line of text (without its time stamp) under Mask values. */
export function maskLogLine(text) {
  const whole = String(text === undefined || text === null ? '' : text);
  const kind = kindOfLine(whole);
  if (kind === 'query') return `Query: ${maskQuery(whole.replace(/^Query:\s*/i, ''))}`;
  if (kind === 'count' || kind === 'time') {
    const rest = whole.replace(/^(?:Query results found|Query time|Time in Server)\b[:\s]*/i, '');
    if (NUMBER_ONLY.test(rest)) return whole;
  }
  return placeholderLine(kind);
}

/* The SOQL of a query line: what follows "Query:". */
export function queryOf(line) {
  return String(line && line.text !== undefined ? line.text : '').replace(/^Query:\s*/i, '').trim();
}

/* "+0 ms", "+37 ms": a line's offset in the log; '' for a line with no stamp. */
export function offsetText(line, format) {
  if (!line || line.offsetMs === null || line.offsetMs === undefined) return '';
  return `+${formatTime(line.offsetMs, format)}`;
}

/* --------------------------------------------------- Integration Procedure */

/* A step with its values: the facts of the block (see stepFacts) and the
 * input, options and output the run kept for it. */
function stepOf(root, name) {
  const block = debugBlockOf(root, name);
  return { ...stepFacts(root, name), share: 0, input: asValue(block.Input), options: asValue(block.Options), output: asValue(root[name]) };
}

/* A value an org may hand over as JSON text, read as the value; undefined
 * stays undefined so a part that is not there is not shown. */
const asValue = (value) => (value === undefined ? undefined : safeParse(value));

/* Each step's time over the longest step's (0 to 1), for the bar. */
function withShares(steps) {
  const longest = steps.reduce((most, step) => Math.max(most, step.elapsedMs || 0), 0);
  steps.forEach((step) => { step.share = longest > 0 && step.elapsedMs ? step.elapsedMs / longest : 0; });
  return steps;
}

/* The model of an Integration Procedure's run, from the run's output (the
 * parsed result of the remoting call):
 *   { ok, elapsedMs, cpuMs, steps: [{ name, type, status, elapsedMs, cpuMs,
 *     share, input, options, output }], response, originalInput, log }
 * `share` is the step's time over the longest step's (0 to 1), for the bar.
 * ok is false when a step did not succeed or the answer carries an error: the
 * same reading the call's row makes (debugRunFailure). */
export function ipDebugModel(output) {
  const root = ipRoot(output);
  return {
    ok: debugRunFailure('ip', output) === null,
    elapsedMs: timeOrNull(root.elapsedTimeActual),
    cpuMs: timeOrNull(root.elapsedTimeCPU),
    steps: withShares(ipStepNames(root).map((name) => stepOf(root, name))),
    response: asValue(root.response),
    originalInput: asValue(root.originalInput),
    log: parseDebugLog(root.debugLog)
  };
}

/* ------------------------------------------------------------ DataRaptor */

/* Whether a value holds anything: not null, '', 0, false, [] or {}, nor an
 * object whose every value is one of those. */
function hasContent(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === '') return false;
  if (Array.isArray(value)) return value.some(hasContent);
  if (isObject(value)) return Object.keys(value).some((key) => hasContent(value[key]));
  return true;
}

/* An object without its empty values (the others as they are). */
function withoutEmpty(value) {
  if (!isObject(value)) return value;
  const out = {};
  Object.keys(value).filter((key) => hasContent(value[key])).forEach((key) => {
    Object.defineProperty(out, key, { value: value[key], enumerable: true, writable: true, configurable: true });
  });
  return out;
}

/* { name: part } for the parts that hold something, so the view shows nothing
 * for an empty one. */
function nonEmptyParts(source, names) {
  const out = {};
  names.forEach((name) => { if (hasContent(source[name])) out[name] = withoutEmpty(source[name]); });
  return out;
}

/* The model of a DataRaptor's run:
 *   { ok, elapsedMs, cpuMs, responseType, interfaceInfo, output, errors,
 *     created, log }
 * errors holds the parts of errorsAsJson, errors and errorsByField that say
 * something (an errorsAsJson.DRError of null is no error), created the
 * created-object maps that hold something. */
export function drDebugModel(output) {
  const top = safeParse(output);
  const root = isObject(top) ? top : {};
  const errors = nonEmptyParts(root, ['errorsAsJson', 'errors', 'errorsByField']);
  return {
    ok: debugRunFailure('dr', output) === null,
    elapsedMs: timeOrNull(root.ActualTime),
    cpuMs: timeOrNull(root.CpuTime),
    responseType: typeof root.responseType === 'string' && root.responseType !== MASK_STRING ? root.responseType : '',
    interfaceInfo: isObject(root.interfaceInfo) ? root.interfaceInfo : {},
    output: root.returnResultsData,
    errors,
    created: nonEmptyParts(root, ['createdObjectsByOrder', 'createdObjectsByType']),
    log: parseDebugLog(root.debugLog)
  };
}

/* What a masked file has in the place of a log line's text. */
function placeholderLine(kind) {
  return `${{ query: 'Query', count: 'Query results found', time: 'Query time' }[kind] || 'Info'}: ${MASKED_TEXT}`;
}

/* The log of a call read back from a file, from the skeleton the file kept:
 * one line per skeleton line, with its kind and offset. The text is the
 * answer's own line at that place when the answer still has it (not a mask
 * placeholder), else a placeholder. */
function logFromSkeleton(skeleton, kept) {
  return skeleton.log.map((line, index) => {
    const own = kept[index] && kept[index].kind === line.kind && kept[index].text !== MASK_STRING ? kept[index] : null;
    return { at: own ? own.at : null, offsetMs: line.offsetMs, text: own ? own.text : placeholderLine(line.kind), kind: line.kind };
  });
}

/* A model with the facts the file's skeleton kept: the structure and times
 * the masked answer lost. The values (inputs, outputs, response) stay what the
 * answer has, placeholders and all. */
function withSkeletonIp(model, skeleton, output) {
  const root = ipRoot(output);
  const steps = skeleton.steps.map((facts) => ({ ...stepOf(root, facts.name), ...facts }));
  return {
    ...model,
    elapsedMs: skeleton.elapsedMs,
    cpuMs: skeleton.cpuMs,
    steps: withShares(steps),
    log: logFromSkeleton(skeleton, model.log)
  };
}

function withSkeletonDr(model, skeleton) {
  return {
    ...model,
    elapsedMs: skeleton.elapsedMs,
    cpuMs: skeleton.cpuMs,
    responseType: skeleton.responseType,
    interfaceType: skeleton.interfaceType,
    log: logFromSkeleton(skeleton, model.log)
  };
}

/* The model of a call that is a debug run, by its flavour; null for any other.
 * Its outcome is the call's own verdict (the row's), so the two cannot differ.
 * A call read back from a file whose row kept a skeleton takes its structure
 * and times from it. */
export function debugModelOf(entry) {
  if (!entry || (entry.debug !== 'ip' && entry.debug !== 'dr')) return null;
  const flavour = entry.debug;
  const model = flavour === 'dr' ? drDebugModel(entry.output) : ipDebugModel(entry.output);
  const skeleton = entry.loaded ? readSkeleton(entry.debugRun, flavour) : null;
  const read = !skeleton ? model : (flavour === 'dr' ? withSkeletonDr(model, skeleton) : withSkeletonIp(model, skeleton, entry.output));
  return { ...read, ok: !failed(entry) };
}

/* A step that did not run: a false flag on an element outside the sequence. */
export const isSkipped = (step) => /^skipped$/i.test((step && step.status) || '');

/* ------------------------------------------- statuses and types under Mask */

/* Whether a status is the ordinary good outcome. The tables say nothing for
 * it, since it is what nearly every row has; only the rest is worth a tag. */
export function isPlainSuccess(status) {
  return typeof status === 'string' && /^(success|succeeded)$/i.test(status.trim());
}

/* A step's status and type are free strings of the answer, so they leave the
 * panel under Mask values only when they are one of the short words every run
 * uses: the outcomes below and the names OmniStudio gives its element types.
 * Anything else (a message with a name or an Id in it) becomes the placeholder
 * the trees use. */
const KNOWN_WORDS = new Set([
  'success', 'succeeded', 'error', 'failed', 'failure', 'skipped', 'warning', 'not run', 'not executed',
  'dataraptor extract action', 'dataraptor transform action', 'dataraptor post action', 'dataraptor turbo action',
  'integration procedure action', 'remote action', 'http action', 'set values', 'conditional block', 'response action',
  'loop block', 'cache block', 'try catch block', 'matrix action', 'calculation action', 'email action', 'list action',
  'dynamic action'
]);

/* The word as it may leave the panel while Mask values is on: itself when it is
 * a known word (any case), '' for nothing, else the mask placeholder. */
export function knownWordOrMasked(text) {
  if (typeof text !== 'string') return text === undefined || text === null ? '' : MASK_STRING;
  const word = text.trim();
  if (word === '') return '';
  return KNOWN_WORDS.has(word.replace(/\s+/g, ' ').toLowerCase()) ? text : MASK_STRING;
}

/* A step with its status and type reduced to known words. */
export const stepWithKnownWords = (step) => ({ ...step, type: knownWordOrMasked(step.type), status: knownWordOrMasked(step.status) });

/* -------------------------------------------------------- what is said */

const stepsText = (count) => `${count} ${count === 1 ? 'step' : 'steps'}`;

export const NO_DEBUG_INFO = 'No debug information in the answer';

/* Whether the answer carried anything of a debug run: steps or times (an
 * Integration Procedure), times or a response type (a DataRaptor). */
export function hasDebugInfo(entry, model) {
  if (!model) return false;
  if (model.elapsedMs !== null || model.cpuMs !== null) return true;
  return entry.debug === 'dr' ? !!model.responseType : model.steps.length > 0;
}

/* The outcome the head starts with, from the call's verdict: 'Succeeded',
 * 'Failed', or null when the call did not fail and the answer holds no debug
 * information (then there is nothing to call a success). */
export function debugOutcome(entry, model) {
  if (!model) return null;
  if (!model.ok) return 'Failed';
  return hasDebugInfo(entry, model) ? 'Succeeded' : null;
}

/* The head line of the Debug tab as its facts: the outcome, the total time,
 * the CPU time, then for an Integration Procedure the steps and for a
 * DataRaptor the interface type (from the request's options) and the response
 * type; for an Integration Procedure then, when the log has queries, how many and the time they took. A time the answer did not carry is left out. An answer with no debug
 * information at all says so, after the outcome when the call failed. */
export function debugHeadParts(entry, model, format) {
  if (!model) return [];
  const outcome = debugOutcome(entry, model);
  if (!hasDebugInfo(entry, model)) return outcome ? [outcome, NO_DEBUG_INFO] : [NO_DEBUG_INFO];
  const parts = [outcome];
  if (model.elapsedMs !== null) parts.push(formatTime(model.elapsedMs, format));
  if (model.cpuMs !== null) parts.push(`CPU ${formatTime(model.cpuMs, format)}`);
  if (entry.debug === 'dr') {
    const options = entry.action && isObject(entry.action.options) ? entry.action.options : {};
    const kept = typeof model.interfaceType === 'string' ? model.interfaceType : options.interfaceType;
    if (typeof kept === 'string' && kept && kept !== MASK_STRING) parts.push(kept);
    if (model.responseType) parts.push(`response ${model.responseType}`);
  } else {
    const skipped = model.steps.filter(isSkipped).length;
    parts.push(stepsText(model.steps.length - skipped));
    if (skipped) parts.push(`${skipped} skipped`);
    const stats = logStats(model.log);
    if (stats.queries) parts.push(queriesText(stats.queries));
    if (stats.queries && stats.queryMs !== null) parts.push(`${formatTime(stats.queryMs, format)} in queries`);
  }
  return parts;
}

/* A log line's text as the Debug tab and its Copy show it. */
export const lineShown = (line, masked) => (masked ? maskLogLine(line.text) : line.text);

/* Longer logs than this start folded, with their count in the summary. */
export const LOG_FOLD_AT = 30;

/* The summary of the log fold: "Debug log (12 lines)". */
export function logSummary(count) {
  return `Debug log (${count} ${count === 1 ? 'line' : 'lines'})`;
}

/* What the log adds up to: how many lines, how many queries, the sum of the
 * "Query time: N" lines (null when the log has none, or only masked ones) and
 * the "Time in Server: N" line (null when absent; the last one if repeated).
 * Numbers only, so it is the same under Mask values. */
const TIME_NUMBER = /^(Query time|Time in Server)\b[:\s]*(-?\d+(?:\.\d+)?)\s*(?:ms)?\s*$/i;

export function logStats(lines) {
  const list = Array.isArray(lines) ? lines : [];
  let queryMs = null;
  let serverMs = null;
  list.forEach((line) => {
    const hit = line && line.kind === 'time' ? TIME_NUMBER.exec(String(line.text)) : null;
    if (!hit) return;
    const ms = Number(hit[2]);
    if (/^query/i.test(hit[1])) queryMs = (queryMs || 0) + ms; else serverMs = ms;
  });
  return { lines: list.length, queries: list.filter((line) => line && line.kind === 'query').length, queryMs, serverMs };
}

const queriesText = (count) => `${count} ${count === 1 ? 'query' : 'queries'}`;

/* "12 lines · 3 queries · 27 ms in queries · 410 ms in the server": the parts
 * that are known, for the line above the log. */
export function logStatsText(stats, format) {
  const parts = [`${stats.lines} ${stats.lines === 1 ? 'line' : 'lines'}`];
  if (stats.queries) parts.push(queriesText(stats.queries));
  if (stats.queries && stats.queryMs !== null) parts.push(`${formatTime(stats.queryMs, format)} in queries`);
  if (stats.serverMs !== null) parts.push(`${formatTime(stats.serverMs, format)} in the server`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------- copying */

function maskedLog(log) {
  return log.map((line) => ({ ...line, text: maskLogLine(line.text) }));
}

/* What Copy puts on the clipboard for the Debug tab: the model, as a plain
 * value to print as JSON. `mask` is the function that masks a value while
 * Mask values is on, undefined when it is off: JSON sections go through it, log
 * lines through maskLogLine; names, types, statuses and times stay. */
export function debugCopy(entry, model, mask) {
  if (!model) return undefined;
  if (!mask) return { flavour: entry.debug, ...model };
  if (entry.debug === 'dr') {
    return {
      flavour: 'dr',
      ...model,
      interfaceInfo: mask(model.interfaceInfo),
      output: mask(model.output),
      errors: mask(model.errors),
      created: mask(model.created),
      log: maskedLog(model.log)
    };
  }
  return {
    flavour: 'ip',
    ...model,
    steps: model.steps.map((step) => ({ ...stepWithKnownWords(step), input: mask(step.input), options: mask(step.options), output: mask(step.output) })),
    response: mask(model.response),
    originalInput: mask(model.originalInput),
    log: maskedLog(model.log)
  };
}

/* ------------------------------------------------------ open sections */

/* What the Debug tab has open for a call, kept apart from the list so a
 * redraw keeps it: the names of the steps that are open, the sections the user
 * opened or closed (by section; undefined until they decide), the state of
 * each JSON tree (by tree), the view the picker is on and the log chips that
 * are pressed. */
export function blankOpen() {
  return { steps: new Set(), sections: {}, trees: {}, view: 'overview', chips: new Set() };
}

/* Whether a section is open: the user's choice, else its default. */
export function sectionOpen(open, section, fallback) {
  return open.sections[section] === undefined ? fallback : open.sections[section];
}

/* The key a step's trees are kept under: by the step's place in the run, not
 * its name, because a name can appear twice in the sequence and the two rows
 * open on their own. */
export const stepKey = (index, part) => `step:${index}:${part}`;

/* The tone of a step's status: a failure is bad, a warning a warning (the run
 * went on, with a note), a step that did not run neutral (grey), anything else
 * good. */
export function statusTone(status) {
  if (/^skipped$/i.test(String(status).trim())) return 'neutral';
  if (isStepFailure(status)) return 'bad';
  return /warning/i.test(String(status)) ? 'warn' : 'good';
}

/* What a step's bar says in words, for a screen reader and the tooltip. */
export function shareLabel(step) {
  if (isSkipped(step)) return 'Skipped';
  if (!step || step.elapsedMs === null || step.elapsedMs === undefined) return 'Time not reported';
  return `${Math.round(Math.max(0, Math.min(1, step.share || 0)) * 100)}% of the slowest step`;
}

/* The tag tone of a step's type, so the steps read like the list: DataRaptor
 * and Data Mapper steps green, Integration Procedure steps blue, remote
 * actions violet, anything else neutral. */
export function stepTone(type) {
  const text = String(type || '');
  if (/data\s*raptor|data\s*mapper/i.test(text)) return 'dr';
  if (/integration\s*procedure/i.test(text)) return 'ip';
  if (/remote\s*action/i.test(text)) return 'ra';
  return 'neutral';
}

/* "1 step", "3 steps" for the steps table. */
export const stepCountText = stepsText;

/* The width of a step's bar, as a percentage with one decimal. */
export const barPercent = (share) => Math.round(Math.max(0, Math.min(1, share || 0)) * 1000) / 10;
