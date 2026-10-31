'use strict';

/* The option tags of a call row (chainable, no cache, repeat ×2, stopped early)
 * live in one cell at the right of the row, as wide as its tags up to a limit,
 * so the name takes the rest and the cells after it start at the same x.
 * What fits is decided here: the first tag always shows, further ones while
 * their words stay within a budget, and the rest become one "+N" whose tooltip
 * names them. The row draws two such sets, a wide one and a two-tag one, and
 * the stylesheet picks by width.
 *
 * Pure: no DOM, no chrome.*. */

/* Characters of tag text the wide cell holds (a chain's own row carries
 * "chain · 10 calls" and "stopped early" together, with room to spare). */
export const WIDE_TAG_CHARS = 32;

/* How much a tag matters when there is not room for all of them: a chain that
 * stopped early first, then the chain's own count, then the ×N of a request
 * that several calls share (without it their time looks like each one's own),
 * then a repeat, then the options. A tag that is cut becomes part of "+N", so
 * the order decides which ones people lose. */
function tagRank(tag) {
  const label = String(tag && tag.label);
  if (label === 'stopped early') return 0;
  if (/^chain · /.test(label)) return 1;
  if (/^×\d+$/.test(label)) return 2;
  if (label === 'test') return 2;
  // A test call's answer that was cut says so as long as there is room for one more word.
  if (label === 'answer cut at 2 MB') return 2;
  if (/^re-run( of |$)/.test(label)) return 3;
  if (/^repeat ×/.test(label)) return 3;
  return 4;
}

/* tags: [{ label, title }]. Returns { shown: tags, more: how many are left
 * out, moreTitle: their titles, one per line }. The tags are taken in the
 * order of tagRank (ties keep their order). */
export function fitTags(tags, { maxChars = WIDE_TAG_CHARS, maxTags = Infinity } = {}) {
  const list = (Array.isArray(tags) ? tags : [])
    .map((tag, at) => ({ tag, at, rank: tagRank(tag) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((item) => item.tag);
  const shown = [];
  let chars = 0;
  for (const tag of list) {
    const length = String(tag.label).length;
    if (shown.length >= maxTags) break;
    if (shown.length && chars + length > maxChars) break;
    shown.push(tag);
    chars += length;
  }
  const rest = list.slice(shown.length);
  return { shown, more: rest.length, moreTitle: rest.map((tag) => tag.title || tag.label).join('\n') };
}

/* What a row with no room for the tag column (a list under 560 px) says
 * after its time instead: "×5" for a request that five calls share, so those
 * rows do not read as five calls that each took this long. '' when there is
 * nothing to add. */
export function tookTail(tags) {
  const found = (Array.isArray(tags) ? tags : []).find((tag) => /^×\d+$/.test(String(tag && tag.label)));
  return found ? found.label : '';
}

/* Every tag of a row as one tooltip: "chain: Chainable — ...". Empty at none. */
export function tagsTitle(tags) {
  return (Array.isArray(tags) ? tags : []).map((tag) => `${tag.label}: ${tag.title || tag.label}`).join('\n');
}
