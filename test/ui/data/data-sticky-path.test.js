'use strict';

/* The sticky parent path in the Data tree: the open branches the first visible
 * row sits inside stay pinned at the top (at most three), a click goes to the
 * row, and it works when the tree is drawn a window at a time. jsdom has no
 * layout, so every row is 18px tall here, by its line number. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const ROW_PX = 18;
const click = (id) => document.getElementById(id).click();
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

let scrollTop;
let realRect;

beforeEach(() => {
  scrollTop = 0;
  realRect = Element.prototype.getBoundingClientRect;
  const rect = (top, height) => ({ top, bottom: top + height, left: 0, right: 100, width: 100, height });
  Element.prototype.getBoundingClientRect = function box() {
    if (this.id === 'viewport') return rect(0, 300);
    if (this.classList && this.classList.contains('vwin')) return rect(-scrollTop, 0);
    if (this.classList && this.classList.contains('row') && this.dataset.line) {
      return rect((Number(this.dataset.line) - 1) * ROW_PX - scrollTop, ROW_PX);
    }
    return rect(0, 0);
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  document.body.innerHTML = '';
});

async function scrollTo(rowNumber) {
  scrollTop = rowNumber * ROW_PX;
  viewport().dispatchEvent(new Event('scroll'));
  await wait();
}

const lines = () => [...viewport().querySelectorAll('.tree-sticky-line')];
const pinned = () => lines().map((line) => line.textContent.replace('▾', ''));

const DATA = {
  Step: {
    Block: {
      Items: Array.from({ length: 6 }, (_, i) => ({ Code: `c${i}`, Name: `n${i}`, Note: 'x' })),
      After: 1
    }
  },
  Second: { Only: 2 }
};

async function openTree(data = DATA) {
  const booted = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data }] });
  click('expand');
  await tick();
  return booted;
}

/* Rows (line numbers = index + 1 while everything is open):
 *  0 Payload  1 Step  2 Block  3 Items  4 [0]  5 Code  6 Name  7 Note  8 }  9 [1] ... */
describe('sticky parent path', () => {
  it('pins nothing at the top of the tree', async () => {
    await openTree();
    expect(lines()).toHaveLength(0);
    expect(viewport().querySelector('.tree-sticky-lines').hidden).toBe(true);
  });

  it('pins the open branches around the first visible row, outermost first, without the root', async () => {
    await openTree();
    await scrollTo(6); // row 6 is Items/0/Name
    expect(pinned()).toEqual(['Block', 'Items', '0']);
  });

  it('keeps at most three lines, the nearest ones', async () => {
    await openTree();
    await scrollTo(6);
    expect(lines()).toHaveLength(3);
    expect(lines().map((line) => line.dataset.path.split(SEP).length)).toEqual([2, 3, 4]);
  });

  it('changes with the first visible row and goes away when the next key starts', async () => {
    await openTree();
    await scrollTo(6);
    await scrollTo(3); // Items itself is at the top: its parents are Step and Block
    expect(pinned()).toEqual(['Step', 'Block']);
    await scrollTo(0);
    expect(lines()).toHaveLength(0);
    expect(viewport().querySelector('.tree-sticky-lines').hidden).toBe(true);
  });

  it('does not rebuild its lines while the same ones apply', async () => {
    await openTree();
    await scrollTo(6);
    const before = lines();
    await scrollTo(7);
    expect(lines()[0]).toBe(before[0]);
  });

  it('scrolls to the row when a line is clicked', async () => {
    await openTree();
    await scrollTo(6);
    const target = viewport().querySelector('.row[data-path$="Items"]');
    const spy = jest.fn();
    target.scrollIntoView = spy;
    lines()[1].click();
    expect(spy).toHaveBeenCalled();
  });

  it('is out of the tab order and hidden from a screen reader, as buttons', async () => {
    await openTree();
    await scrollTo(6);
    expect(viewport().querySelector('.tree-sticky').getAttribute('aria-hidden')).toBe('true');
    lines().forEach((line) => {
      expect(line.tagName).toBe('BUTTON');
      expect(line.tabIndex).toBe(-1);
      /* A press must not move the focus into the hidden strip either. */
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      line.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    });
  });

  it('reserves the room it takes for the keyboard\'s scrolling, and gives it back', async () => {
    await openTree();
    await scrollTo(6);
    expect(viewport().style.scrollPaddingTop).toBe('55px');
    await scrollTo(0);
    expect(viewport().style.scrollPaddingTop).toBe('');
  });

  it('is rebuilt with the tree by a redraw and still correct', async () => {
    await openTree();
    await scrollTo(6);
    click('refresh');
    await tick();
    await wait();
    expect(pinned()).toEqual(['Block', 'Items', '0']);
  });

  it('hangs from a zero-height holder before the rows, so it takes no room of its own', async () => {
    await openTree();
    await scrollTo(6);
    expect(viewport().firstChild.className).toBe('tree-sticky');
    expect(viewport().firstChild.querySelector('.row')).toBeNull();
  });
});

describe('sticky parent path in a windowed tree', () => {
  const big = { Plan: { Rows: Array.from({ length: 900 }, (_, i) => ({ Id: `r${i}`, Name: `n${i}` })) }, Tail: 1 };

  it('follows the scroll in a tree drawn a window at a time', async () => {
    await openTree(big);
    expect(viewport().querySelector('.vwin')).not.toBeNull();
    // Rows: Payload 0, Plan 1, Rows 2, then 4 rows per item: [i] at 3 + 4i, Id, Name, }.
    await scrollTo(3 + 4 * 500 + 1); // Id of item 500
    expect(pinned()).toEqual(['Plan', 'Rows', '500']);
  });

  it('pins the same path after jumping far, and nothing back at the top', async () => {
    await openTree(big);
    await scrollTo(3 + 4 * 800 + 2);
    expect(pinned()).toEqual(['Plan', 'Rows', '800']);
    await scrollTo(0);
    expect(lines()).toHaveLength(0);
  });
});
