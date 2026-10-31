'use strict';

/* The sticky parent path of a long tree: while the rows scroll, the open
 * branches the first visible row sits inside stay pinned at the top, outermost
 * first, so you always see where you are. Which rows those are is decided
 * here; pinning them is the view's job.
 *
 * Pure: no DOM, no chrome.*. */

export const STICKY_MAX = 3;

/* rows: the tree's row descriptors in order ({ path, depth, closing, ... },
 * closing rows being the `}` / `]` lines). topIndex: the row at the top of the
 * view. Returns up to `max` ancestors of that row, outermost first, nearest
 * last; the root (depth 0) is never pinned, since it would be there for every
 * row. A closing brace is inside the branch it closes, so that branch counts. */
export function stickyAncestors(rows, topIndex, max = STICKY_MAX) {
  if (!Array.isArray(rows) || !Number.isInteger(topIndex) || topIndex < 0 || topIndex >= rows.length) return [];
  const top = rows[topIndex];
  let depth = top.closing ? top.depth + 1 : top.depth;
  const found = [];
  for (let i = topIndex - 1; i >= 0 && depth > 1; i--) {
    const row = rows[i];
    if (row.closing || row.depth >= depth) continue;
    found.push(row);
    depth = row.depth;
  }
  return found.reverse().slice(-max);
}
