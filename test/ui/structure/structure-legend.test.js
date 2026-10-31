'use strict';

/* The Marks column header is a button that opens a popover with each real
 * icon of the list beside what it means. */

import { bootStructure, definition, tick } from '../support/structure-page.js';

const steps = () => [{ name: 'Intro', elements: [{ name: 'Kind', type: 'Text' }] }];
const boot = async () => {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Kind: 'a' } } }] });
  await tick();
};
const button = () => document.querySelector('#struct-list .el-head .el-legend-btn');
const pop = () => document.querySelector('.legend-pop');

afterEach(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

describe('the legend of the list marks', () => {
  it('is a button on the Marks header, with the words as its tooltip', async () => {
    await boot();
    expect(button().tagName).toBe('BUTTON');
    expect(button().textContent).toBe('Marks');
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().title).toContain('diamond = has a show rule');
  });

  it('opens on a click with each real icon beside its meaning, and closes on Escape with focus back on the header', async () => {
    await boot();
    button().focus();
    button().click();
    expect(pop()).not.toBeNull();
    expect(pop().getAttribute('role')).toBe('dialog');
    expect(button().getAttribute('aria-expanded')).toBe('true');

    const lines = [...pop().querySelectorAll('.legend-line')];
    const lineFor = (text) => lines.find((line) => line.textContent.includes(text));
    expect(lineFor('hidden by its show rule').querySelector('svg.ic-eye-off')).not.toBeNull();
    expect(lineFor('has a show rule').querySelector('svg.ic-diamond')).not.toBeNull();
    expect(lineFor('anything else').querySelector('svg.ic-el-other')).not.toBeNull();
    expect([...pop().querySelectorAll('.legend-title')].map((title) => title.textContent)).toEqual(['Valid', 'Marks', 'Kinds']);
    expect(lineFor('passes its rules now').querySelector('.legend-mark').textContent).toBe('✓');
    expect(lineFor('would stop Next now').querySelector('.legend-mark').textContent).toBe('✕');
    expect(lineFor('cannot tell').querySelector('.legend-mark').textContent).toBe('–');
    expect(pop().textContent).not.toMatch(/Progress|solid dot/);
    expect(lineFor('required').textContent).toContain('*');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button());
  });

  it('closes on a click elsewhere and toggles on a second click', async () => {
    await boot();
    button().click();
    expect(pop()).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(pop()).toBeNull();
    button().click();
    button().click();
    expect(pop()).toBeNull();
  });

  it('keeps the header out of the way of the list keys', async () => {
    await boot();
    button().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(pop()).toBeNull();
  });
});
