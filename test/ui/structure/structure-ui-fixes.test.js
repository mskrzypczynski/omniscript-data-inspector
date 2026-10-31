'use strict';

/* Smaller Structure fixes: Follow vs. a hand pick, flashes, folding, labels. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, rowNames, selectedRowText, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  { name: 'Intro', elements: [{ name: 'Greeting' }, { name: 'Amount' }] },
  { name: 'Details', elements: [{ name: 'Notes' }] }
];

const moveTo = (asIndex) => {
  document.getElementById('main').jsonDef = JSON.stringify(definition({ steps: steps(), asIndex }));
};
const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const boot = (extra = {}) => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), ...extra }] });

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Follow current step and a hand pick', () => {
  it('keeps a step you clicked yourself, even when Follow had selected it', async () => {
    await boot();
    expect(selectedRowText()).toContain('Intro'); // Follow selected the current step
    clickRow('Intro');                             // a hand pick of the same step

    moveTo(1);
    await advance(PULSE_MS);

    expect(selectedRowText()).toContain('Intro');
  });

  it('still follows when nothing was picked by hand', async () => {
    await boot();
    moveTo(1);
    await advance(PULSE_MS);
    expect(selectedRowText()).toContain('Details');
  });
});

const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name').textContent.startsWith(name));

describe('rows shown by a read', () => {
  const gated = () => definition({ steps: [{ name: 'Intro', elements: [
    { name: 'Kind' },
    { name: 'Company', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Business' }] } } },
    { name: 'Amount' }
  ] }] });

  it('shows the rows a read reveals, with no value cell on any row (the list has no Value column)', async () => {
    await bootStructure({
      scripts: [{ id: 'main', def: gated(), data: { Intro: { Kind: 'Person', Company: 'x', Amount: '1' } } }]
    });
    expect(rowOf('Company').classList.contains('is-hidden')).toBe(true);

    setData({ Intro: { Kind: 'Business', Company: 'x', Amount: '2' } });
    await advance(PULSE_MS);

    expect(rowOf('Company').classList.contains('is-hidden')).toBe(false);
    expect(document.querySelectorAll('#struct-list .el-value')).toHaveLength(0);
  });
});

describe('folding while a filter is on', () => {
  const filterFor = async (text) => {
    const box = document.getElementById('struct-filter');
    box.value = text;
    box.dispatchEvent(new Event('input'));
    await advance(200);
  };

  it('folds a section and hides its matches, which return on unfold', async () => {
    await boot();
    await filterFor('in'); // Intro and Greeting
    expect(rowNames().join('|')).toContain('Greeting');

    rowOf('Intro').querySelector('.twisty').click();
    expect(rowNames().join('|')).not.toContain('Greeting');
    expect(rowOf('Intro').getAttribute('aria-expanded')).toBe('false');

    rowOf('Intro').querySelector('.twisty').click();
    expect(rowNames().join('|')).toContain('Greeting');
  });
});

describe('labels for assistive technology', () => {
  it('gives the tags a role and a name', async () => {
    const def = definition({ steps: [{ name: 'Intro', elements: [{ name: 'Email', propSetMap: { required: true } }] }] });
    await bootStructure({ scripts: [{ id: 'main', def }] });
    const tag = rowOf('Email').querySelector('.tag-req');
    expect(tag.getAttribute('role')).toBe('img');
    expect(tag.getAttribute('aria-label')).toBe('Required');
  });

  it('names the filter box of the detail pane', async () => {
    await boot();
    clickRow('Greeting');
    expect(document.querySelector('.detail-find').getAttribute('aria-label')).toBeTruthy();
  });

  it('refreshes the hidden tag when the reason changes but the row stays hidden', async () => {
    const def = definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Kind' },
      { name: 'Company', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Business' }] } } }
    ] }] });
    await bootStructure({ scripts: [{ id: 'main', def, data: { Intro: { Kind: 'Person' } } }] });
    const title = () => rowOf('Company').querySelector('.tag-hidden').title;
    expect(title()).toContain('"Person"');

    setData({ Intro: { Kind: 'Partner' } });
    await advance(PULSE_MS);
    expect(title()).toContain('"Partner"');
  });
});
