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

describe('copying a selection', () => {
  function copyAll(value, expanded) {
    const container = document.createElement('div');
    container.className = 'viewport';
    document.body.appendChild(container);
    renderJsonTree(container, 'root', value, { expanded: new Set(expanded) });

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    container.firstChild.dispatchEvent(event);
    container.remove();
    return copied;
  }

  it('copies JSON-shaped lines with commas between siblings', () => {
    const text = copyAll({ a: 1, b: 'x', c: { d: null } }, ['', 'c']);
    expect(text).toBe(['{', '  "a": 1,', '  "b": "x",', '  "c": {', '    "d": null', '  }', '}'].join('\n'));
  });
});

describe('copying long values', () => {
  function copyTree(expandedText) {
    const container = document.createElement('div');
    container.className = 'viewport';
    document.body.appendChild(container);
    const long = 'x'.repeat(700);
    renderJsonTree(container, 'root', { a: long, b: 1 }, {
      expanded: new Set(['']),
      expandedText: new Set(expandedText)
    });
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    container.firstChild.dispatchEvent(event);
    const hadToggle = container.querySelector('.v-more') !== null;
    container.remove();
    return { copied, hadToggle };
  }

  it('leaves out the show all toggle and copies the whole value', () => {
    const { copied, hadToggle } = copyTree([]);
    expect(hadToggle).toBe(true);
    expect(copied).not.toMatch(/show (all|less)/);
    expect(copied).toContain(`"a": "${'x'.repeat(700)}"`);
  });

  it('leaves out the show less toggle when the value is expanded', () => {
    const { copied, hadToggle } = copyTree(['a']);
    expect(hadToggle).toBe(true);
    expect(copied).not.toMatch(/show (all|less)/);
    expect(copied).toContain(`"a": "${'x'.repeat(700)}"`);
  });
});

describe('marks, focus and the changed-only view', () => {
  const SEP = '\u0001';
  const data = { a: { x: 1, y: 2 }, b: 3 };
  const rowFor = (container, key) =>
    [...container.querySelectorAll('.row')].find((row) => row.querySelector('.k')?.textContent === key);

  it('keeps a touched row marked and records each row\'s path', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', data, { expanded: new Set(['', 'a']), touched: new Set(['a' + SEP + 'y']) });

    expect(rowFor(container, 'y').classList.contains('is-touched')).toBe(true);
    expect(rowFor(container, 'x').classList.contains('is-touched')).toBe(false);
    expect(rowFor(container, 'y').dataset.path).toBe('a' + SEP + 'y');
  });

  it('outlines the focused row', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', data, { expanded: new Set(['']), focus: 'b' });
    expect(rowFor(container, 'b').classList.contains('is-focus')).toBe(true);
    expect(rowFor(container, 'a').classList.contains('is-focus')).toBe(false);
  });

  it('shows only the paths it is given, opened', () => {
    const container = document.createElement('div');
    const only = new Set(['', 'a', 'a' + SEP + 'y']);
    const result = renderJsonTree(container, 'root', data, { only });

    expect(result.matched).toBe(true);
    expect([...container.querySelectorAll('.k')].map((k) => k.textContent)).toEqual(['root', 'a', 'y']);
  });

  it('intersects the changed-only view with a text filter', () => {
    const container = document.createElement('div');
    const only = new Set(['', 'a', 'a' + SEP + 'y']);
    const result = renderJsonTree(container, 'root', data, { only, filter: 'zzz' });
    expect(result.matched).toBe(false);
  });
});

describe('row buttons', () => {
  it('runs the copy transform, e.g. masking, before copying', () => {
    const container = document.createElement('div');
    const written = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
    });
    renderJsonTree(container, 'root', { name: 'Ada' }, {
      expanded: new Set(['']), transform: () => 'MASKED'
    });
    const row = [...container.querySelectorAll('.row')].find((r) => r.querySelector('.k')?.textContent === 'name');
    row.querySelector('.row-copy').click();
    expect(written).toEqual(['"MASKED"']);
  });

  it('adds an in structure button only when a jump handler is given, and passes the path', () => {
    const plain = document.createElement('div');
    renderJsonTree(plain, 'root', { a: 1 }, { expanded: new Set(['']) });
    expect(plain.querySelectorAll('.row-copy')).toHaveLength(2);

    const jumped = [];
    const wired = document.createElement('div');
    renderJsonTree(wired, 'root', { a: 1 }, { expanded: new Set(['']), onJump: (path) => jumped.push(path) });
    const row = [...wired.querySelectorAll('.row')].find((r) => r.querySelector('.k')?.textContent === 'a');
    const buttons = row.querySelectorAll('.row-copy');
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(jumped).toEqual(['a']);
  });
});

describe('large payloads', () => {
  const big = { items: Array.from({ length: 6000 }, (_, i) => ({ n: i })) };

  it('draws everything for a small tree', () => {
    const container = document.createElement('div');
    const result = renderJsonTree(container, 'root', { a: 1, b: 2 }, { expanded: new Set(['']) });
    expect(result.windowed).toBe(false);
    expect(container.querySelectorAll('.row')).toHaveLength(result.rows);
  });

  it('windows a tree past maxRows instead of cutting it off', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const SEP = '\u0001';
    const expanded = new Set(['', 'items']);
    for (let i = 0; i < 6000; i++) expanded.add(`items${SEP}${i}`);

    const result = renderJsonTree(container, 'root', big, { expanded });

    expect(result.windowed).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.rows).toBeGreaterThan(6000 * 3); // item open + n + closing brace each
    expect(container.querySelectorAll('.row').length).toBeLessThan(500);
    expect(result.scrollTo(`items${SEP}5000`)).toBe(true);
    expect(result.scrollTo('missing')).toBe(false);
    container.remove();
  });
});

describe('right click and watch buttons', () => {
  it('passes a context-menu request with the row\'s path and value', () => {
    const container = document.createElement('div');
    const seen = [];
    renderJsonTree(container, 'root', { a: 1 }, { expanded: new Set(['']), onContext: (ev, info) => seen.push(info) });
    const row = [...container.querySelectorAll('.row')].find((r) => r.querySelector('.k')?.textContent === 'a');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    row.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(seen).toEqual([{ path: 'a', value: 1, keyText: 'a', container: false }]);
  });

  it('labels the watch button by whether the path is already watched', () => {
    const container = document.createElement('div');
    const pinned = [];
    renderJsonTree(container, 'root', { a: 1, b: 2 }, {
      expanded: new Set(['']), pinned: new Set(['a']), onPin: (path) => pinned.push(path)
    });
    const labelFor = (key) => [...container.querySelectorAll('.row')]
      .find((r) => r.querySelector('.k')?.textContent === key).querySelectorAll('.row-copy')[1];
    expect(labelFor('a').textContent).toBe('unwatch');
    expect(labelFor('b').textContent).toBe('watch');
    labelFor('b').click();
    expect(pinned).toEqual(['b']);
  });
});

describe('line numbers', () => {
  it('numbers the rows through a counter sized for the widest number', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { a: 1, b: 2 }, { expanded: new Set(['']) });
    expect(container.classList.contains('numbered')).toBe(true);
    expect(container.style.getPropertyValue('--gutter')).toContain('1ch'); // 4 rows
  });

  it('starts a window at its own row number', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const expanded = new Set(['', 'items']);
    renderJsonTree(container, 'root', { items: Array.from({ length: 6000 }, (_, i) => i) }, { expanded });
    expect(container.style.getPropertyValue('--gutter')).toContain('4ch');
    expect(container.querySelector('.vwin div:nth-child(2)').style.counterReset).toBe('line 0');
    container.remove();
  });
});

describe('previous value on marked rows', () => {
  const rowFor = (container, key) =>
    [...container.querySelectorAll('.row')].find((row) => row.querySelector('.k')?.textContent === key);

  it('says what a marked value was, in the tooltip', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { name: 'Bob', other: 1 }, {
      expanded: new Set(['']), touched: new Set(['name']), before: new Map([['name', 'Ada']])
    });
    expect(rowFor(container, 'name').title).toBe('Was: "Ada"');
    expect(rowFor(container, 'name').querySelector('.v').title).toContain('Was: "Ada"');
    expect(rowFor(container, 'other').title).toBe('');
  });

  it('says not set for a value that was added, and trims a long old value', async () => {
    const { describeBefore } = await import('../../src/ui/json-tree-view.js');
    expect(describeBefore(undefined)).toBe('not set');
    expect(describeBefore({ a: 1 })).toBe('{"a":1}');
    expect(describeBefore('x'.repeat(500)).length).toBeLessThan(310);
  });
});

describe('copying a selection with Mask values on', () => {
  it('copies placeholders for strings and numbers, but not the real values', async () => {
    const { Mask } = await import('../../src/ui/mask-setting.js');
    const box = document.createElement('input');
    box.type = 'checkbox';
    Mask.mount(box);
    box.checked = true;
    box.dispatchEvent(new Event('change'));

    const container = document.createElement('div');
    container.className = 'viewport';
    document.body.appendChild(container);
    renderJsonTree(container, 'root', { name: 'Ada', age: 30, ok: true, blank: '' }, { expanded: new Set(['']) });

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    container.firstChild.dispatchEvent(event);

    expect(copied).toContain('"name": "<string>"');
    expect(copied).toContain('"age": "<number>"');
    expect(copied).toContain('"ok": true');
    expect(copied).toContain('"blank": ""');
    expect(copied).not.toContain('Ada');

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    container.remove();
  });
});

describe('in structure button per row', () => {
  it('appears only on rows jumpLabel accepts, with its tooltip', () => {
    const container = document.createElement('div');
    renderJsonTree(container, 'root', { owned: 1, loose: 2 }, {
      expanded: new Set(['']), onJump: () => {},
      jumpLabel: (path) => (path === 'owned' ? 'Select Owned in the Structure tab' : null)
    });
    const buttons = (key) => [...container.querySelectorAll('.row')]
      .find((r) => r.querySelector('.k')?.textContent === key).querySelectorAll('.row-copy');
    expect(buttons('owned')[1].title).toBe('Select Owned in the Structure tab');
    expect(buttons('loose')).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('copies a marked long string without its Was tooltip', () => {
    const long = 'x'.repeat(700);
    const container = document.createElement('div');
    container.className = 'viewport';
    document.body.appendChild(container);
    renderJsonTree(container, 'root', { s: long }, {
      expanded: new Set(['']), touched: new Set(['s']), before: new Map([['s', 'old']])
    });
    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let copied = null;
    const event = new Event('copy', { bubbles: true, cancelable: true });
    event.clipboardData = { setData: (type, text) => { copied = text; } };
    container.firstChild.dispatchEvent(event);
    expect(copied).toContain(long);
    expect(copied).not.toContain('Was');
    container.remove();
  });

  it('removes the scroll listener of a windowed tree when the next draw is not windowed', () => {
    const scroller = document.createElement('div');
    scroller.className = 'viewport';
    document.body.appendChild(scroller);
    const SEP = '\u0001';
    const expanded = new Set(['', 'items']);
    for (let i = 0; i < 6000; i++) expanded.add(`items${SEP}${i}`);
    renderJsonTree(scroller, 'root', { items: Array.from({ length: 6000 }, (_, i) => ({ n: i })) }, { expanded });
    expect(typeof scroller.__vwinCleanup).toBe('function');

    scroller.textContent = '';
    renderJsonTree(scroller, 'root', { a: 1 }, { expanded: new Set(['']) });
    expect(scroller.__vwinCleanup).toBeUndefined();
    scroller.remove();
  });
});
