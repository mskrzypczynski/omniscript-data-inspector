'use strict';

/* Narrowing the help overlay by what the user types. An entry stays when every
 * word of the query appears (any order, any case) in its title or text; the
 * keyboard table is narrowed row by row.
 *
 * Pure: no DOM, no chrome.*. */

import { searchText } from './help-entry.js';
import { plainChips } from './chips.js';

export function queryWords(query) {
  return String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
}

/* True when every word is found in the title or the text. No words matches
 * everything. */
export function helpMatches(query, title, text) {
  const words = queryWords(query);
  if (!words.length) return true;
  const haystack = plainChips(`${title} ${text}`).toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/* A shortcut row is [keys, what it does]. */
function rowText([keys, text]) {
  return `${keys.join(' ')} ${text}`;
}

/* One entry [title, text | rows], narrowed: the entry itself when its title or
 * text matches, a table keeping only its matching rows, or null. A table whose
 * title alone matches (searching "keyboard") is kept whole. */
export function filterEntry(query, entry) {
  const [title, body] = entry;
  /* A layered entry is also found by its short line and by the details the
   * website page holds. */
  if (!Array.isArray(body)) return helpMatches(query, title, searchText(entry) || body) ? entry : null;
  if (helpMatches(query, title, '')) return entry;
  const rows = body.filter((row) => helpMatches(query, '', rowText(row)));
  return rows.length ? [title, rows] : null;
}

/* sections: [[heading, entries]]. Sections left with no entry are dropped. An
 * empty query returns the sections unchanged. */
export function filterSections(query, sections) {
  if (!queryWords(query).length) return sections;
  return sections
    .map(([heading, entries]) => [heading, entries.map((entry) => filterEntry(query, entry)).filter(Boolean)])
    .filter(([, entries]) => entries.length);
}

/* Help for one control: the entries whose title is exactly `title` (any case),
 * out of the first group of sections that has one. `groups` lists where to
 * look, most relevant first (the open tab's sections, the shared ones, then
 * the other tabs), each a list of [heading, entries]. Returns the matching
 * sections ([] when no group has the title). */
export function sectionsTitled(title, groups) {
  const wanted = String(title || '').trim().toLowerCase();
  if (!wanted) return [];
  for (const sections of groups) {
    const hits = sections
      .map(([heading, entries]) => [heading, entries.filter(([name]) => String(name).toLowerCase() === wanted)])
      .filter(([, entries]) => entries.length);
    if (hits.length) return hits;
  }
  return [];
}

/* The one item of a control's right-click menu. */
export function helpMenuLabel(title) {
  return `Help: ${String(title || '').trim()}`;
}
