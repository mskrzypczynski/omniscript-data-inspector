'use strict';

/* The split divider between the list and the detail pane, dragged in the
 * stacked layout (a narrow panel). jsdom lays nothing out, so the sizes the
 * drag reads are stubbed: the divider is as wide as the panel and a few
 * pixels tall, like the real one. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

function stubBox(el, { x = 0, y = 0, width, height }) {
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height });
}

function mouse(target, type, init) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

beforeAll(async () => {
  stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
});

describe('Split divider in the stacked layout', () => {
  it('lets the list take most of the height when dragged down', () => {
    $('tab-structure').click();
    const split = $('view-structure').querySelector('.split');
    const list = split.firstElementChild;
    const divider = split.querySelector('.split-divider');
    split.style.flexDirection = 'column'; // what the narrow-width media query does
    stubBox(split, { y: 100, width: 480, height: 600 });
    stubBox(list, { y: 100, width: 480, height: 270 });
    stubBox(divider, { y: 370, width: 480, height: 6 }); // full width, a few px tall

    mouse(divider, 'mousedown', { clientX: 240, clientY: 373 });
    mouse(document, 'mousemove', { clientX: 240, clientY: 650 }); // 550 px into a 600 px split
    mouse(document, 'mouseup', {});

    const share = parseFloat(split.style.getPropertyValue('--list-h'));
    expect(share).toBeGreaterThan(80); // 600 − 60 (min detail) − 6 (divider) = 534 px ≈ 89%
    expect(split.style.getPropertyValue('--list-w')).toBe('');
    split.style.flexDirection = '';
    split.style.removeProperty('--list-h');
  });
});
