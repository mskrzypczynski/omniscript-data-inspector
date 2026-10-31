'use strict';

/* Long help entries are shown folded: the first sentence, then a "more"
 * toggle for the rest. This decides where the fold goes. Searching the help
 * still looks at the whole text (help-filter.js), so a word in the folded part
 * finds its entry.
 *
 * Pure: no DOM, no chrome.*. */

import { endsInsideMark } from './chips.js';

/* An entry of more words than this is folded. */
export const COLLAPSE_WORDS = 40;

export function wordCount(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/* A full stop after one of these does not end a sentence ("e.g. US"). */
const ABBREVIATIONS = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|approx)\.$/i;

/* A first sentence shorter than this ("In Settings.") says too little to
 * stand for the entry: the next sentence is taken with it. */
const MIN_HEAD_WORDS = 6;

/* Where the first sentence ends: just past a . ! or ? that is followed by
 * white space and then something that starts a sentence (not a lowercase
 * letter), and that is not an abbreviation. -1 when there is none. */
function firstSentenceEnd(text) {
  const boundary = /[.!?](?=\s+[^\s\p{Ll}])/gu;
  let found = boundary.exec(text);
  while (found) {
    const end = found.index + 1;
    const head = text.slice(0, end);
    if (wordCount(head) >= MIN_HEAD_WORDS && !ABBREVIATIONS.test(head)) return end;
    found = boundary.exec(text);
  }
  return -1;
}

/* { head, rest } for one entry's text: rest is '' when the entry is short
 * enough to show whole. A long entry shows its first sentence; one with no
 * sentence end inside the limit is cut at the limit instead (head ends with …). */
export function foldHelp(text, limit = COLLAPSE_WORDS) {
  const whole = String(text);
  if (wordCount(whole) <= limit) return { head: whole, rest: '' };

  const end = firstSentenceEnd(whole);
  if (end > 0 && wordCount(whole.slice(0, end)) <= limit) {
    return { head: whole.slice(0, end), rest: whole.slice(end).trim() };
  }

  const words = whole.trim().split(/(\s+)/);
  let kept = '';
  let count = 0;
  let at = 0;
  /* Never cut inside a [[control name]]: it is taken whole. */
  while (at < words.length && (count < limit || endsInsideMark(kept))) {
    kept += words[at];
    if (words[at].trim()) count++;
    at++;
  }
  return { head: `${kept.trimEnd()}…`, rest: words.slice(at).join('').trim() };
}
