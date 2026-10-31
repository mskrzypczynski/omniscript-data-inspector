'use strict';

/* Narrow toolbars: the controls marked data-overflow move into a "…" menu
 * below 600 px and come back above it. jsdom has no layout, so the width is
 * handed to applyWidth directly. */

import { jest } from '@jest/globals';

let applyWidth;
let resetToolbarOverflow;

const $ = (id) => document.getElementById(id);
const menu = () => document.querySelector('.ctx-menu');
const more = () => document.querySelector('.overflow-btn');
const items = () => [...document.querySelectorAll('.ctx-item')].map((item) => item.textContent);

function mountToolbar() {
  document.body.innerHTML = `
    <header class="toolbar">
      <div class="bar">
        <button id="keep">Refresh</button>
        <button id="copy" data-overflow><span class="btn-label">Copy JSON</span></button>
        <label class="field checkbox" id="track-label" data-overflow><input id="track" type="checkbox" /><span>Track changes</span></label>
        <button id="size" data-overflow aria-pressed="false">Sizes</button>
      </div>
      <div id="extra" class="bar" hidden>
        <button id="prev" data-overflow>Prev</button>
      </div>
    </header>
    <header class="toolbar"><div class="bar"><button id="plain">Clear</button></div></header>`;
}

beforeEach(async () => {
  jest.resetModules();
  ({ applyWidth, resetToolbarOverflow } = await import('../../../src/ui/toolbar-overflow.js'));
  resetToolbarOverflow();
  mountToolbar();
});

afterEach(() => { document.body.innerHTML = ''; document.body.className = ''; });

describe('below 600 px', () => {
  it('moves each marked control out of its toolbar into a … menu button at the end of it', () => {
    applyWidth(480);
    const bar = document.querySelector('.toolbar .bar');
    expect(more()).not.toBeNull();
    expect(more().parentElement).toBe(bar);
    expect(bar.lastElementChild).toBe(more());
    expect(more().title).toBe('More');
    expect(more().getAttribute('aria-haspopup')).toBe('menu');
    expect(more().getAttribute('data-help')).toBe('More');
    expect(bar.contains($('copy'))).toBe(false);
    expect(bar.contains($('keep'))).toBe(true);
  });

  it('moves the elements themselves, so ids and handlers survive', () => {
    const copy = $('copy');
    const handler = jest.fn();
    copy.addEventListener('click', handler);
    applyWidth(480);
    expect($('copy')).toBe(copy);
    copy.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('lists the available controls, a switch with its state, and skips what its own row hides', () => {
    $('track').checked = true;
    applyWidth(480);
    more().click();
    expect(items()).toEqual(['Copy JSON', 'Track changes: on', 'Sizes: off']);
  });

  it('highlights no item when the menu opens by mouse, and the first one when it opens by keyboard', () => {
    applyWidth(480);
    more().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(menu()).not.toBeNull();
    expect(document.activeElement.classList.contains('ctx-item')).toBe(false);
    expect(document.activeElement).toBe(menu());

    more().click(); // detail 0: what Enter or Space on the button sends
    expect(document.activeElement).toBe(document.querySelector('.ctx-item'));
  });

  it('clicks the real control from a menu item', () => {
    const handler = jest.fn();
    $('copy').addEventListener('click', handler);
    applyWidth(480);
    more().click();
    [...document.querySelectorAll('.ctx-item')][0].click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();

    more().click();
    [...document.querySelectorAll('.ctx-item')][1].click();
    expect($('track').checked).toBe(true);
    more().click();
    expect(items()[1]).toBe('Track changes: on');
  });

  it('shows the controls of a row once the row is shown', () => {
    applyWidth(480);
    more().click();
    expect(items()).not.toContain('Prev');
    document.querySelector('.ctx-item').click();
    $('extra').hidden = false;
    more().click();
    expect(items()).toContain('Prev');
  });

  it('leaves a toolbar with nothing marked alone', () => {
    applyWidth(480);
    const second = document.querySelectorAll('.toolbar')[1];
    expect(second.querySelector('.overflow-btn')).toBeNull();
    expect(second.querySelector('#plain')).not.toBeNull();
  });

  it('does nothing when it is already narrow', () => {
    applyWidth(480);
    const button = more();
    applyWidth(300);
    expect(document.querySelectorAll('.overflow-btn')).toHaveLength(1);
    expect(more()).toBe(button);
  });
});

describe('at 600 px and wider', () => {
  it('puts every control back in its place and hides the … button', () => {
    const before = [...document.querySelector('.toolbar .bar').children].map((node) => node.id);
    applyWidth(480);
    applyWidth(900);
    const after = [...document.querySelector('.toolbar .bar').children].filter((node) => !node.classList.contains('overflow-btn'));
    expect(after.map((node) => node.id)).toEqual(before);
    expect(more().hidden).toBe(true);
    expect(document.querySelector('.overflow-holder').childElementCount).toBe(0);
    expect(document.querySelector('#extra #prev')).not.toBeNull();
  });

  it('is the layout at the start, and an unmeasured width changes nothing', () => {
    applyWidth(0);
    expect(more()).toBeNull();
    applyWidth(1280);
    expect(more()).toBeNull();
  });

  it('goes narrow again when the panel shrinks a second time', () => {
    applyWidth(480);
    applyWidth(900);
    applyWidth(500);
    expect(more().hidden).toBe(false);
    expect(document.querySelector('.toolbar .bar').contains($('copy'))).toBe(false);
    expect(document.querySelectorAll('.overflow-btn')).toHaveLength(1);
  });
});
