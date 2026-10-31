'use strict';

/* The Free wording of a help entry. The text written in the entry is the
 * text with every gate open; where a sentence names a feature the Free build does not carry, the
 * module lists the edits that make the Free text, keyed by entry title:
 *   { Title: [gate, [[from, to], ...]] }
 * and the help reads them when it opens (so the load order of the modules
 * never matters). An edit whose `from` is not in the text throws, so a reword
 * of the full text cannot silently leave a gated sentence in Free. */

import { Features } from '../features.js';

export function applyEdits(text, edits) {
  return edits.reduce((out, [from, to]) => {
    const found = typeof from === 'string' ? out.includes(from) : from.test(out);
    if (!found) throw new Error(`Free help wording does not match the text: ${String(from).slice(0, 70)}`);
    return out.replace(from, () => to);
  }, text);
}

/* The edits of a layered entry ([title, text, { short, keys, more }]): each
 * one changes whichever part holds its `from` (the text, the short line or the
 * details), and throws only when no part does. */
function applyEditsToParts(text, extra, edits) {
  const parts = { text, short: extra.short || '', more: extra.more || '' };
  edits.forEach(([from, to]) => {
    const has = (value) => (typeof from === 'string' ? value.includes(from) : from.test(value));
    const key = ['text', 'short', 'more'].find((name) => has(parts[name]));
    if (!key) throw new Error(`Free help wording does not match the text: ${String(from).slice(0, 70)}`);
    parts[key] = parts[key].replace(from, () => to);
  });
  const next = { ...extra };
  if (extra.short !== undefined) next.short = parts.short;
  if (extra.more !== undefined) next.more = parts.more;
  return [parts.text, next];
}

/* An entry as this build shows it: unchanged where the gate is open. A
 * layered entry keeps its third element. */
export function wordedFor(wording, entry) {
  const [title, text, extra] = entry;
  const edit = wording[title];
  if (!edit || Features.has(edit[0])) return entry;
  if (extra && typeof extra === 'object') {
    const [nextText, nextExtra] = applyEditsToParts(text, extra, edit[1]);
    return [title, nextText, nextExtra];
  }
  return [title, applyEdits(text, edit[1])];
}
