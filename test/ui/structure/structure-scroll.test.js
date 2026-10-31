'use strict';

/* Picking a row only changes the selection: the list stays where it was.
 * jsdom lays nothing out, so a small stand-in for the browser's rule is
 * installed on the list: the scroll position is clamped to what the list holds
 * whenever the script reads a size (a forced layout), which is what threw the
 * list back to the top when it was emptied for a redraw. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

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

function fakeLayout(list) {
  let top = 0;
  const clamp = () => { top = Math.min(top, Math.max(0, list.children.length * ROW_PX - VIEW_PX)); };
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value) => { clamp(); top = Math.max(0, Math.min(value, Math.max(0, list.children.length * ROW_PX - VIEW_PX))); }
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { clamp(); return this.classList.contains('el-head') ? 20 : 0; }
  });
  return { settle: clamp };
}

afterEach(() => { delete HTMLElement.prototype.offsetHeight; });

describe('the list keeps its place', () => {
  it('does not jump to the top when a row is picked', async () => {
    await bootStructure({ scripts: [longScript()] });
    const list = document.getElementById('struct-list');
    fakeLayout(list);

    list.scrollTop = 300;
    expect(list.scrollTop).toBe(300);
    clickRow('Field20');
    await tick();

    expect(document.querySelector('#struct-list .is-selected .el-name').textContent).toContain('Field20');
    expect(list.scrollTop).toBe(300);
  });

  it('keeps it through a poll that redraws the list with new data', async () => {
    jest.useFakeTimers();
    try {
      await bootStructure({ scripts: [longScript()] });
      const list = document.getElementById('struct-list');
      fakeLayout(list);
      list.scrollTop = 300;
      clickRow('Field22');
      document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Field1: 'x' } });
      jest.advanceTimersByTime(2000);
      await tick();
      expect(list.scrollTop).toBe(300);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the list does not snap', () => {
  it('has no scroll snapping, which moved the list when rows were redrawn', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/scroll-snap-(type|align)/);
  });
});

describe('a new set of rows starts at the top', () => {
  const typeFilter = (value) => {
    const box = document.getElementById('struct-filter');
    box.value = value;
    box.dispatchEvent(new Event('input'));
  };

  it('scrolls to the first match when a filter is typed deep in the list', async () => {
    jest.useFakeTimers();
    try {
      await bootStructure({ scripts: [longScript()] });
      const list = document.getElementById('struct-list');
      fakeLayout(list);
      list.scrollTop = 300;
      typeFilter('Field');
      jest.advanceTimersByTime(500);
      await tick();
      expect(list.scrollTop).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('goes back to the top when the filter is cleared', async () => {
    jest.useFakeTimers();
    try {
      await bootStructure({ scripts: [longScript()] });
      const list = document.getElementById('struct-list');
      fakeLayout(list);
      typeFilter('Field');
      jest.advanceTimersByTime(500);
      await tick();
      list.scrollTop = 200;
      typeFilter('');
      jest.advanceTimersByTime(500);
      await tick();
      expect(list.scrollTop).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the place through a poll while a filter is active and Follow current step is on', async () => {
    jest.useFakeTimers();
    try {
      await bootStructure({ scripts: [longScript()] });
      expect(document.getElementById('struct-follow').checked).toBe(true);
      const list = document.getElementById('struct-list');
      fakeLayout(list);
      typeFilter('Field');
      jest.advanceTimersByTime(500);
      await tick();
      list.scrollTop = 300;
      document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Field1: 'x' } });
      jest.advanceTimersByTime(2000);
      await tick();
      expect(list.scrollTop).toBe(300);
    } finally {
      jest.useRealTimers();
    }
  });
});
