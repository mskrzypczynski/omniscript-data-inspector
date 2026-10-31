'use strict';

/* Home, End and the arrows in the element list. A step row is pinned under the
 * column header while its rows scroll, so the browser counts it as in view
 * wherever the list is scrolled: Home used to leave the list at the bottom.
 * jsdom lays nothing out, so a small stand-in is installed: rows 20 px high, the
 * header 20 px, a step row pinned under the header unless it is measured as
 * static, and the scroll position clamped to what the list holds. */

import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const ROW_PX = 20;
const VIEW_PX = 100;

const longScript = () => ({
  id: 'main',
  def: definition({
    steps: [
      { name: 'Intro', elements: Array.from({ length: 30 }, (_, i) => ({ name: `Field${i}` })) },
      { name: 'Details', elements: [{ name: 'Notes' }] }
    ]
  })
});

let spies;
const isStep = (node) => node.dataset && node.dataset.depth === '0' && node.dataset.container === '1';

function fakeLayout(list) {
  let top = 0;
  const clamp = () => { top = Math.min(top, Math.max(0, list.children.length * ROW_PX - VIEW_PX)); };
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value) => { clamp(); top = Math.max(0, Math.min(value, Math.max(0, list.children.length * ROW_PX - VIEW_PX))); }
  });
  Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => VIEW_PX });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { clamp(); return this.classList.contains('el-head') ? ROW_PX : 0; }
  });
  spies = [
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this === list) return { top: 0, height: VIEW_PX };
      const natural = Array.prototype.indexOf.call(list.children, this) * ROW_PX;
      const pinned = isStep(this) && this.style.position !== 'static';
      const y = pinned ? Math.max(natural - top, ROW_PX) : natural - top;
      return { top: y, height: ROW_PX };
    }),
    jest.spyOn(window, 'getComputedStyle').mockImplementation((node) => ({ position: isStep(node) ? 'sticky' : 'static' }))
  ];
}

afterEach(() => {
  delete HTMLElement.prototype.offsetHeight;
  (spies || []).forEach((spy) => spy.mockRestore());
  spies = null;
});

const press = (key, from) => from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const rowNamed = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));

describe('keyboard moves in the element list', () => {
  it('Home shows the first row, a pinned step, instead of staying at the bottom', async () => {
    await bootStructure({ scripts: [longScript()] });
    const list = document.getElementById('struct-list');
    fakeLayout(list);
    list.scrollTop = 580;
    expect(list.scrollTop).toBe(580);

    press('Home', rowNamed('Field29'));
    await tick();
    expect(rowNamed('Intro').classList.contains('is-selected')).toBe(true);
    expect(list.scrollTop).toBe(0);
  });

  it('a move onto a pinned step above the view brings the step into the flow', async () => {
    await bootStructure({ scripts: [longScript()] });
    const list = document.getElementById('struct-list');
    fakeLayout(list);
    list.scrollTop = 580;
    press('ArrowUp', rowNamed('Notes')); // Details sits at 32 * 20 = 640 px, below the view's top
    await tick();
    expect(rowNamed('Details').classList.contains('is-selected')).toBe(true);
    expect(list.scrollTop).toBeLessThanOrEqual(640 - ROW_PX);
    expect(list.scrollTop).toBeGreaterThan(0);
  });

  it('End still selects the last row', async () => {
    await bootStructure({ scripts: [longScript()] });
    fakeLayout(document.getElementById('struct-list'));
    press('End', rowNamed('Intro'));
    await tick();
    expect(rowNamed('Notes').classList.contains('is-selected')).toBe(true);
  });
});
