'use strict';

/* One help entry at three depths, from one source:
 *
 *   [title, text, { short, keys, more }]
 *
 *   short  what the control does, in at most SHORT_WORDS words. It is the
 *          control's tooltip and the entry's one line in the help, so the two
 *          can never say different things.
 *   keys   its shortcut, if it has one ("Ctrl/Cmd+Shift+L"); the tooltip ends
 *          with it in brackets.
 *   text   how to use it, in at most TEXT_WORDS words, opened in the help.
 *   more   the details (edge cases, limits, why): on the website's reference
 *          page, linked from the entry, never drawn in the panel.
 *
 * An entry without the third element is an older one, written as one text: it
 * is drawn as before and has no generated tooltip.
 *
 * Pure: no DOM, no chrome.*. */

import { wordCount } from './help-text.js';

export const SHORT_WORDS = 15;
export const TEXT_WORDS = 60;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/* The parts of an entry, with '' for what it does not have. `layered` says the
 * entry has a short line of its own, so the help draws it at three depths. */
export function entryParts(entry) {
  const [title, body, extra] = Array.isArray(entry) ? entry : [];
  const more = extra && typeof extra === 'object' ? extra : {};
  const short = clean(more.short);
  return {
    title: clean(title),
    text: typeof body === 'string' ? body.trim() : '',
    short,
    keys: clean(more.keys),
    more: clean(more.more),
    layered: !!short
  };
}

/* The tooltip of a control whose entry has a short line: the line, then the
 * shortcut in brackets. '' when the entry has none, so the control keeps the
 * title it was written with. */
export function tooltipOf(entry) {
  const { short, keys } = entryParts(entry);
  if (!short) return '';
  /* "Narrow the tree (/)", not "Narrow the tree. (/)". */
  return keys ? `${short.replace(/\.$/, '')} (${keys})` : short;
}

/* What an entry breaks of the limits, as sentences for a test to print.
 * An older entry, without a short line, is not judged. */
export function limitProblems(entry) {
  const parts = entryParts(entry);
  if (!parts.layered) return [];
  const problems = [];
  const shortWords = wordCount(parts.short);
  const textWords = wordCount(parts.text);
  if (shortWords > SHORT_WORDS) problems.push(`${parts.title}: short has ${shortWords} words (at most ${SHORT_WORDS})`);
  if (textWords > TEXT_WORDS) problems.push(`${parts.title}: text has ${textWords} words (at most ${TEXT_WORDS})`);
  if (parts.text.includes(parts.short) && parts.text.length - parts.short.length < 3) {
    problems.push(`${parts.title}: text only repeats short`);
  }
  return problems;
}

/* The words a help search looks in: the title, the text and the details, so a
 * word that only the website page explains still finds its entry. */
export function searchText(entry) {
  const { text, short, more } = entryParts(entry);
  return [short, text, more].filter(Boolean).join(' ');
}

/* The website's reference page, drawn from these same entries by
 * scripts/docs.mjs, and its task guides. */
export const REFERENCE_URL = 'https://mskrzypczynski.github.io/omniscript-data-inspector/reference.html';
export const GUIDES_URL = 'https://mskrzypczynski.github.io/omniscript-data-inspector/guides/';

/* A stable, readable id for a title: lowercase words joined by hyphens. The
 * reference page uses the same ids, so a link lands on the entry. */
export function slugify(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `entry-${fnv1a(String(title))}`;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/* The address of an entry on the reference page: `tab` is the help it is in
 * (data, structure, actions, or common for the shared one). */
export function referenceLink(tab, title) {
  const group = tab === 'common' ? 'everywhere' : tab;
  return `${REFERENCE_URL}#${group}-${slugify(title)}`;
}

/* The address of a task guide (docs/guides/<name>.md). */
export function guideLink(name) {
  return `${GUIDES_URL}${name}.html`;
}
