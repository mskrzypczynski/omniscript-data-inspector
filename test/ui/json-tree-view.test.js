'use strict';

/* Integration test for the collapsible JSON tree: given the decisions
 * src/core/json-tree-model.js already makes (covered by its own tests), does
 * renderJsonTree actually draw the rows, respect expanded/filter state, and
 * flash a changed value? */

import { renderJsonTree, copyValueOf } from '../../src/ui/json-tree-view.js';

function keysIn(container) {
  return [...container.querySelectorAll('.k')].map((el) => el.textContent);
}

describe('renderJsonTree', () => {
  it('renders the root and its top-level keys when the root path is expanded', () => {
    const container = document.createElement('div');
    const result = renderJsonTree(container, 'root', { a: 1, b: 2 }, { expanded: new Set(['']) });

    expect(result.matched).toBe(true);
    expect(keysIn(container)).toEqual(['root', 'a', 'b']);
  });

  it('leaves a container collapsed unless its own path is in the expanded set', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { a: { nested: 1 } }, { expanded: new Set(['']) });

    // "a" is rendered (its parent, the root, is expanded) but stays collapsed
    // itself, so "nested" never appears.
    expect(keysIn(container)).toEqual(['root', 'a']);
  });

  it('reveals a nested key once its parent path is also expanded', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { a: { nested: 1 } }, { expanded: new Set(['', 'a']) });

    expect(keysIn(container)).toEqual(['root', 'a', 'nested']);
  });

  it('filters to only the rows that match, ignoring the expanded set', () => {
    const container = document.createElement('div');
    const result = renderJsonTree(container, 'root', { name: 'Ada', age: 30 }, { filter: 'ada' });

    expect(result.matched).toBe(true);
    expect(keysIn(container)).toContain('name');
    expect(keysIn(container)).not.toContain('age');
  });

  it('reports no match rather than rendering an empty tree', () => {
    const container = document.createElement('div');
    const result = renderJsonTree(container, 'root', { name: 'Ada' }, { filter: 'zzz' });

    expect(result.matched).toBe(false);
    expect(container.children).toHaveLength(0);
  });

  it('flashes the row for a path in the changed set', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { a: 1, b: 2 }, { expanded: new Set(['']), changed: new Set(['a']) });

    const rows = [...container.querySelectorAll('.row')];
    const rowFor = (key) => rows.find((row) => row.querySelector('.k')?.textContent === key);

    expect(rowFor('a').classList.contains('is-changed')).toBe(true);
    expect(rowFor('b').classList.contains('is-changed')).toBe(false);
  });
});

describe('row copy button', () => {
  it('adds one copy button to every row', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { a: 1 }, { expanded: new Set(['']) });
    const rows = [...container.querySelectorAll('.row')].filter((row) => row.querySelector('.k'));
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.querySelectorAll('.row-copy')).toHaveLength(1));
  });
});

describe('copyValueOf', () => {
  it('copies values as JSON', () => {
    expect(copyValueOf('a "b"')).toBe('"a \\"b\\""');
    expect(copyValueOf(42)).toBe('42');
    expect(copyValueOf(null)).toBe('null');
    expect(copyValueOf(false)).toBe('false');
    expect(copyValueOf({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}');
  });
});
