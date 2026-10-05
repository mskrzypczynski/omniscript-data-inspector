'use strict';

/* Comparing two JSON values: a flat list of what differs, by path. Used for
 * "compare two calls" and for comparing two payload snapshots.
 *
 * Pure: no DOM, no chrome.*. */

const isObject = (value) => value !== null && typeof value === 'object';

/* ['StepA', 'Rows', 2, 'Code'] -> StepA.Rows[2].Code */
export function formatPath(parts) {
  if (!parts.length) return '(root)';
  return parts.reduce((text, part) => {
    if (typeof part === 'number') return `${text}[${part}]`;
    return text ? `${text}.${part}` : String(part);
  }, '');
}

/* Differences between a and b as { path, kind, before, after }, kind being
 * 'added', 'removed' or 'changed'. A branch present on one side only is one
 * entry, not one per leaf. Stops at `limit` entries; `truncated` says so. */
export function diffValues(a, b, limit = 500) {
  const changes = [];
  let truncated = false;

  function add(entry) {
    if (changes.length >= limit) { truncated = true; return; }
    changes.push(entry);
  }

  function walk(x, y, path, depth) {
    if (truncated) return;
    if (!isObject(x) || !isObject(y) || Array.isArray(x) !== Array.isArray(y) || depth > 60) {
      if (!isObject(x) && !isObject(y) && x === y) return;
      if (isObject(x) && isObject(y) && depth > 60) return;
      add({ path: formatPath(path), kind: 'changed', before: x, after: y });
      return;
    }

    const keys = Array.isArray(x)
      ? Array.from({ length: Math.max(x.length, y.length) }, (_, i) => i)
      : [...new Set([...Object.keys(x), ...Object.keys(y)])];

    keys.forEach((key) => {
      const inX = Array.isArray(x) ? key < x.length : Object.prototype.hasOwnProperty.call(x, key);
      const inY = Array.isArray(y) ? key < y.length : Object.prototype.hasOwnProperty.call(y, key);
      if (inX && !inY) add({ path: formatPath(path.concat(key)), kind: 'removed', before: x[key], after: undefined });
      else if (!inX && inY) add({ path: formatPath(path.concat(key)), kind: 'added', before: undefined, after: y[key] });
      else walk(x[key], y[key], path.concat(key), depth + 1);
    });
  }

  walk(a, b, [], 0);
  return { changes, truncated };
}
