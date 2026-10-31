'use strict';

/* What the Calls detail pane shows and copies, decided apart from
 * the DOM: the body of each tab, how a comparison is built and introduced,
 * what a copy may contain while Mask values is on, and the sentences for
 * the cases where there is nothing to show.
 *
 * Pure: no DOM, no chrome.*. */

import { diffValues, maskChange } from '../shared/diff.js';
import { CHANGE_WINDOW_MS, STALE_BEFORE_MS } from '../shared/actions-changes.js';
import { KIND_LABEL, failed } from '../shared/actions-model.js';
import { formatBytes, tookWithBatch } from '../shared/actions-timing.js';
import { formatTime } from '../shared/time-format.js';
import { deltaText } from './debug-compare.js';

/* The two tabs that show a list of differences instead of a JSON tree. */
export const DIFF_TABS = ['compare', 'changes'];

/* Input, options and output of the baseline against the selected call. */
export function compareSections(entry, baseline) {
  return [
    ['Input', baseline.action.input, entry.action.input],
    ['Options', baseline.action.options, entry.action.options],
    ['Output', baseline.output, entry.output]
  ].map(([title, before, after]) => ({ title, ...diffValues(before, after) }));
}

/* The value a tab shows. ctx: { compare, changes } — the comparison sections
 * (or null without a baseline), dataChangesForCall's answer and the model of a
 * debug run, all worked out once by the caller. undefined means there is nothing to show. */
export function tabBody(entry, tab, ctx = {}) {
  if (tab === 'debug') return ctx.debug || undefined; // the Debug tab is drawn from the run's model
  if (tab === 'compare') return ctx.compare || undefined;
  if (tab === 'changes') {
    const found = ctx.changes;
    return found && found.status === 'ok'
      ? [{ title: 'Changes', changes: found.changes, truncated: found.truncated }]
      : undefined;
  }
  if (tab === 'hops') return undefined; // a chain's list of hops is drawn from the chain, not a value
  if (tab === 'output') return entry.output;
  if (tab === 'options') return entry.action.options;
  return entry.action.input; // 'input' is the default and only remaining tab
}

/* A difference with its values (and the row identity, which is a value too)
 * passed through `mask`; its path and kind stay as they are. */
export { maskChange };

/* What Copy puts on the clipboard for a tab: the body, masked. */
export function copyBody(body, tab, mask) {
  if (!DIFF_TABS.includes(tab) || !Array.isArray(body)) return mask(body);
  return body.map((section) => ({ ...section, changes: section.changes.map((change) => maskChange(change, mask)) }));
}

/* Said above a section whose value came as plain text (or a bare number or
 * flag), which has no tree to open. */
export const TEXT_SECTION_NOTICE = 'This section is text, not JSON.';

const UNREADABLE = ['not-json', 'system-error', 'out-of-sync'];

/* What to say where a section has no value. { raw } carries text to show as it
 * came (an answer that could not be decoded); { text } is a sentence. The raw
 * text cannot be masked, so it is withheld while Mask values is on. */
export function sectionNotice(entry, tab, masked = false) {
  if (tab === 'output') {
    if (entry.responseProblem === 'no-response') return { text: 'No response came back for this call.' };
    if (entry.responseProblem === 'empty') {
      return { text: 'The response body was empty, or DevTools no longer held it when the panel asked.' };
    }
    if (UNREADABLE.includes(entry.responseProblem) && entry.rawResponse) {
      return masked
        ? { text: 'The raw response is hidden while Mask values is on.' }
        : { raw: entry.rawResponse };
    }
  }
  return { text: 'Nothing captured for this section.' };
}

const CHANGES_HINTS = {
  'no-history': 'No payload has been read yet, so there is nothing to compare. The panel reads the payload only while DevTools shows it.',
  'no-after': `No payload change was read within ${CHANGE_WINDOW_MS / 1000} s after this call.`,
  'not-polling': 'The panel was not reading the data JSON when this call finished (it reads only while DevTools shows it).',
  'no-before': 'No payload read from before this call is kept (the panel keeps only the most recent reads), so what the payload looked like going in is not known.',
  unreadable: 'One of the two payload reads is not valid JSON, so they cannot be compared.'
};

export function changesHint(found) {
  return CHANGES_HINTS[found.status] || '';
}

/* "7 s", "2 min 5 s" */
function ago(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/* The two titles above the Changes comparison, one short line each: when the
 * payload was read and how far from the end of the call. */
export function changesTitles(found, clock) {
  return {
    before: `Before: ${clock(found.before.time)} (${ago(found.beforeAgeMs)} before the call ended)`,
    after: `After: ${clock(found.after.time)} (${(found.gapMs / 1000).toFixed(1)} s after)`
  };
}

/* A muted caution, only while the "before" read is old: { text, title }, else
 * null. The title holds the full explanation. */
export function changesCaution(found) {
  if (!found.staleBefore) return null;
  return {
    text: 'May include earlier changes',
    title: `The first payload was read ${ago(found.beforeAgeMs)} before the call ended (more than ${STALE_BEFORE_MS / 1000} s), ` +
      'so part of the change may have happened before the call.'
  };
}

const BASELINE_WORDS = {
  previous: 'the previous call to the same place',
  success: 'the last successful call to the same place',
  picked: 'the call you picked',
  original: 'the call this one was sent again from'
};

/* The one line above a comparison: "Before 10:42:20 (410 ms) → After
 * 10:42:40 (470 ms) · +60 ms". The delta (after minus before) is there only
 * when both calls have a duration. */
export function compareIntro(entry, baseline, clock, format) {
  const took = (call) => (call.duration ? ` (${formatTime(call.duration, format)})` : '');
  const both = baseline.duration && entry.duration;
  const delta = both ? ` · ${deltaText(entry.duration - baseline.duration, format)}` : '';
  return `Before ${clock(baseline.time)}${took(baseline)} → After ${clock(entry.time)}${took(entry)}${delta}`;
}

/* The tooltip of that line: how the baseline was picked, and what the delta is. */
export function compareIntroTitle(how) {
  return `Baseline: ${BASELINE_WORDS[how] || BASELINE_WORDS.picked}. A delta is after minus before.`;
}

/* The comparison sections ({ title, changes, truncated }) split for drawing:
 * `differing` are the titles with something to show and `same` is one line for
 * all the others ("Input, options and response are identical"), '' when none
 * is identical. */
export function compareSplit(sections) {
  const same = sections.filter((section) => !section.changes.length && !section.truncated).map((section) => section.title);
  const differing = sections.filter((section) => section.changes.length || section.truncated).map((section) => section.title);
  if (!same.length) return { differing, same: '' };
  const words = same.map((title, at) => (at ? title.toLowerCase() : title));
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
  const verb = same.length > 1 || /s$/.test(same[0]) ? 'are' : 'is';
  return { differing, same: `${list} ${verb} identical` };
}

/* What the meta line says in the place of Aura's own state. Aura reports
 * SUCCESS whenever Apex ran, even when the answer carries an error, so its
 * word is never shown here: the line says Succeeded or Failed, as the Result
 * does. The raw state is in the Raw view. */
export function stateText(entry) {
  if (failed(entry)) return entry.responseProblem === 'no-response' ? 'No response' : 'Failed';
  return entry.state ? 'Succeeded' : 'state unknown';
}

/* The tab a call opens on: Debug for a debug run, whatever tab was picked on
 * other calls (a picked Input or Output is about the call it was picked on,
 * and Remember my settings keeps it for the calls that have no Debug tab);
 * otherwise, when the user has not chosen one, Output for a call that failed
 * (that is where the reason is) and Input for the rest. A tab the user picked,
 * or Compare / Data changes, which only the user starts, is kept on a call
 * that is not a debug run. `debugTab` is false in a build without the Debug
 * tab: a debug run is then a call like any other, so a tab picked by hand stays. */
export function defaultDetailTab(entry, current, picked, { debugTab = true } = {}) {
  const plain = current === 'input' || current === 'output' || current === 'options' || current === 'debug';
  const hasDebug = debugTab && !!entry.debug;
  if (hasDebug && plain) return 'debug';
  // The Debug tab exists for a debug run only (and only where the build has it); elsewhere the tab to fall back on is Input.
  const gone = current === 'debug' && !hasDebug;
  if ((picked && !gone) || (current !== 'input' && current !== 'output' && current !== 'debug')) return current;
  return failed(entry) ? 'output' : 'input';
}

/* The pieces of the line under the call's name: kind, signature, time,
 * duration, HTTP, state, response size and the step it was made on. They are
 * kept apart so the pane can stop a line break inside one of them. */
export function metaParts(entry, { clock, step, format }) {
  const bits = [KIND_LABEL[entry.type]];
  if (entry.signature !== entry.name) bits.push(entry.signature);
  bits.push(clock(entry.time));
  const took = tookWithBatch(entry, format);
  if (took) bits.push(took);
  bits.push(`HTTP ${entry.httpStatus || '?'}`, stateText(entry));
  const size = formatBytes(entry.size);
  if (size) bits.push(size);
  if (step) bits.push(`step ${step.name || step.key}`);
  return bits;
}

export function metaLine(entry, ctx) {
  return metaParts(entry, ctx).join(' · ');
}

/* The tooltip of a row's Result: the verdict, the reason (or that none was
 * found), then the HTTP status and the Aura state, which describe the
 * transport. A call that failed because of its HTTP status already says
 * "HTTP 500" as its reason, so the status line is not said again. */
export function resultTitle(entry, verdictText, why) {
  const lines = [verdictText, why || 'No error found in the response'];
  const http = `HTTP ${entry.httpStatus || 'unknown'}`;
  const said = typeof why === 'string' && why.split('\n').some((line) => line.trim() === http);
  if (!said) lines.push(http);
  if (entry.state) lines.push(`Aura state: ${entry.state}`);
  return lines.join('\n');
}

/* The comparisons a call's detail head offers, in the order of the buttons:
 * with the previous call to the same place (d), with the last one that did not
 * fail (Shift+D) and, for a re-run, with the call it was sent again from. Each
 * is { how, label, title, target }; `how` is what the comparison is called in
 * the pane. One choice is a button of its own; two or more fold into one
 * Compare menu, so the head stays one row of buttons. */
export function compareChoices({ earlier = null, lastSuccess = null, original = null } = {}) {
  const choices = [];
  if (earlier) {
    choices.push({
      how: 'previous', label: 'Compare with previous', target: earlier,
      title: 'Compare this call with the previous call to the same place: what changed in the input, options and output (d)'
    });
  }
  if (lastSuccess && lastSuccess !== earlier) {
    choices.push({
      how: 'success', label: 'Compare with last success', target: lastSuccess,
      title: 'Compare this call with the last earlier call to the same place that did not fail (Shift+D)'
    });
  }
  if (original) {
    choices.push({
      how: 'original', label: 'Compare with original', target: original,
      title: 'Compare this re-run with the call it was sent again from: what changed in the input, options and output'
    });
  }
  return choices;
}

/* The tooltip of the one Compare menu button that stands for several. */
export const COMPARE_MENU_TITLE = 'Compare this call with another: the previous call to the same place, the last one that did not fail, or the call it was re-run from';
