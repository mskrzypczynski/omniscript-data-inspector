'use strict';

/* Reading calls back from a file: the rows Export writes, and the ones a
 * debug bundle carries (tabs.actions.entries, which are those rows plus an id,
 * or the older `calls`), turned into the records the list and the detail pane
 * draw. A loaded session is made of these.
 *
 * A row holds less than a live record did: no response size, no timings, no
 * raw text of an answer. What it does hold is enough to read the call, and to
 * show the same verdict the file had. Best effort, like the rest of the tab:
 * a row that is not an object is skipped, a missing field gives an empty one.
 *
 * Pure: no DOM, no chrome.*. */

import { KIND_LABEL, optionFlags, failureReason, kindOf, nameInfo, previewId, previewOfSignature, answerFlavour } from '../shared/actions-model.js';
import { knownDuration } from '../shared/actions-timing.js';
import { importedTest } from './test-calls.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* The rows of calls a bundle holds: the Calls tab's own dump, else
 * the `calls` of older bundles. */
export function bundleCallRows(bundle) {
  if (!isObject(bundle)) return [];
  const tab = isObject(bundle.tabs) ? bundle.tabs.actions : null;
  if (tab && Array.isArray(tab.entries) && tab.entries.length) return tab.entries;
  return Array.isArray(bundle.calls) ? bundle.calls : [];
}

/* "Bundle: bundle.json" (just "Bundle" without a name). */
export function sessionText(name) {
  return name ? `Bundle: ${name}` : 'Bundle';
}

const CODE_OF_LABEL = Object.fromEntries(Object.entries(KIND_LABEL).map(([code, text]) => [text, code]));
/* The labels a bundle saved by an earlier version carries for the same kinds. */
Object.assign(CODE_OF_LABEL, { 'Data mapper / DataRaptor': 'DR', 'Remote action': 'RA' });

function typeOf(row, action) {
  const text = String(row.type || '');
  if (CODE_OF_LABEL[text]) return CODE_OF_LABEL[text];
  if (KIND_LABEL[text]) return text; // already a code
  return kindOf(action);
}

/* Whether a row is a designer preview: it carries debug and its signature is
 * the designer's own class and method. An Integration Procedure that
 * answered with a debug run carries debug too, under its own signature. */
const isPreviewRow = (row) => (row.debug === 'ip' || row.debug === 'dr') && previewOfSignature(row.signature) === row.debug;

/* Whether a row's answer holds a debug run: a preview's, or an Integration
 * Procedure's that the file says is one (a masked answer may no longer show
 * it) or whose answer has that shape (a file from before rows said so). */
function debugOfRow(row, action, type) {
  if (action.debug) return action.debug;
  if (row.debug === 'ip' && type === 'IP') return 'ip';
  return answerFlavour(type, row.output);
}

/* The action behind a row: Export keeps its signature ("Class.method", "?"
 * for a missing half) and not the parts, so the parts are taken from it. */
function actionOf(row, type) {
  const signature = typeof row.signature === 'string' ? row.signature : '';
  const at = signature.lastIndexOf('.');
  const half = (text) => (text === '?' ? '' : text);
  const owner = at > 0 ? half(signature.slice(0, at)) : '';
  const member = at >= 0 ? half(signature.slice(at + 1)) : half(signature);
  const preview = isPreviewRow(row);
  const parts = type === 'APEX' || preview
    ? { apexClass: owner, apexMethod: at >= 0 ? member : '' }
    : { remoteClass: owner, remoteMethod: member };
  return {
    descriptor: '', apexClass: '', apexMethod: '', remoteClass: '', remoteMethod: '',
    ...parts,
    input: row.input,
    options: row.options,
    // A designer preview keeps what makes it one, so its Debug tab comes back.
    ...(preview ? { debug: row.debug } : {})
  };
}

/* The answer-wide problem a failure text names (the wording of
 * PROBLEM_TEXT in actions-model.js), so the detail pane says the same. */
function problemOf(row) {
  const text = typeof row.failure === 'string' ? row.failure : '';
  if (text === 'No response') return { problem: 'no-response', note: '' };
  if (text === 'Empty response body') return { problem: 'empty', note: '' };
  if (text === 'Response is not JSON') return { problem: 'not-json', note: '' };
  if (text === 'Session expired / client out of sync') return { problem: 'out-of-sync', note: '' };
  const system = /^Aura system error(?:: ([\s\S]*))?$/.exec(text);
  if (system) return { problem: 'system-error', note: system[1] || '' };
  return { problem: null, note: '' };
}

function flagsOf(row, action) {
  const found = optionFlags(action);
  if (found.length || !Array.isArray(row.options_flags)) return found;
  return row.options_flags.map((label) => ({ label: String(label), title: String(label) }));
}

function timeOf(value) {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? new Date(0) : time;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/* A Data Mapper's name read from its input is the user's data, and the file
 * does not say where its name came from: it came from the input when the
 * input holds that very name under a bundle key (a masked file holds the
 * masked name in both). Such a name goes through Mask values again. */
function nameFromInput(action, name) {
  const found = nameInfo(action);
  return found.from === 'input' && found.name === name;
}

function recordOf(row, id) {
  const type = typeOf(row, actionOf(row, 'RA'));
  const action = actionOf(row, type);
  const { problem, note } = problemOf(row);
  const httpStatus = numberOr(row.httpStatus, 0);
  const name = String(row.action || row.name || row.signature || 'unknown action');
  const record = {
    id,
    kind: 'file',
    url: typeof row.url === 'string' ? row.url : '',
    time: timeOf(row.time),
    duration: knownDuration(numberOr(row.durationMs, 0)),
    timings: null,
    requestId: row.requestId,
    batchSize: numberOr(row.batchSize, 1) || 1,
    httpStatus,
    size: undefined,
    // The file does not say. A call with a remote class or method is OmniStudio's; a bare Apex call may not be.
    omni: type !== 'APEX',
    type,
    flags: flagsOf(row, action),
    name,
    nameFrom: nameFromInput(action, name) ? 'input' : (action.debug === 'ip' && previewId(name) ? 'preview' : ''),
    signature: typeof row.signature === 'string' ? row.signature : '',
    action,
    state: typeof row.state === 'string' ? row.state : null,
    output: row.output,
    error: row.error === undefined ? null : row.error,
    responseProblem: problem || (row.httpStatus === 0 ? 'no-response' : null),
    responseNote: note,
    rawResponse: undefined
  };
  const debug = debugOfRow(row, action, type);
  if (debug) {
    record.debug = debug;
    // The structure and times the file kept for its Debug tab (a masked file has no readable ones in the answer).
    if (isObject(row.debugRun)) record.debugRun = row.debugRun;
  }
  if (typeof row.chainId === 'string' && row.chainId) record.chainId = row.chainId;
  const test = importedTest(row);
  if (test) record.test = test;
  /* The file's own verdict is kept (see failureReason): its text for a failure
   * the rules cannot find again. A file without one is judged by the rules. */
  if (typeof row.failed === 'boolean') {
    record.loaded = { failed: row.failed, text: typeof row.failure === 'string' ? row.failure : '' };
  }
  record.failure = failureReason(record);
  return record;
}

/* The records for a file's rows, in the order the calls started. Ids are the
 * ones the rows carry (a bundle's dump has them), else the next free number. */
export function recordsFromExport(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(isObject);
  const taken = new Set(list.map((row) => row.id).filter((id) => Number.isInteger(id)));
  const used = new Set();
  let next = 1;
  const records = list.map((row) => {
    let id = Number.isInteger(row.id) && !used.has(row.id) ? row.id : null;
    if (id === null) {
      while (taken.has(next) || used.has(next)) next += 1;
      id = next;
    }
    used.add(id);
    return recordOf(row, id);
  });
  // A stable sort: calls of one request keep their order.
  return records.sort((a, b) => a.time.getTime() - b.time.getTime());
}
