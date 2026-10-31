'use strict';

/* The Data tab's status bar as plain data, so the wording can be tested
 * without a DOM. Pure: the caller formats the clock time and draws the pieces.
 *
 * snapshot: {
 *   host: { label, key? } | null, prop (the property read; in the tooltip), shown (scripts listed), nested (nested hosts that are
 *   whole scripts, hidden), elementHosts (other components of a listed script, hidden), note (a line for the tooltip),
 *   truncated, rawLength, scanError,
 *   visible, stale, live, lastUpdateText, changedCount, changeInfo { updated, rowsAdded, rowsRemoved, truncated },
 *   view, hasData, rawLines, rawMatches, filter, query { text, matches, capped } | null, unsafeNumbers, rawExact,
 *   session?: the file name while a debug bundle is loaded, else null
 * }
 * Returns { left: [{ text, bold? }], right: string, rightParts: [{ text, quiet? }], title: string }.
 * The line reads "<Type/SubType/Language> · 7.2 KB · Live · changed 10:43:31 AM": the script's key in bold (the
 * element's tag name stands in without one), then its size on the left; the state and the clock on the
 * right. What it leaves out (the tag, the property, how many scripts were found and how many hosts are
 * hidden) is in `title`, for the tooltip.
 * A quiet part (the clock time) changes without meaning anything, so the
 * screen-reader mirror skips it; right is the same parts as one string. */

import { formatBytes } from '../shared/targets-model.js';
import { CHANGE_LIMIT } from './changes.js';

export function statusText(snapshot) {
  const rightParts = rightSegments(snapshot);
  return { left: leftSegments(snapshot), right: rightParts.map((part) => part.text).join(''), rightParts, title: titleText(snapshot) };
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/* The tooltip: the facts the line itself does not carry. Nothing while there
 * is no script, or while a file is loaded (its own bar says so). */
function titleText(s) {
  if (!s.host || typeof s.session === 'string') return s.note || '';
  const lines = [`Element ${s.host.label}${s.prop ? `, property ${s.prop}` : ''}.`];
  lines.push(`${plural(s.shown || 0, 'OmniScript', 'OmniScripts')} listed.`);
  if (s.nested) lines.push(`${plural(s.nested, 'embedded script', 'embedded scripts')} hidden (to list them, show the Frame row in Settings, Data, Reading another page, and tick Embedded scripts).`);
  if (s.elementHosts) lines.push(`${plural(s.elementHosts, 'other component', 'other components')} of a listed script hidden.`);
  if (s.truncated) lines.push('The list was cut at its limit.');
  if (s.note) lines.push(s.note);
  return lines.join('\n');
}

function leftSegments(s) {
  if (!s.host) {
    if (s.scanError) return [{ text: 'Read failed' }];
    /* The script is gone but its last payload is still on screen. */
    return s.stale && s.rawLength
      ? [{ text: 'Nothing found on this page · showing the last data read (' + formatBytes(s.rawLength) + ')' }]
      : [{ text: 'Nothing found on this page' }];
  }

  /* A loaded file: one script, read from the bundle. */
  if (typeof s.session === 'string') {
    return [
      { text: 'Bundle', bold: true },
      { text: (s.session ? `: ${s.session}` : '') + ' · ' + s.host.label + ' · ' + formatBytes(s.rawLength || 0) }
    ];
  }

  const segments = [
    { text: s.host.key || s.host.label, bold: true },
    { text: ' · ' + formatBytes(s.rawLength || 0) }
  ];
  if (s.nested) segments.push({ text: ` · ${plural(s.nested, 'embedded script', 'embedded scripts')} hidden` });
  if (s.truncated) segments.push({ text: ' · list truncated' });
  return segments;
}

/* "1 value updated", "3 rows added". */
const counted = (count, noun, what) => `${count} ${noun}${count === 1 ? '' : 's'} ${what}`;

/* "3 values updated · 1 row added · 2 rows removed (first 800)". The count of
 * marks alone (changedCount) is used when no breakdown is given. */
function changeSegments(s) {
  const info = s.changeInfo;
  if (!info) return s.changedCount ? counted(s.changedCount, 'value', 'updated') : '';
  const parts = [];
  if (info.updated) parts.push(counted(info.updated, 'value', 'updated'));
  if (info.rowsAdded) parts.push(counted(info.rowsAdded, 'row', 'added'));
  if (info.rowsRemoved) parts.push(counted(info.rowsRemoved, 'row', 'removed'));
  if (!parts.length) return '';
  return parts.join(' · ') + (info.truncated ? ` (first ${CHANGE_LIMIT})` : '');
}

/* The state of the reading: never "Live" while there is nothing to read. */
function readingState(s) {
  if (typeof s.session === 'string') return 'Read-only';
  if (!s.visible) return 'Idle (panel hidden)';
  if (s.stale) return 'Stale (OmniScript gone)';
  if (!s.host) return s.live ? 'Waiting for an OmniScript' : 'Manual mode · nothing to read yet';
  return s.live ? 'Live' : 'Manual mode · press Refresh to update';
}

/* "3 matches": what a $ query in the filter box found (tree view only); the
 * query itself is in the filter box. The count is "5,000+" when the query
 * stopped at its limit. */
function queryText(s) {
  if (s.view !== 'tree' || !s.query) return '';
  const { matches, capped } = s.query;
  const count = capped ? `${matches.toLocaleString('en-US')}+` : matches.toLocaleString('en-US');
  return `${count} match${matches === 1 && !capped ? '' : 'es'}`;
}

function rightSegments(s) {
  const parts = [{ text: readingState(s) }];
  const loaded = typeof s.session === 'string';
  const add = (text, quiet = false) => parts.push(quiet ? { text, quiet } : { text });
  if (s.lastUpdateText && !loaded) add(` · changed ${s.lastUpdateText}`, true);
  const changes = changeSegments(s);
  if (changes) add(` · ${changes}`);
  if (s.view === 'raw' && s.hasData) {
    add(` · ${s.rawLines} lines`);
    if (String(s.filter || '').trim()) add(` · ${s.rawMatches} match${s.rawMatches === 1 ? '' : 'es'}`);
  }
  const query = queryText(s);
  if (query) add(` · ${query}`);
  /* A parse rounds integers above 2^53; the page's own digits are what Raw,
   * Copy JSON and Save file show. */
  if (s.unsafeNumbers) {
    add(s.rawExact ? ' · data has numbers above 2^53; Raw view is exact'
      : ' · data has numbers above 2^53; they may be rounded here');
  }
  return parts;
}
