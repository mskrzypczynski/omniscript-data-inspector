'use strict';

/* The script summary: what the detail pane shows while no element is selected. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [
  { name: 'Intro', elements: [
    { name: 'FullName', type: 'Text', propSetMap: { required: true } },
    { name: 'Notes', type: 'Text' }
  ] },
  { name: 'Details', elements: [
    { name: 'Load', type: 'DataRaptor Extract Action', propSetMap: { bundle: 'DRDemo_Load' } },
    { name: 'Save', type: 'Integration Procedure Action', propSetMap: { integrationProcedureKey: 'Demo_Save' } },
    { name: 'Amount', type: 'Number' }
  ] }
];

const build = (extra = {}) => ({ ...definition({ steps: steps() }), ...extra });

const pane = () => document.getElementById('struct-detail');
const title = () => pane().querySelector('.detail-title').textContent;
const summaryRows = () => Object.fromEntries([...pane().querySelectorAll('.summary-table tr')]
  .map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td')]));
const press = (row, key) => row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
const selected = () => document.querySelector('#struct-list .el-row.is-selected');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('script summary', () => {
  it('shows while nothing is selected, and goes when an element is picked', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: build(), data: {} }] });
    clickRow('FullName');
    expect(pane().querySelector('.summary-table')).toBeNull();

    press(selected(), 'Escape');
    expect(selected()).toBeNull();
    expect(title()).toBe('Summary · demo/flow');
    expect(pane().querySelector('.notice')).toBeNull(); // not the empty placeholder
  });

  it('comes back with Esc on the list, and Esc does nothing more when it is already showing', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: build(), data: {} }] });
    clickRow('Amount');
    expect(pane().querySelector('.detail-title').textContent).toMatch(/^Amount/);

    press(selected(), 'Escape');
    expect(title()).toMatch(/^Summary/);

    clickRow('Notes');
    expect(title()).toMatch(/^Notes/);
    press(selected(), 'Escape');
    expect(title()).toMatch(/^Summary/);
  });

  it('counts the script, lists what it calls as buttons, and says where it is', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: build({ bpLang: 'English' }), data: {} }] });
    clickRow('FullName');
    press(selected(), 'Escape');
    const rows = summaryRows();

    expect(rows['Type/SubType/Language'].textContent).toBe('demo / flow / English');
    expect(rows.Steps).toBeUndefined();
    expect(rows.Elements.textContent).toBe('7: 2 steps · 3 fields · 2 actions');
    expect(document.getElementById('status-left').textContent).toContain('7 elements'); // the same figure
    expect(rows['Data Mappers'].textContent).toBe('DRDemo_Load');
    expect(rows['Integration Procedures'].textContent).toBe('Demo_Save');
    expect(rows['On step'].textContent).toBe('Intro');
    expect(rows.Problems).toBeUndefined(); // nothing wrong, so no row
    expect(rows['Custom labels']).toBeUndefined();
  });

  it('selects the element a call row names', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: build(), data: {} }] });
    clickRow('FullName');
    press(selected(), 'Escape');
    summaryRows()['Integration Procedures'].querySelector('button').click();

    expect(selected().textContent).toContain('Save');
    expect(title()).toMatch(/^Save/);
    press(selected(), 'Escape');
    expect(title()).toMatch(/^Summary/);
  });

  it('is taken over again by Current step', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: build(), data: {} }] });
    clickRow('FullName');
    press(selected(), 'Escape');
    document.getElementById('struct-current').click();
    expect(title()).toMatch(/^Intro/);
  });

  it('is replaced by the placeholder when no definition is loaded', async () => {
    await bootStructure({ scripts: [] });
    expect(pane().querySelector('.summary-table')).toBeNull();
    expect(pane().textContent).toContain('Select an element');
  });
});
