'use strict';

/* A row button keeps focus after it is clicked; that must not freeze the live
 * tree. Only hovering a copy button or selecting text holds a redraw back. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

describe('Data tab with a focused row button', () => {
  it('redraws the tree when a new payload arrives', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    const button = viewport().querySelector('.row-copy:not(.row-fold)');
    button.focus();
    expect(document.activeElement).toBe(button);

    document.getElementById('a').jsonDataStr = JSON.stringify({ Step: { Name: 'Bea' } });
    document.getElementById('refresh').click();
    await tick();

    expect(viewport().textContent).toContain('Bea');
    expect(viewport().textContent).not.toContain('Ada');
  });

  it('gives focus back to the tree right after a pointer click on a row button', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    const button = viewport().querySelector('.row-copy:not(.row-fold)');
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.activeElement).not.toBe(button);
    expect(document.activeElement).toBe(viewport());
  });

  it('keeps focus on the button while the check mark of a keyboard press shows, then gives it back', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    const button = viewport().querySelector('.row-copy:not(.row-fold)');
    button.focus();
    button.click(); // detail 0: what Enter and Space on a button produce
    jest.advanceTimersByTime(500);
    expect(document.activeElement).toBe(button);
    jest.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(viewport());
  });

  it('keeps the keyboard on the button when the copy has to go through the fallback route', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('no focus')) } });
    /* selecting the temporary textarea takes focus, as it does in a browser */
    document.execCommand = jest.fn(() => { document.querySelector('textarea').focus(); return true; });
    const button = viewport().querySelector('.row-copy:not(.row-fold)');
    button.focus();
    button.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(document.execCommand).toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    delete document.execCommand;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });

  it('does not pull focus back when the keyboard has moved on within the confirmation', async () => {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    const [first, second] = viewport().querySelectorAll('.row-copy:not(.row-fold)');
    first.focus();
    first.click();
    second.focus(); // Tab to the next button
    jest.advanceTimersByTime(2000);
    expect(document.activeElement).toBe(second);
  });
});
