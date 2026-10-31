'use strict';

/* The Free build of the Structure tab: the gated controls of its seven gates are
 * not there, their help entries are not listed, and what stays Free still
 * works. Names here are invented. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const $ = (id) => document.getElementById(id);
const bar = () => [...document.querySelectorAll('#view-structure .bar [id]')].map((node) => node.id).filter((id) => id !== 'struct-follow-paused');

/* Every gated control of the tab, by the gate that opens it. */
const CONTROLS = {
  'structure.timeline': ['struct-more'], // Timeline, Compare definition and Export live in the More menu: Free has none, so no button
  'structure.problems': ['struct-problems'],
  'structure.compare-definition': ['struct-compare-file']
};

/* Every help entry of the tab that belongs to a gate. */
const ENTRIES = {
  'structure.timeline': ['Timeline', 'Step timing'],
  'structure.steps': ['Go to an earlier step', 'Collapse done steps', 'May stop Next count'],
  'structure.problems': ['Problems'],
  'structure.whatif': ['What if'],
  'structure.compare-definition': ['Compare definition'],
  'structure.export': ['Export'],
  'structure.references': ['Depends on / Used by / Written by', 'Actions only']
};

describe('the Free Structure toolbar and help', () => {
  beforeAll(async () => {
    jest.resetModules();
    mountPanelMarkup({ free: true });
    stubChromeDevtools();
    await import('../../../src/ui/app.js');
  });

  Object.entries(CONTROLS).forEach(([gate, ids]) => {
    it(`${gate}: its controls are not in the toolbar`, () => {
      ids.forEach((id) => expect($(id)).toBeNull());
    });
  });

  it('keeps the Free controls and no empty group', () => {
    expect(bar()).toEqual([
      'struct-refresh', 'struct-current', 'struct-follow', 'struct-filter',
      'struct-view', 'struct-expand', 'struct-collapse'
    ]);
  });

  it('keeps only the two Free switches in the View menu, and no gated item in a menu', async () => {
    const { openMenu, menuLabels } = await import('../support/structure-menus.js');
    openMenu();
    expect(menuLabels()).toEqual(['Highlight on hover', 'Visible only']);
    expect($('struct-view').title).not.toMatch(/Actions only|Collapse done steps/);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('struct-view').getAttribute('aria-expanded')).toBe('false');
  });

  it('lists none of the gated entries in the Structure help, and keeps the Free ones', () => {
    $('tab-structure').click();
    $('help').click();
    const terms = [...$('help-body').querySelectorAll('dt')].map((dt) => dt.textContent);
    Object.entries(ENTRIES).forEach(([gate, titles]) => {
      titles.forEach((title) => expect([gate, title, terms.includes(title)]).toEqual([gate, title, false]));
    });
    ['Refresh', 'Filter', 'Hidden elements', 'Marks column', 'Valid column', 'Summary', 'Validation tab', 'Resizing']
      .forEach((title) => expect(terms).toContain(title));
  });

  it('says nothing of Problems or Actions only in Start here', () => {
    const start = [...document.querySelectorAll('#help-body .help-start li')].map((li) => li.textContent).join(' ');
    expect(start).toContain('Type in the filter');
    expect(start).not.toMatch(/Problems|Actions only/);
  });
});

const steps = () => [
  { name: 'Intro', elements: [
    { name: 'Email', type: 'Email', propSetMap: { required: true }, JSONPath: 'Intro:Email' },
    { name: 'Kind', type: 'Text', JSONPath: 'Intro:Kind' },
    { name: 'Extra', type: 'Text', JSONPath: 'Intro:Extra', propSetMap: { show: { group: { operator: 'AND', rules: [
      { field: 'Intro:Kind', condition: '=', data: 'Business' }
    ] } } } },
    { name: 'Call', type: 'Integration Procedure Action', propSetMap: { integrationProcedureKey: 'demo_flow' } }
  ] },
  { name: 'Middle', elements: [{ name: 'Note', type: 'Text' }] },
  { name: 'Review', elements: [{ name: 'Agree', type: 'Checkbox', propSetMap: { required: true } }] }
];

const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));
const rowNames = () => [...document.querySelectorAll('#struct-list .el-name')].map((node) => node.textContent);
const tabLabels = () => [...document.querySelectorAll('#struct-detail .seg-btn')].map((button) => button.textContent);
const tab = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')].find((button) => button.textContent.startsWith(label));
const rightClick = (row) => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
const menuItems = () => [...document.querySelectorAll('.ctx-menu .ctx-item')].map((item) => item.textContent);

async function boot(data = { Intro: { Kind: 'Person' } }) {
  await bootStructure({
    free: true,
    scripts: [{ id: 'main', def: definition({ steps: steps(), asIndex: 2 }), data }]
  });
}

afterEach(() => { jest.useRealTimers(); document.querySelectorAll('.ctx-menu').forEach((node) => node.remove()); });

describe('what stays Free on Structure', () => {
  it('lists the elements, filters them and selects one', async () => {
    await boot();
    expect(rowNames()).toEqual(expect.arrayContaining(['Email', 'Kind', 'Agree']));
    jest.useFakeTimers();
    const box = $('struct-filter');
    box.value = 'Agree';
    box.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(300);
    jest.useRealTimers();
    await tick();
    expect(rowNames()).toContain('Agree');
    expect(rowNames()).not.toContain('Email');
    clickRow('Agree');
    expect(document.querySelector('#struct-detail .detail-title').textContent).toContain('Agree');
  });

  it('shows no May stop Next number anywhere, and the Validation tab of a step without a count', async () => {
    await boot({ Intro: { Kind: 'Person' }, Review: {} });
    expect(document.querySelectorAll('#struct-list .el-badge')).toHaveLength(0);
    clickRow('Intro');
    expect(document.querySelector('#struct-detail .detail-stops')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-head').textContent).not.toMatch(/May stop Next/);
    expect(tab('Validation')).toBeTruthy(); // the Email is required and empty
    expect(tab('Validation').textContent).toBe('Validation');
    tab('Validation').click();
    expect(document.querySelector('#struct-detail .detail-body').textContent).toMatch(/Email/);
  });

  it('keeps the show rule, with Is now read-only (no What if)', async () => {
    await boot();
    clickRow('Extra');
    tab('Visibility').click();
    expect(document.querySelector('#struct-detail .fc-cond')).toBeTruthy();
    expect(document.querySelectorAll('.fc-cond .whatif-cell, .fc-cond .whatif-input')).toHaveLength(0);
    expect(document.querySelector('.whatif-reset')).toBeNull();
  });

  it('offers no step navigation in the row menu or the head, and no Used by / Depends on / Timeline', async () => {
    await boot();
    rightClick(rowOf('Intro'));
    expect(menuItems().filter((label) => /^(Go back|Go to this step) on page$/.test(label))).toEqual([]);
    expect(menuItems()).toContain('Copy name');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    clickRow('Intro');
    expect(document.querySelector('#struct-detail .step-back')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-timing')).toBeNull();
    clickRow('Extra');
    tab('Visibility').click();
    expect(document.querySelector('#struct-detail .link-list')).toBeNull();
    expect(document.querySelector('#struct-detail .fc-depends')).toBeNull();
  });

  it('shows the summary without Problems, May stop Next or the timeline', async () => {
    await boot({ Intro: { Kind: 'Person' } });
    rowOf('Review').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // back to the summary
    const rows = [...document.querySelectorAll('#struct-detail .summary-table tr')].map((tr) => tr.dataset.row);
    expect(rows).toContain('step'); // the current step; its empty required field would be counted as May stop Next where its gate is open
    expect(rows).not.toContain('problems');
    expect(rows).not.toContain('stoppers');
    expect(document.querySelector('#struct-detail .timeline')).toBeNull();
  });

  it('keeps the Calls tab of an action', async () => {
    await boot();
    clickRow('Call');
    expect(tabLabels().some((label) => label.startsWith('Calls'))).toBe(true);
  });
});
