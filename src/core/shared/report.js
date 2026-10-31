'use strict';

/* The short report "Copy report" puts on the clipboard: a few Markdown lines to
 * paste into a ticket or a chat, saying which script this is, where it stands
 * and what looks wrong. It holds names and counts; the only text that can
 * quote org data is a failed call's reason, and that goes through `mask`.
 *
 * Pure: no DOM, no chrome.*. */

import { failed, failureReason, maskedName } from './actions-model.js';
import { formatBytes } from './targets-model.js';
import { clockText } from './change-log.js';

export const REPORT_FAILED_CALLS = 5;

const oneLine = (text) => String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();

/* A name as code, so a pipe, an underscore or a bracket in it stays literal. */
function code(text) {
  const clean = oneLine(text).replace(/`/g, "'");
  return clean ? `\`${clean}\`` : '';
}

const timeOf = (time) => {
  const date = time instanceof Date ? time : new Date(time);
  return Number.isNaN(date.getTime()) ? '' : clockText(date);
};

/* The script's name: a key string, or { key, label }. */
function scriptName(script) {
  if (!script) return '';
  if (typeof script === 'string') return script;
  return script.key || script.label || '';
}

function stepName(step) {
  if (!step) return '';
  return typeof step === 'string' ? step : step.name || '';
}

function stopperLines(stoppers) {
  if (!Array.isArray(stoppers)) return [];
  const lines = ['', '## May stop Next'];
  if (!stoppers.length) {
    lines.push('Nothing found that may stop Next (judged from the definition and the data now; best effort).');
    return lines;
  }
  /* Only `reason` goes out: it holds the definition's own words. What a message
   * formula comes to against the data (`shownReason`) is for the panel alone. */
  stoppers.forEach((item) => {
    const reason = oneLine(item.reason);
    lines.push(`- ${code(item.name) || 'An element'}${reason ? `: ${reason}` : ''}`);
  });
  return lines;
}

/* The newest `limit` failed calls, newest first. `mask` is applied to every
 * value a reason quotes, as everywhere else a call leaves the panel. */
function failedCallLines(calls, mask, limit, onlyOmni) {
  if (!Array.isArray(calls)) return [];
  const bad = calls.filter((call) => failed(call) && (!onlyOmni || call.omni !== false)).slice(-limit).reverse();
  const lines = ['', `## Failed calls${bad.length ? ` (last ${bad.length})` : ''}`];
  if (!bad.length) {
    lines.push('No failed calls captured.');
    return lines;
  }
  bad.forEach((call) => {
    const when = timeOf(call.time);
    const why = oneLine(failureReason(call, true, mask));
    // A call the panel sent says so: it is not the page's own.
    const tag = call.test ? ' (test call)' : '';
    lines.push(`- ${when ? `${when} ` : ''}${code(maskedName(call, mask)) || 'A call'}${tag}${why ? ` — ${why}` : ''}`);
  });
  return lines;
}

/* input: { script, step, stoppers, failedCalls, payloadBytes, problems, version }
 *  - script: the Type/SubType/Language key, or { key, label };
 *  - step: the step the script is on ({ name } or the name), or null;
 *  - stoppers: the "May stop Next" items [{ name, reason }] of that step, or
 *    null when they are not known (an empty list means none were found);
 *  - failedCalls: the captured call records; the failed ones are listed;
 *  - onlyOmni: list only OmniStudio's calls (true unless given as false), the
 *    way the Calls list does by default, so a busy page's other Apex
 *    errors do not crowd out the script's own;
 *  - payloadBytes: the size of the payload as read, or null;
 *  - problems: the number of Problems Structure counts, or null when unknown;
 *  - version: the extension's version.
 * `mask` turns a value into the value that may be shown (identity by default).
 * A line whose fact is not known is left out. Returns Markdown text. */
export function buildReport(input = {}, mask = (value) => value) {
  const { script, step, stoppers, failedCalls, payloadBytes, problems, version, onlyOmni = true } = input;
  const lines = ['# OmniScript report', ''];

  const name = scriptName(script);
  lines.push(`- Script: ${code(name) || 'not found'}`);
  const stepText = stepName(step);
  if (stepText) lines.push(`- Current step: ${code(stepText)}`);
  if (Number.isFinite(payloadBytes)) lines.push(`- Data JSON: ${formatBytes(payloadBytes)}`);
  if (Number.isInteger(problems)) lines.push(`- Problems: ${problems ? problems : 'none'}`);
  if (version) lines.push(`- OmniScript Data Inspector ${oneLine(version)}`);

  lines.push(...stopperLines(stoppers));
  lines.push(...failedCallLines(failedCalls, mask, REPORT_FAILED_CALLS, onlyOmni !== false));
  return `${lines.join('\n')}\n`;
}
