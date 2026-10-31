'use strict';

/* Elements a custom Lightning web component overrides: the head, the summary,
 * the filter box and the step's Validation tab. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, rowNames, tick } from '../support/structure-page.js';

const steps = () => [{
  name: 'Intro',
  elements: [
    { name: 'Plain', type: 'Text' },
    { name: 'Postcode', type: 'Text', propSetMap: { lwcComponentOverride: 'c-postcode-lookup' } },
    { name: 'Toggle', type: 'Checkbox', propSetMap: { lwcOverride: 'newsletterToggle' } }
  ]
}];

const boot = () => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: {} }] });
const tab = (name) => [...document.querySelectorAll('#struct-detail .seg-btn')].find((button) => button.textContent.startsWith(name));
const body = () => document.querySelector('#struct-detail .detail-body');
const typeFilter = async (text) => {
  jest.useFakeTimers();
  const box = document.getElementById('struct-filter');
  box.value = text;
  box.dispatchEvent(new Event('input'));
  jest.advanceTimersByTime(300);
  jest.useRealTimers();
  await tick();
};

describe('the detail head', () => {
  it('says which component overrides the element, with what that means in the tooltip', async () => {
    await boot();
    clickRow('Postcode');
    const line = document.querySelector('#struct-detail .detail-line');
    expect(line.textContent).toContain('· overridden by c-postcode-lookup');
    expect(line.querySelector('[title]').title).toBe(
      'Overridden by c-postcode-lookup: its own markup and validation run instead of the standard element'
    );
  });

  it('says nothing for an element that is not overridden', async () => {
    await boot();
    clickRow('Plain');
    expect(document.querySelector('#struct-detail .detail-line').textContent).not.toContain('overridden');
  });
});

describe('the Properties tab', () => {
  it('lists Overridden by as a property of the element, not among the internal keys', async () => {
    await boot();
    clickRow('Postcode');
    tab('Properties').click();
    const row = [...body().querySelectorAll('.prop-table tr')].find((r) => r.querySelector('th') && r.querySelector('th').textContent.startsWith('Overridden by'));
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('c-postcode-lookup');
    expect(row.closest('details')).toBeNull();
  });
});

describe('the summary', () => {
  it('lists the overridden elements, each selecting its element', async () => {
    await boot();
    document.querySelector('#struct-list .el-row.is-selected').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // Follow current step had picked the step
    const row = document.querySelector('#struct-detail tr[data-row="overridden"]');
    expect(row.querySelector('th').textContent).toBe('Overridden: 2');
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Postcode', 'Toggle']);
    buttons[1].click();
    expect(document.querySelector('#struct-list .el-row.is-selected').textContent).toContain('Toggle');
  });
});

describe('the filter box', () => {
  it('override: lists only the overridden elements, override:name only that component', async () => {
    await boot();
    await typeFilter('override:');
    expect(rowNames().join('|')).toMatch(/Postcode/);
    expect(rowNames().join('|')).toMatch(/Toggle/);
    expect(rowNames().join('|')).not.toMatch(/Plain/);

    await typeFilter('override:postcodeLookup');
    expect(rowNames().join('|')).toMatch(/Postcode/);
    expect(rowNames().join('|')).not.toMatch(/Toggle/);
  });

  it('says so when nothing is overridden by that name', async () => {
    await boot();
    await typeFilter('override:nothing');
    expect(document.querySelector('.struct-no-match').textContent).toContain('No element is overridden by “nothing”');
  });
});

describe('what may stop Next', () => {
  it('lists the overridden elements among the custom components, with the same note', async () => {
    await boot();
    clickRow('Intro');
    tab('Validation').click();
    const text = body().textContent;
    expect(text).toContain('Custom components (2)');
    expect(text).toContain('Postcode');
    expect(text).toContain('overridden by c-postcode-lookup');
    expect(text).toContain('overridden by newsletterToggle');
    expect(text).toContain('may carry its own required controls');
  });
});
