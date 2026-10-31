'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* A step's row stays pinned under the column header while its rows scroll. The
 * pinning itself is CSS, which jsdom does not lay out: this checks what the
 * stylesheet needs from the script (the header height, the row markers) and
 * that the stylesheet keeps the two sticky layers in order. */

import { readFileSync } from 'node:fs';
import { bootStructure, definition } from '../support/structure-page.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

const steps = () => [
  { name: 'Intro', elements: [{ name: 'A' }, { name: 'B' }] },
  { name: 'Details', elements: [{ name: 'C' }] }
];

const rule = (selector) => {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
};
const zIndex = (body) => Number((/z-index:\s*(\d+)/.exec(body) || [])[1]);

describe('step header pinned in the list', () => {
  it('marks the rows that stick: steps (top-level containers) and nothing deeper', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    const sticky = [...document.querySelectorAll('#struct-list .el-row[data-depth="0"][data-container="1"]')];
    expect(sticky.map((row) => row.querySelector('.el-name').textContent)).toEqual(['Intro (Intro)', 'Details (Details)']);
    expect(document.querySelectorAll('#struct-list .el-row[data-depth="1"][data-container="1"]')).toHaveLength(0);
  });

  it('tells the stylesheet how tall the column header is', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 23 });
    try {
      await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
      expect(document.getElementById('struct-list').style.getPropertyValue('--struct-head-h')).toBe('23px');
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original);
      else delete HTMLElement.prototype.offsetHeight;
    }
  });

  it('leaves the height alone while the list is not laid out', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    expect(document.getElementById('struct-list').style.getPropertyValue('--struct-head-h')).toBe('');
  });

  it('keeps the step row below the column header and above the rows', () => {
    const head = rule('\n.list-head {');
    const step = rule('#struct-list .el-row[data-depth="0"][data-container="1"] {');
    expect(head).toMatch(/position:\s*sticky/);
    expect(head).toMatch(/top:\s*0/);
    expect(step).toMatch(/position:\s*sticky/);
    expect(step).toMatch(/top:\s*var\(--struct-head-h/);
    expect(zIndex(step)).toBeGreaterThan(0);
    expect(zIndex(step)).toBeLessThan(zIndex(head));
  });

  it('gives the pinned row an opaque background unless selected or hovered', () => {
    expect(css).toMatch(/\[data-container="1"\]:not\(\.is-selected\):not\(:hover\)\s*\{\s*background:\s*var\(--bg\)/);
  });
});
