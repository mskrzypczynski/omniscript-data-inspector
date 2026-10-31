'use strict';

/* The Properties tab: an element's propSetMap as a table, and the tab order
 * of the detail pane. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;
const LONG = 'The quick brown fox jumps over the lazy dog and keeps running through the meadow until night falls.';

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Field', type: 'Text', propSetMap: {
    zeta: 'last', required: true, label: 'Your name', readOnly: false, helpText: LONG,
    elementValueMap: { A: '1', B: '2' }, _lwcInternal: 'x', lwcName: 'c-field', repeatLimit: 4,
    options: [{ name: 'US', value: 'United States' }, { name: 'CA', value: 'Canada' }],
    remoteOptions: { level1: { level2: { level3: { level4: 'deep' } } }, flat: 'yes' },
    show: { group: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'x' }] } }
  } },
  { name: 'Kind', type: 'Text' },
  { name: 'Plain', type: 'Text' }
] }];

const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const cells = () => [...document.querySelectorAll('.prop-table > tbody > tr')]
  .map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]);

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

async function openProperties(data = { Intro: { Field: 'Ada' } }) {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  clickRow('Field');
  tabButton('Properties').click();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('detail tab order', () => {
  it('puts Definition last and gives every tab an icon', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Field: 'Ada' } } }] });
    clickRow('Field');
    const buttons = [...document.querySelectorAll('#struct-detail .seg-btn')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Current value', 'Properties', 'Visibility', 'JSON']);
    buttons.forEach((button) => expect(button.querySelector('svg.ui-icon')).not.toBeNull());
  });

  it('opens on the first tab that is available', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Field: 'Ada' } } }] });
    clickRow('Field');
    expect(document.querySelector('#struct-detail .seg-btn.is-on').textContent).toBe('Current value');
    clickRow('Plain'); // no value in the data and no properties
    expect(document.querySelector('#struct-detail .seg-btn.is-on').textContent).toBe('JSON');
  });

  it('leaves out Properties for an element without any', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    clickRow('Plain');
    expect(tabButton('Properties')).toBeUndefined();
  });
});

describe('Properties tab', () => {
  it('lists known keys with human labels first, then the others as they are', async () => {
    await openProperties();
    const rows = cells().map(([label]) => label);
    expect(rows.slice(0, 5)).toEqual(['Label', 'Required', 'Read only', 'Repeat limit', 'Conditional View']);
    expect(rows).toContain('Set Values');
    expect(rows[rows.length - 1]).toBe('zeta');
  });

  it('shows a boolean as a mark and a number as itself', async () => {
    await openProperties();
    const byLabel = Object.fromEntries(cells());
    expect(byLabel.Required).toBe('✓');
    expect(byLabel['Read only']).toBe('–');
    expect(byLabel['Repeat limit']).toBe('4');
  });

  const rowOf = (label) => [...document.querySelectorAll('.prop-table > tbody > tr')]
    .find((tr) => tr.querySelector('th').textContent === label);

  it('draws a list of options as label → value rows in a nested table', async () => {
    await openProperties();
    const nested = rowOf('Options').querySelector('table.prop-nested');
    const lines = [...nested.querySelectorAll('tr')].map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td').textContent]);
    expect(lines).toEqual([['US', 'United States'], ['CA', 'Canada']]);
    expect(rowOf('Options').querySelector('.prop-toggle')).toBeNull();
  });

  it('draws Set Values as target ← expression lines and Conditional View as the rule table', async () => {
    await openProperties();
    const assigns = [...rowOf('Set Values').querySelectorAll('.prop-assign')].map((n) => n.textContent);
    expect(assigns).toEqual(['A ← 1', 'B ← 2']);

    const rule = rowOf('Conditional View').querySelector('table.rule-table');
    expect(rule).not.toBeNull();
    const leaf = [...rule.querySelector('.rule-leaf').children].map((cell) => cell.textContent);
    expect(leaf).toEqual(['✗ false now', 'Intro:Kind', '= "x"', '(not in data)']);
    expect(rule.querySelector('.rule-leaf .jump-link')).not.toBeNull(); // Kind is an element: a button
  });

  it('nests an object as sub-tables and falls back to JSON past the depth limit', async () => {
    await openProperties();
    const outer = rowOf('Remote options').querySelector('table.prop-nested');
    expect(outer.querySelector('th').textContent).toBe('level1');
    expect(rowOf('Remote options').textContent).toContain('flat');
    expect(rowOf('Remote options').textContent).toContain('level3');
    const toggle = rowOf('Remote options').querySelector('.prop-toggle');
    expect(toggle.textContent).toBe('show JSON');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('cuts a long string and opens it with more / less', async () => {
    await openProperties();
    const row = () => [...document.querySelectorAll('.prop-table tr')].find((tr) => tr.querySelector('th').textContent === 'Help text');
    expect(row().querySelector('.prop-text').textContent).toBe(`${LONG.slice(0, 80)}…`);
    row().querySelector('.prop-toggle').click();
    expect(row().querySelector('.prop-text').textContent).toBe(LONG);
    expect(row().querySelector('.prop-toggle').getAttribute('aria-expanded')).toBe('true');
    row().querySelector('.prop-toggle').click();
    expect(row().querySelector('.prop-text').textContent).toBe(`${LONG.slice(0, 80)}…`);
  });

  it('opens the JSON of a deep value and keeps it open across a poll', async () => {
    await openProperties();
    const row = () => rowOf('Remote options');
    expect(row().querySelector('.prop-tree')).toBeNull();
    row().querySelector('.prop-toggle').click();
    expect(row().querySelector('.prop-tree').textContent).toContain('level4');
    expect(row().querySelector('.prop-toggle').textContent).toBe('hide JSON');

    setData({ Intro: { Field: 'Grace' } });
    await advance(PULSE_MS);
    expect(row().querySelector('.prop-tree')).not.toBeNull();
  });

  it('hides the runtime keys behind Show internal (n)', async () => {
    await openProperties();
    expect(cells().map(([label]) => label)).not.toContain('lwcName');
    const toggle = document.querySelector('.prop-internal-toggle');
    expect(toggle.textContent).toBe('Show internal (2)');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    expect(cells().map(([label]) => label)).toEqual(expect.arrayContaining(['lwcName', '_lwcInternal']));
    expect(document.querySelector('.prop-internal-toggle').textContent).toBe('Hide internal (2)');
    expect(document.querySelector('.prop-internal-toggle').getAttribute('aria-pressed')).toBe('true');
  });

  it('narrows to the rows that match the detail filter', async () => {
    await openProperties();
    const find = document.querySelector('.detail-find');
    find.value = 'your name';
    find.dispatchEvent(new Event('input'));
    await advance(300);
    expect(cells().map(([label]) => label)).toEqual(['Label']);

    find.value = 'nothing like this';
    find.dispatchEvent(new Event('input'));
    await advance(300);
    expect(document.querySelector('.prop-table')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('Nothing here matches');
  });
});

describe('Property docs', () => {
  const rowFor = (label) => [...document.querySelectorAll('.prop-table > tbody > tr')]
    .find((tr) => tr.querySelector('th') && tr.querySelector('th').firstChild.textContent === label);
  const infoOf = (label) => rowFor(label).querySelector('.prop-info');

  it('puts what a setting means in the tooltip of its name and an i after it', async () => {
    await openProperties();
    const th = rowFor('Repeat limit').querySelector('th');
    expect(th.title).toMatch(/^repeatLimit: .*copies/);
    expect(infoOf('Repeat limit').title).toMatch(/copies/);
    expect(infoOf('Repeat limit').getAttribute('aria-label')).toBe('What Repeat limit means');
    expect(infoOf('Repeat limit').getAttribute('data-help')).toBe('Properties tab');
    expect(th.textContent).toBe('Repeat limit'); // the i adds no text
  });

  it('leaves a setting it does not know without an i or a tooltip', async () => {
    await openProperties();
    expect(infoOf('zeta')).toBeNull();
    expect(rowFor('zeta').querySelector('th').title).toBe('');
  });

  it('opens the explanation under the row and closes it again', async () => {
    await openProperties();
    expect(infoOf('Required').getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.prop-doc')).toBeNull();

    infoOf('Required').click();
    expect(infoOf('Required').getAttribute('aria-expanded')).toBe('true');
    expect(rowFor('Required').nextElementSibling.classList.contains('prop-doc-row')).toBe(true);
    expect(document.querySelector('.prop-doc').textContent).toMatch(/cannot go on/);
    expect(document.activeElement).toBe(infoOf('Required'));

    infoOf('Required').click();
    expect(document.querySelector('.prop-doc')).toBeNull();
    expect(infoOf('Required').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps an open explanation open across a poll, and drops it with the selection', async () => {
    await openProperties();
    infoOf('Required').click();
    setData({ Intro: { Field: 'Grace' } });
    await advance(PULSE_MS);
    expect(document.querySelector('.prop-doc')).not.toBeNull();

    clickRow('Kind');
    clickRow('Field');
    tabButton('Properties').click();
    expect(document.querySelector('.prop-doc')).toBeNull();
  });

  it('finds a setting by a word from its explanation when no name matches', async () => {
    await openProperties();
    const find = document.querySelector('.detail-find');
    find.value = 'copies';
    find.dispatchEvent(new Event('input'));
    await advance(300);
    expect(cells().map(([label]) => label)).toEqual(['Repeat limit']);
  });
});

describe('a property that starts with =', () => {
  const rowsFor = () => Object.fromEntries([...document.querySelectorAll('.prop-table > tbody > tr')]
    .map((tr) => [tr.querySelector('th').textContent, tr.querySelector('td')]));

  async function openWith(propSetMap) {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Banner', type: 'Text Block', propSetMap }
    ] }] }), data: { Intro: { Name: 'Ada' } } }] });
    clickRow('Banner');
    tabButton('Properties').click();
  }

  it('is shown as the text it is, unless the key takes formulas', async () => {
    await openWith({ hint: '="Hello " & %Intro:Name%', expression: '=1 + 2', remark: '=== Totals ===' });
    const rows = rowsFor();
    expect(rows.hint.querySelector('.msg-estimate').textContent).toBe('≈ “Hello Ada”');
    expect(rows.Formula.textContent).toBe('=1 + 2');
    expect(rows.Formula.querySelector('.msg-estimate')).toBeNull();
    expect(rows.remark.textContent).toBe('=== Totals ===');
    expect(rows.remark.querySelector('.msg-estimate')).toBeNull();
    expect(rows.remark.querySelector('details')).toBeNull();
  });
});
