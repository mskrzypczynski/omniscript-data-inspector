'use strict';

/* A read that changes the data draws the view again; the keyboard has to stay
 * where it was: on a row's button in the Tree, on a Show in tree button in
 * Sizes, and, when what had focus is gone, on a place Esc still works from. */

import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const click = (id) => document.getElementById(id).click();

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
});

afterEach(() => {
  delete globalThis.ResizeObserver;
  document.body.innerHTML = '';
});

async function change(data) {
  document.getElementById('a').jsonDataStr = JSON.stringify(data);
  click('refresh');
  await tick();
}

describe('a focused row button in the Tree', () => {
  const DATA = { Step: { Name: 'Ada', City: 'Oslo' } };

  it('has focus again, on the same button of the same row, after the data changes', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: DATA }] });
    const row = [...viewport().querySelectorAll('.row')].find((node) => node.dataset.path === `Step${SEP}City`);
    const buttons = row.querySelectorAll(':scope > .row-tools > button');
    const wanted = buttons[1];
    wanted.focus();
    expect(document.activeElement).toBe(wanted);

    await change({ Step: { Name: 'Bea', City: 'Rome' } });

    const after = document.activeElement;
    expect(viewport().textContent).toContain('Rome');
    expect(after).not.toBe(wanted); // the row was drawn again
    expect(after.classList.contains('row-copy')).toBe(true);
    expect(after.closest('.row').dataset.path).toBe(`Step${SEP}City`);
    expect([...after.closest('.row-tools').children].indexOf(after)).toBe(1);
  });
});

