'use strict';

/* The Form view of the Current value tab of a step or block: the same data as the
 * tree, laid out the way the page's form is. Each key under the element is a
 * label (the label of the element that owns the key, else the key) with its
 * value in a read-only field; an object or a list is "n items" that opens inline
 * to show what it holds, and what is nested is indented.
 *
 * Pure: no DOM, no chrome.*. */

import { isContainer, entriesOf } from '../shared/json-tree-model.js';

/* Rows past this many are not drawn, so a huge list cannot freeze the pane. */
export const MAX_FORM_ROWS = 400;

export const VIEWS = ['form', 'tree', 'raw'];
export const VIEW_LABELS = { tree: 'Tree', form: 'Form', raw: 'Raw' };
export const VIEW_TITLES = {
  tree: 'The value as a tree: every key with its type, the same lines as in Data',
  form: 'The value as the page\'s form: a label and a read-only field for each key, lists open in place',
  raw: 'The value as JSON text, each line numbered like the tree'
};

const SECTION = new Set(['step', 'block']);

/* Does the Current value tab of the element offer Tree | Form | Raw: a step or a block
 * whose value holds keys or rows. */
export function hasFormView(element, value) {
  return !!element && !!element.category && SECTION.has(element.category.key) && isContainer(value);
}

/* The view to draw: what was picked, else the tree. */
export const viewOf = (picked) => (VIEWS.includes(picked) ? picked : 'form');

const countText = (count) => `${count} ${count === 1 ? 'item' : 'items'}`;

/* The word a scalar is written as in its field: a boolean as true or false, nothing for null. */
function scalarText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

const kindOfScalar = (value) => {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'boolean') return 'bool';
  return typeof value === 'number' ? 'number' : 'text';
};

/* The row of a list that carries an Id of its own is known by it, not by its position: a row
 * that leaves the list must not hand its open state to the one that moves up. A list whose Ids
 * repeat, or that has rows without one, falls back to positions. Map: key -> segment. */
function idSegments(entries) {
  const ids = entries.map(([, child]) => {
    const id = child && typeof child === 'object' && !Array.isArray(child) ? child.Id : undefined;
    return (typeof id === 'string' && id !== '') || typeof id === 'number' ? `#${id}` : null;
  });
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  return new Map(entries.map(([key], index) => [key, ids[index]]));
}

/* The rows of the form, in order, as
 *   { id, depth, key, label, name, title, kind, text, count, canOpen, open }
 *   id     — where the row is: the keys down to it joined by "\u001f", for open / closed state
 *            (a list row that carries an Id is known by "#" and its Id, not its position)
 *   name   — the element's name, shown after the label when the label is the element's own
 *            (a key with no label of its own, and a list's row, have '')
 *   kind   — 'text' | 'number' | 'bool' | 'empty' | 'group' (an object or a list)
 *   text   — what the field shows (for a group, "n items")
 *   title  — the key, and the type of the element that owns it
 * `elements` is every element of the script; `isOpen(id)` says whether a group is open.
 * The result is { rows, truncated } with `truncated` the number of rows left out. */
export function formRows(element, value, elements, isOpen = () => false) {
  const rows = [];
  const byOwner = new Map(); // parent key -> { name -> element }
  const childrenOf = (parentKey) => {
    if (!byOwner.has(parentKey)) {
      const names = new Map();
      elements.forEach((candidate) => {
        if (candidate.parentKey === parentKey && !names.has(candidate.name)) names.set(candidate.name, candidate);
      });
      byOwner.set(parentKey, names);
    }
    return byOwner.get(parentKey);
  };

  let left = 0;
  const add = (row) => {
    if (rows.length >= MAX_FORM_ROWS) { left += 1; return false; }
    rows.push(row);
    return true;
  };

  /* `scope` is the element whose children the keys of this level are named after, or null. */
  function walk(object, scope, depth, path) {
    const isList = Array.isArray(object);
    const entries = entriesOf(object);
    const byId = isList ? idSegments(entries) : null;
    entries.forEach(([key, child]) => {
      const owner = !isList && scope ? childrenOf(scope.key).get(key) || null : null;
      const rowScope = isList ? scope : owner;
      const segment = byId && byId.has(key) ? byId.get(key) : key;
      const id = path.concat(segment).join('\u001f');
      let label = key;
      if (isList) label = `${scope && scope.category && scope.category.key === 'block' ? 'Row' : 'Item'} ${Number(key) + 1}`;
      else if (owner && owner.label) label = owner.label;
      // The page shows the label; the name is what the definition, the data and the Designer call it.
      const name = owner && owner.label && owner.label !== key ? key : '';
      const title = owner ? `${key} · ${owner.type}` : (isList ? `Position ${Number(key) + 1}` : key);

      if (!isContainer(child)) {
        add({ id, depth, key, label, name, title, kind: kindOfScalar(child), text: scalarText(child), count: 0, canOpen: false, open: false });
        return;
      }
      const count = entriesOf(child).length;
      const open = count > 0 && !!isOpen(id);
      if (!add({ id, depth, key, label, name, title, kind: 'group', text: countText(count), count, canOpen: count > 0, open })) return;
      if (open) walk(child, rowScope, depth + 1, path.concat(segment));
    });
  }

  /* The element's own value is the first level: its keys, or a block's rows. */
  walk(value, element, 0, []);
  return { rows, truncated: left };
}

/* The rows of formRows() whose label or key contains `needle` (case does not matter; an empty
 * needle keeps every row). The filter reads the rows that are drawn, so it follows the groups
 * that are open. The result is formRows()'s shape plus
 *   total    — how many rows there were before the filter
 *   filtered — whether a filter was applied */
export function filterFormRows(result, needle) {
  const text = String(needle || '').trim().toLowerCase();
  const total = result.rows.length;
  if (!text) return { ...result, total, filtered: false };
  const rows = result.rows.filter((row) => row.label.toLowerCase().includes(text) || String(row.key).toLowerCase().includes(text));
  return { rows, truncated: result.truncated, total, filtered: true };
}
