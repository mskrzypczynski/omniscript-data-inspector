'use strict';

/* Fuzzy matching for the property picker: the query's characters must appear
 * in order, not necessarily together ("jsd" finds jsonDataStr). No DOM. */

/* Higher is better; null when the query is not a subsequence of the name. */
export function fuzzyScore(name, query) {
  const text = name.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, '');
  if (!needle) return 0;

  let score = 0;
  let from = 0;
  let previous = -2;

  for (const ch of needle) {
    const at = text.indexOf(ch, from);
    if (at === -1) return null;

    score += 1;
    if (at === previous + 1) score += 4; // consecutive run
    const wordStart = at === 0 || /[^a-z0-9]/.test(text[at - 1]) || (name[at] !== name[at].toLowerCase() && name[at - 1] === name[at - 1].toLowerCase());
    if (wordStart) score += 3;
    if (at === 0) score += 3;

    previous = at;
    from = at + 1;
  }

  if (text.includes(needle)) score += 6; // contiguous match beats a scattered one
  return score - text.length * 0.01; // shorter names first on a tie
}

/* Items are { name, ... }. Empty query keeps the original order. */
export function fuzzyFilter(items, query) {
  if (!query || !query.trim()) return items.slice();
  return items
    .map((item) => ({ item, score: fuzzyScore(item.name, query) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
