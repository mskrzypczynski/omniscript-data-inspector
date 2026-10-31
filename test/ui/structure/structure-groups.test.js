'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* Elements under one step or block read as a group: depth and parent on every
 * row, a tint under the selected section, a mark while its header is hovered. */

import { readFileSync } from 'node:fs';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [
  { name: 'Intro', elements: [
    { name: 'Kind' },
    { name: 'Box', type: 'Block', elements: [{ name: 'Inner' }, { name: 'Other' }] },
    { name: 'Tail' }
  ] },
  { name: 'Final', elements: [{ name: 'Done' }] }
];

const rows = () => [...document.querySelectorAll('#struct-list .el-row[data-depth]')];
const rowOf = (name) => rows().find((row) => row.querySelector('.el-name').textContent.startsWith(name));
const marked = (className) => rows().filter((row) => row.classList.contains(className))
  .map((row) => row.querySelector('.el-name').textContent);
const hover = (row) => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

beforeEach(async () => {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
});

describe('element groups in the list', () => {
  it('puts the depth and the parent on every row, and --depth for the indent guides', () => {
    expect(rows().map((row) => row.dataset.depth)).toEqual(['0', '1', '1', '2', '2', '1', '0', '1']);
    const inner = rowOf('Inner');
    const box = rowOf('Box');
    expect(inner.dataset.parent).toBe(box.dataset.rowKey);
    expect(inner.style.getPropertyValue('--depth')).toBe('2');
    expect(rowOf('Intro').dataset.parent).toBe('');
    expect(box.dataset.container).toBe('1');
    expect(inner.dataset.container).toBeUndefined();
  });

  it('puts every ancestor on a row, outermost first, for matching a whole subtree', () => {
    const intro = rowOf('Intro');
    const box = rowOf('Box');
    expect(intro.dataset.ancestors).toBe('');
    expect(box.dataset.ancestors).toBe(intro.dataset.rowKey);
    expect(rowOf('Inner').dataset.ancestors).toBe(`${intro.dataset.rowKey} ${box.dataset.rowKey}`);
  });

  it('tints everything inside the selected step, at any depth, in one shade', () => {
    clickRow('Intro');
    expect(marked('is-in-group')).toEqual(['Kind', 'Box', 'Inner', 'Other', 'Tail']);
    /* the bracket sits in the guide column of the step: depth 0 */
    expect(rowOf('Inner').style.getPropertyValue('--sel-depth')).toBe('0');
    expect(rowOf('Final').classList.contains('is-in-group')).toBe(false);
  });

  it('draws the bracket in the guide column of the selected block', () => {
    clickRow('Box');
    expect(rowOf('Inner').style.getPropertyValue('--sel-depth')).toBe('1');
  });

  it('tints the rows under a selected block, and none for a plain element', () => {
    clickRow('Box');
    expect(marked('is-in-group')).toEqual(['Inner', 'Other']);
    clickRow('Kind');
    expect(marked('is-in-group')).toEqual([]);
  });

  it('marks everything inside a section header while it is hovered, and clears the mark', () => {
    hover(rowOf('Box'));
    expect(marked('is-hover-group')).toEqual(['Inner', 'Other']);
    expect(rowOf('Inner').style.getPropertyValue('--hover-depth')).toBe('1');
    hover(rowOf('Intro'));
    expect(marked('is-hover-group')).toEqual(['Kind', 'Box', 'Inner', 'Other', 'Tail']);
    expect(rowOf('Inner').style.getPropertyValue('--hover-depth')).toBe('0');
    hover(rowOf('Kind')); // a plain element is no header
    expect(marked('is-hover-group')).toEqual([]);

    hover(rowOf('Final'));
    document.getElementById('struct-list').dispatchEvent(new MouseEvent('mouseleave'));
    expect(marked('is-hover-group')).toEqual([]);
  });

  it('shows the extent of a hovered block inside the selected step without losing the step\'s', () => {
    clickRow('Intro');
    hover(rowOf('Box'));
    const inner = rowOf('Inner');
    expect(inner.classList.contains('is-in-group')).toBe(true);
    expect(inner.classList.contains('is-hover-group')).toBe(true);
    expect(inner.style.getPropertyValue('--sel-depth')).toBe('0');
    expect(inner.style.getPropertyValue('--hover-depth')).toBe('1');
    expect(rowOf('Kind').classList.contains('is-hover-group')).toBe(false); // outside the block: the step's bracket only
    expect(rowOf('Kind').classList.contains('is-in-group')).toBe(true);
  });

  it('does not rebuild the rows when the hover moves', () => {
    const before = rowOf('Inner');
    hover(rowOf('Box'));
    hover(rowOf('Intro'));
    expect(rowOf('Inner')).toBe(before);
  });

  it('draws the brackets with the guide depths, and keeps the other guides muted', () => {
    const css = readFileSync('panel.css', 'utf8');
    expect(css).toMatch(/\.el-row\.is-in-group[^{]*::after\s*\{[^}]*var\(--sel-depth/);
    expect(css).toMatch(/\.el-row\.is-hover-group[^{]*::before\s*\{[^}]*var\(--hover-depth/);
  });

  it('keeps the guides and the tint out of the row layout', () => {
    const css = readFileSync('panel.css', 'utf8');
    expect(css).toMatch(/\.el-row\[data-depth\]::before\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/var\(--depth/);
  });
});
