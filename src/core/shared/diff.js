'use strict';

/* Comparing two JSON values: a flat list of what differs, by path. Used for
 * "compare two calls" and for comparing two payload snapshots.
 *
 * Pure: no DOM, no chrome.*. */

import { walkDiff } from './diff-walk.js';

/* A path the way OmniScript writes it: keys joined by colons, a repeat's
 * position after its key as |N counting from 1 (the tree and the JSON itself
 * count from 0; the OmniScript does not).
 * ['StepA', 'Rows', 1, 'Code'] -> StepA:Rows|2:Code. A position with no key
 * before it (the payload is an array) is written on its own: |2. */
export function formatPath(parts) {
  if (!parts.length) return '(root)';
  return parts.reduce((text, part, at) => {
    if (typeof part === 'number') return `${text}|${part + 1}`;
    return at ? `${text}:${part}` : String(part);
  }, '');
}

/* Differences between a and b as { path, kind, before, after }, kind being
 * 'added', 'removed' or 'changed' for values and keys, and 'row-added' or
 * 'row-removed' for a whole row of an array (rows are lined up first, see
 * diff-walk.js, so removing one row of three hundred is one entry). A row
 * entry also carries `index` and, when the rows were matched by an Id/Name
 * style key, `identity` such as "Id=7". A branch present on one side only is
 * one entry, not one per leaf. Stops at `limit` entries; `truncated` says so. */
export function diffValues(a, b, limit = 500) {
  const changes = [];
  let truncated = false;

  walkDiff(a, b, (entry) => {
    if (changes.length >= limit) { truncated = true; return true; }
    const change = { path: formatPath(entry.parts), kind: entry.kind, before: entry.before, after: entry.after };
    if (entry.index !== undefined) change.index = entry.index;
    if (entry.identity !== undefined) change.identity = entry.identity;
    changes.push(change);
    return false;
  });

  return { changes, truncated };
}

/* An identity such as "Id=7" holds a value of the payload: through `mask` it
 * becomes "Id=<string>" (or <number>) like any other value that leaves the
 * panel. */
export function maskIdentity(identity, mask = (value) => value) {
  if (identity === undefined) return undefined;
  const at = identity.indexOf('=');
  if (at < 0) return identity;
  const masked = mask(identity.slice(at + 1));
  return `${identity.slice(0, at + 1)}${typeof masked === 'string' ? masked : identity.slice(at + 1)}`;
}

/* A change with every value in it passed through `mask`: before, after and the
 * row identity. Paths hold keys only and are left as they are. */
export function maskChange(change, mask = (value) => value) {
  const out = { ...change, before: mask(change.before), after: mask(change.after) };
  if (change.identity !== undefined) out.identity = maskIdentity(change.identity, mask);
  return out;
}

/* How much two texts share at both ends: { prefix, suffix } counted in
 * characters, never overlapping, and never splitting a surrogate pair. What is
 * left in the middle of each is what differs. Used to highlight the changed
 * part of a long value. */
export function commonAffix(a, b) {
  const max = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  if (prefix > 0 && isHighSurrogate(a.charCodeAt(prefix - 1))) prefix--;
  let suffix = 0;
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  if (suffix > 0 && isLowSurrogate(a.charCodeAt(a.length - suffix))) suffix--;
  return { prefix, suffix };
}

const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF;
const isLowSurrogate = (code) => code >= 0xDC00 && code <= 0xDFFF;

/* The part of a long text to show while it is folded: at most `limit`
 * characters from the start, moved along when the differing span
 * [start, end) would otherwise be cut off, so the highlight is always in
 * view. { from, to } are offsets into the text. */
export function excerpt(length, start, end, limit = 160, lead = 30) {
  if (length <= limit) return { from: 0, to: length };
  if (end <= limit - 10) return { from: 0, to: limit };
  const from = Math.max(0, Math.min(start - lead, length - limit));
  return { from, to: Math.min(length, from + limit) };
}
