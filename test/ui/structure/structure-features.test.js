'use strict';

/* Structure 1.6: Problems, live validation, Set Values resolution,
 * repeat rows, clickable rules and the count on the current step. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, rowNames, selectedRowText, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });
const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name').textContent.startsWith(name));
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const bodyText = () => document.querySelector('#struct-detail .detail-body').textContent;
/* The verdict of the card on show: its tag's tooltip is the sentence the head says. */
const whyText = () => document.querySelector('#struct-detail .fc-card > .fc-head .fc-tag').title;
/* The conditions of a card as [mark, field, must be, is now]. */
const leafRows = () => [...document.querySelectorAll('.fc-cond .fc-main')]
  .map((row) => [...row.children].map((cell) => cell.textContent));
/* The labelled rows of the card on show as [label, value]. */
const factRows = () => [...document.querySelectorAll('#struct-detail .fc-card .fc-row')]
  .map((row) => [row.querySelector('.fc-label').textContent, row.querySelector('.fc-value').textContent]);

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

const boot = (steps, data = {}, extra = {}) => bootStructure({
  scripts: [{ id: 'main', def: definition({ steps, ...extra }), data }]
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('live validation', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Age', type: 'Number' },
    { name: 'Notice', type: 'Messaging', propSetMap: {
      validateExpression: rule('Intro:Age', '>', 17),
      messages: [
        { type: 'Requirement', text: 'Adults only', value: false, active: true },
        { type: 'Info', text: 'Welcome', value: true, active: true }
      ]
    } }
  ] }];

  it('says what the expression is now, which message is active and whether it blocks', async () => {
    await boot(steps(), { Intro: { Age: 5 } });
    clickRow('Notice');
    tabButton('Validation').click();
    expect(whyText()).toBe('Expression is false · shown: Requirement “Adults only”');
    expect(document.querySelector('#struct-detail .fc-head .fc-tag').textContent).toBe('Fails');
    expect(document.querySelector('#struct-detail .detail-head .detail-chip')).toBeNull(); // the card says it, once
    expect(leafRows()).toEqual([['○', 'Age', '> 17', '5']]);
    expect(document.querySelector('.fc-cond .fc-mark-glyph').classList.contains('is-block')).toBe(false); // the dot is neutral; the verdict carries the colour
    expect(factRows()).toEqual([
      ['Shows', 'Adults only'], ['Kind', 'Requirement, which blocks Next'], ['If it passes', 'Info: “Welcome”'],
      ['As written', 'Intro:Age > 17']
    ]);
  });

  it('follows the data and makes the field a button', async () => {
    await boot(steps(), { Intro: { Age: 5 } });
    clickRow('Notice');
    tabButton('Validation').click();

    setData({ Intro: { Age: 40 } });
    await advance(PULSE_MS);
    expect(whyText()).toBe('Expression is true · shown: Info “Welcome”');
    expect(leafRows()).toEqual([['●', 'Age', '> 17', '40']]);
    expect(factRows().slice(0, 3)).toEqual([['Shows', 'Welcome'], ['Kind', 'Info, which does not block Next'], ['If it fails', 'Requirement: “Adults only”']]);

    document.querySelector('.fc-cond .fc-link').click();
    expect(selectedRowText()).toContain('Age');
  });

  it('says a formula expression cannot be judged', async () => {
    const formula = steps();
    formula[0].elements[1].propSetMap.validateExpression = 'Age > 17';
    await boot(formula, { Intro: { Age: 5 } });
    clickRow('Notice');
    tabButton('Validation').click();
    expect(whyText()).toContain('formula');
  });
});

describe('Set Values resolution', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'First' }, { name: 'Last' }, { name: 'Full' },
    { name: 'Fill', type: 'Set Values', propSetMap: { elementValueMap: { Full: '%First% %Last%' } } }
  ] }];

  it('shows one row per assignment: target, expression as written, what it comes to, what the target holds, and a differs marker', async () => {
    await boot(steps(), { Intro: { First: 'Ada', Last: 'Byron', Full: 'Ada Lovelace' } });
    clickRow('Fill');
    tabButton('Set Values').click();
    const cells = [...document.querySelectorAll('.fc-card[data-card="set-values"] tbody tr')]
      .map((row) => [...row.children].map((cell) => cell.textContent));
    expect(cells).toEqual([['Full', '%First% %Last%', '"Ada Byron"', '"Ada Lovelace"differs']]);
    expect(bodyText()).toContain('differs');

    setData({ Intro: { First: 'Ada', Last: 'Lovelace', Full: 'Ada Lovelace' } });
    await advance(PULSE_MS);
    expect(bodyText()).not.toContain('differs');
  });
});

describe('repeat rows', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Rows', type: 'Block', JSONPath: 'Intro:Rows', propSetMap: { repeat: true }, elements: [
      { name: 'Qty', type: 'Number', JSONPath: 'Intro:Rows|1:Qty', propSetMap: { required: true } }
    ] }
  ] }];
  const data = { Intro: { Rows: [{ Qty: 1 }, { Qty: '' }, { Qty: 3 }] } };

  it('has no Value column in the list: the rows are read in the detail head', async () => {
    await boot(steps(), data);
    expect(rowOf('Qty').querySelector('.el-value')).toBeNull();
    expect(document.querySelector('#struct-list .el-head .el-value')).toBeNull();
  });

  it('steps through the rows in the detail head, and the value follows', async () => {
    await boot(steps(), data);
    clickRow('Qty');
    const label = () => document.querySelector('.row-label').textContent;
    expect(label()).toBe('Row 1 of 3');
    expect(document.querySelector('.detail-line').textContent).toContain('Row 1 of 3');

    document.querySelector('[aria-label="Next row"]').click();
    expect(label()).toBe('Row 2 of 3');
    document.querySelector('[aria-label="Next row"]').click();
    expect(label()).toBe('Row 3 of 3');
    expect(document.querySelector('[aria-label="Next row"]').disabled).toBe(true);
    tabButton('Current value').click();
    expect(bodyText()).toContain('3');
    document.querySelector('[aria-label="Previous row"]').click();
    expect(bodyText()).not.toContain('3');
  });

  it('shows no stepper for an element outside a repeat block', async () => {
    await boot([{ name: 'Intro', elements: [{ name: 'Solo' }] }], { Intro: { Solo: 'x' } });
    clickRow('Solo');
    expect(document.querySelector('.row-stepper')).toBeNull();
  });
});

describe('clickable rules and links', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Kind' },
    { name: 'Company', propSetMap: { show: rule('Intro:Kind', '=', 'Business') } },
    { name: 'Tax', propSetMap: { show: rule('Kind', '=', 'Business') } }
  ] }];

  it('makes the field of each rule a button that selects the element', async () => {
    await boot(steps(), { Intro: { Kind: 'Person' } });
    clickRow('Company');
    tabButton('Visibility').click();
    document.querySelector('.fc-cond .fc-link').click();
    expect(selectedRowText()).toContain('Kind');
  });

  it('keeps the head to one compact line, with no links in it', async () => {
    await boot(steps(), { Intro: { Kind: 'Person' } });
    clickRow('Company');
    expect(document.querySelector('.detail-context')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-head').textContent).not.toContain('Depends on');
    expect(rowNames().length).toBeGreaterThan(0);
  });
});

describe('rules as a table', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Kind' },
    { name: 'Age', type: 'Number' },
    { name: 'Fill', type: 'Set Values', propSetMap: { elementValueMap: { Kind: '=Age + 1' } } },
    { name: 'Company', propSetMap: { show: { group: { operator: 'AND', rules: [
      { field: 'Intro:Age', condition: '>', data: '18' },
      { group: { operator: 'OR', rules: [
        { field: 'Intro:Kind', condition: '=', data: 'Business' },
        { field: 'Intro:Kind', condition: '=', data: 'Trust' }
      ] } }
    ] } } } }
  ] }];
  const rawDetails = () => document.querySelector('#struct-detail details.raw-rule');

  it('draws a show rule as one table: a mark, field, must be, is now, with a reading of each group', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Company');
    tabButton('Visibility').click();
    const heads = [...document.querySelectorAll('.fc-cond th[scope="col"]')].map((n) => n.textContent);
    expect(heads).toEqual(['Met', 'Field', 'Must be', 'Is now']);

    const groups = [...document.querySelectorAll('.fc-cond .fc-group-row')].map((n) => n.textContent.trim());
    expect(groups).toEqual(['All of these must be true; 1 of 2 is not', '○ One of these must be true; none is']);
    expect(leafRows()).toEqual([
      ['●', 'Age', '> 18', '30'],
      ['○', 'Kind', '= "Business"', '"Person"'],
      ['○', 'Kind', '= "Trust"', '"Person"']
    ]);

    const depths = [...document.querySelectorAll('.fc-cond .fc-main, .fc-cond .fc-group-row')].map((row) => row.style.getPropertyValue('--depth'));
    expect(depths).toEqual(['0', '0', '0', '1', '1']);
  });

  it('uses the same verdict sentence in the row tooltip', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    expect(rowOf('Company').querySelector('.tag-cond')).toBeNull(); // hidden: the closed eye alone
    const title = rowOf('Company').querySelector('.tag-hidden').title;
    expect(title.split('\n')[0]).toBe('Hidden by its show rule: 1 of 2 conditions fails');
    expect(title.split('\n')[1]).toContain('Shown when: Intro:Age > "18"');
  });

  it('spells out an empty value, a name that is not in the data and a rule it cannot judge', async () => {
    await boot([{ name: 'Intro', elements: [
      { name: 'Kind' },
      { name: 'Other', propSetMap: { show: { operator: 'AND', rules: [
        { field: 'Intro:Kind', condition: '<>', data: '' },
        { field: 'Intro:Missing', condition: '=', data: 'x' },
        { field: 'Intro:Kind', condition: '=', data: '=FOO(1)' }
      ] } } }
    ] }], { Intro: { Kind: '' } });
    clickRow('Other');
    tabButton('Visibility').click();
    expect(leafRows()).toEqual([
      ['○', 'Kind', '≠ ""', 'empty'],
      ['○', 'Missing', '= "x"', 'not in data'],
      ['?', 'Kind', '= (formula)', "can't tell"]
    ]);
    expect(document.querySelectorAll('.fc-cond .fc-main .fc-col-now .fc-unknown')).toHaveLength(3);
  });

  it('has no raw JSON fold: the JSON tab holds the JSON', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Company');
    tabButton('Visibility').click();
    expect(rawDetails()).toBeNull();
    tabButton('JSON').click();
    expect(document.querySelector('#struct-detail .seg-btn.is-on .btn-label').textContent).toBe('JSON');
  });

  it('keeps following the data on the card', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Company');
    tabButton('Visibility').click();
    setData({ Intro: { Kind: 'Trust', Age: 30 } });
    await advance(PULSE_MS);
    expect(leafRows()[1]).toEqual(['○', 'Kind', '= "Business"', '"Trust"']);
    expect(leafRows()[2]).toEqual(['●', 'Kind', '= "Trust"', '"Trust"']);
  });

  it('does not rebuild the rules when a poll changes nothing they show', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Company');
    tabButton('Visibility').click();
    const tree = document.querySelector('.fc-cond');
    setData({ Intro: { Kind: 'Person', Age: 30, Other: 1 } });
    await advance(PULSE_MS);
    expect(document.querySelector('.fc-cond')).toBe(tree);
  });

  it('does not rebuild the Current value tab when only other data changes, and does when its value does', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Kind');
    const body = document.querySelector('#struct-detail .detail-body');
    expect(bodyText()).toContain('Person');

    setData({ Intro: { Kind: 'Person', Age: 31, Other: 1 } });
    await advance(PULSE_MS);
    expect(document.querySelector('#struct-detail .detail-body')).toBe(body);

    setData({ Intro: { Kind: 'Business', Age: 31 } });
    await advance(PULSE_MS);
    expect(document.querySelector('#struct-detail .detail-body')).not.toBe(body);
    expect(bodyText()).toContain('Business');
  });

  it('shows a Set Values formula as (formula) only', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Age: 30 } });
    clickRow('Fill');
    tabButton('Set Values').click();
    const cells = [...document.querySelector('.fc-card[data-card="set-values"] tbody tr').children].map((cell) => cell.textContent);
    expect(cells).toEqual(['Kind', '=Age + 1', "can't tell", '"Person"']);
  });
});
