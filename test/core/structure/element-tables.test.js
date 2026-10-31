'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { createReferences } from '../../../src/core/shared/references.js';
import { createEstimator } from '../../../src/core/structure/formula-values.js';
import {
  hasOptions, optionsState, optionsFinding, optionsTable, formulaTable, mergeFieldsTable, additionalInputTables, elementTables
} from '../../../src/core/structure/element-tables.js';
import { tableText, CANT_TELL } from '../../../src/core/structure/table-model.js';
import { detailTabs } from '../../../src/core/structure/detail-tabs.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });

function build(elements) {
  return flatten({ children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }] }, null);
}
const named = (list, name) => list.find((element) => element.name === name);
const texts = (table) => table.rows.map((row) => row.cells.map((cell) => cell.text));
/* A card of labelled rows as [label, value] pairs, a sub-heading as [heading]. */
const pairs = (table) => table.rows.map((row) => (row.heading !== undefined ? [row.heading] : [row.label.text, row.value.text]));

const OPTIONS = [{ name: 'GB', value: 'United Kingdom' }, { name: 'IE', value: 'Ireland' }, { name: 'FR', value: 'France' }];

describe('optionsTable', () => {
  const list = build([
    el('Country', 'Select', { options: OPTIONS }),
    el('Plan', 'Radio', { options: [{ name: 'Basic', value: 'Basic' }, { name: 'Plus', value: 'Plus' }] }),
    el('Extras', 'Multi-select', { options: [{ name: 'a', value: 'Alpha' }, { name: 'b', value: 'Beta' }, { name: 'c', value: 'Gamma' }] }),
    el('Agree', 'Checkbox', { options: OPTIONS }),
    el('Town', 'Type Ahead', { optionSource: { type: 'DataRaptor', source: 'Towns' }, options: OPTIONS }),
    el('Bare', 'Lookup', {}),
    el('Name', 'Text', { options: OPTIONS })
  ]);
  const table = (name, data) => optionsTable(named(list, name), data, {});

  it('applies to the choice elements that list options themselves', () => {
    expect(['Country', 'Plan', 'Extras'].map((name) => hasOptions(named(list, name)))).toEqual([true, true, true]);
    expect(['Agree', 'Town', 'Bare', 'Name'].map((name) => hasOptions(named(list, name)))).toEqual([false, false, false, false]);
    expect(optionsTable(named(list, 'Town'), {}, {})).toBeNull();
  });

  it('lists each option as label and value, and ticks the one the data holds', () => {
    const result = table('Country', { Intro: { Country: 'IE' } });
    expect(result.verdict).toBeUndefined();
    expect(result.tip).toMatch(/^Each option of the list/);
    expect(result.rows[0].cells[0].prose).toBe(true);
    expect(result.columns.map((column) => column.label)).toEqual(['Label', 'Value', 'Selected']);
    expect(texts(result)).toEqual([['United Kingdom', 'GB', ''], ['Ireland', 'IE', '✓'], ['France', 'FR', '']]);
    expect(result.rows.map((row) => row.tone)).toEqual(['', 'ok', '']);
  });

  it('ticks every option a Multi-select holds, from a list or from text with semicolons', () => {
    const fromList = table('Extras', { Intro: { Extras: ['a', 'c'] } });
    expect(texts(fromList).map((row) => row[2])).toEqual(['✓', '', '✓']);
    const fromText = table('Extras', { Intro: { Extras: 'b;c' } });
    expect(texts(fromText).map((row) => row[2])).toEqual(['', '✓', '✓']);
  });

  it('ticks nothing while the data holds nothing, and does not call that a finding', () => {
    const data = { Intro: { Country: '' } };
    expect(texts(table('Country', data)).map((row) => row[2])).toEqual(['', '', '']);
    expect(optionsFinding(named(list, 'Country'), data, {})).toBeNull();
    expect(optionsFinding(named(list, 'Country'), { Intro: {} }, {})).toBeNull();
    expect(optionsFinding(named(list, 'Country'), undefined, {})).toBeNull();
  });

  it('says none matches, and gives the head a finding, when the value is not an option', () => {
    const data = { Intro: { Country: 'XX' } };
    const result = table('Country', data);
    expect(texts(result).map((row) => row[2])).toEqual(['', '', '']);
    expect(result.verdict).toMatchObject({ text: 'No match', tone: 'warn' });
    expect(result.verdict.title).toMatch(/^None matches: the data holds “XX”, which is not an option/);
    expect(optionsFinding(named(list, 'Country'), data, {})).toMatchObject({ text: 'No option matches “XX”' });
  });

  it('names the held values that are not options, and ticks the ones that are', () => {
    const data = { Intro: { Extras: ['a', 'z'] } };
    expect(texts(table('Extras', data)).map((row) => row[2])).toEqual(['✓', '', '']);
    expect(optionsFinding(named(list, 'Extras'), data, {}).text).toBe('No option matches “z”');
  });

  it('ticks nothing and finds nothing in masked data (a bundle saved with Mask values on)', () => {
    const data = { Intro: { Country: '<string>', Extras: ['<string>', '<string>'] } };
    expect(texts(table('Country', data)).map((row) => row[2])).toEqual(['', '', '']);
    expect(table('Country', data).verdict).toMatchObject({ text: 'masked', tone: 'neutral' });
    expect(table('Country', data).verdict.title).toMatch(/^The data is masked, so which option it holds cannot be told/);
    expect(optionsFinding(named(list, 'Country'), data, {})).toBeNull();
    expect(optionsFinding(named(list, 'Extras'), data, {})).toBeNull();
    expect(optionsFinding(named(list, 'Country'), { Intro: { Country: '<number>' } }, {})).toBeNull();
  });

  it('takes the text people read as an option too, as the Value type hints do', () => {
    const data = { Intro: { Country: 'United Kingdom' } };
    expect(optionsFinding(named(list, 'Country'), data, {})).toBeNull();
    expect(texts(table('Country', data)).map((row) => row[2])).toEqual(['✓', '', '']);
  });

  it('reads { label, value } options the other way round', () => {
    const other = build([el('Size', 'Select', { options: [{ label: 'Small', value: 's' }, { label: 'Large', value: 'l' }] })]);
    const result = optionsTable(named(other, 'Size'), { Intro: { Size: 'l' } }, {});
    expect(texts(result)).toEqual([['Small', 's', ''], ['Large', 'l', '✓']]);
  });

  it('uses the label a multi-language script resolves, and copes with odd options', () => {
    const odd = build([el('Pick', 'Select', { options: [null, 5, { name: '', value: 'None' }, { name: 'x' }, { name: 'y', value: 'Why' }] })]);
    const result = optionsTable(named(odd, 'Pick'), {}, {});
    expect(texts(result)).toEqual([['None', '(empty)', ''], ['(empty)', 'x', ''], ['Why', 'y', '']]);
    expect(optionsState(named(odd, 'Pick'), {}, {}).options).toHaveLength(3);
  });

  it('follows the chosen row of a repeat block', () => {
    const rowsList = build([el('Pick', 'Select', { options: OPTIONS }, { JSONPath: 'Intro:Rows:Pick' })]);
    const data = { Intro: { Rows: [{ Pick: 'GB' }, { Pick: 'FR' }] } };
    expect(texts(optionsTable(named(rowsList, 'Pick'), data, { Rows: 1 })).map((row) => row[2])).toEqual(['✓', '', '']);
    expect(texts(optionsTable(named(rowsList, 'Pick'), data, { Rows: 2 })).map((row) => row[2])).toEqual(['', '', '✓']);
  });

  it('masks which option is held in a copy, and keeps the list', () => {
    const result = table('Country', { Intro: { Country: 'IE' } });
    expect(tableText(result)).toContain('Ireland\tIE\t✓');
    const masked = tableText(result, { mask: true });
    expect(masked).toContain('Ireland\tIE\t(masked)');
    expect(masked).toContain('France\tFR\t(masked)');
  });

  it('gives every row the same Selected text in a masked copy, so nothing names the held option', () => {
    const held = (value) => tableText(table('Country', { Intro: { Country: value } }), { mask: true });
    expect(held('IE')).toBe(held('FR'));
    expect(held('IE').split('\n').slice(2).map((line) => line.split('\t')[2])).toEqual(['(masked)', '(masked)', '(masked)']);
  });
});

describe('formulaTable', () => {
  const list = build([
    el('Qty', 'Number'), el('Price', 'Number'),
    el('Total', 'Formula', { expression: '%Qty% * %Price%' }),
    el('Gross', 'Formula', { expression: '%Total% + %Missing%' }),
    el('Broken', 'Formula', { expression: 'FOO(%Qty%)' }),
    el('Empty', 'Formula', { expression: '' })
  ]);
  const table = (name, data) => formulaTable(named(list, name), data, createReferences(list), {}, createEstimator(list, data));
  const data = { Intro: { Qty: 4, Price: 2.5 } };

  it('shows the expression, what it comes to (estimated) and, under Elements it reads, each element with its value', () => {
    const result = table('Total', data);
    expect(result.layout).toBe('rows');
    expect(pairs(result)).toEqual([
      ['Expression', '%Qty% * %Price%'], ['Computed value', '10'], ['Elements it reads'], ['Qty', '4'], ['Price', '2.5']
    ]);
    expect(result.rows[1].value).toMatchObject({ estimated: true, data: true, tag: { text: 'estimated ≈', tone: 'outline' } });
    expect(result.tip).toMatch(/^The expression, what it comes to now/);
  });

  it('links each element it reads, which selects it', () => {
    const result = table('Total', data);
    expect(result.rows[3].label.link).toEqual({ kind: 'element', key: named(list, 'Qty').key });
    expect(result.rows[3].label.title).toBe('Select Qty · Read by the formula');
  });

  it('reads another Formula element through its estimate, marked estimated', () => {
    const result = table('Gross', data);
    expect(result.rows[1].value.text).toBe(CANT_TELL);
    const read = result.rows.find((row) => row.label && row.label.text === 'Total');
    expect(read.value).toMatchObject({ text: '10', estimated: true, tag: { text: 'estimated ≈' } });
    const missing = result.rows.find((row) => row.label && row.label.text === 'Missing');
    expect(missing.value).toMatchObject({ text: 'not in data', tone: 'unknown' });
  });

  it("says can't tell, with the reason, when the formula does not evaluate and the data holds nothing for it", () => {
    const result = table('Broken', data);
    expect(result.rows[1].value).toMatchObject({ text: CANT_TELL, tone: 'unknown' });
    expect(result.rows[1].value.title).toBe('The formula could not be evaluated: Unknown function FOO');
  });

  it('shows what the data holds, tagged read from the data, when the formula does not evaluate but the data has its value', () => {
    const result = table('Broken', { Intro: { Qty: 4, Broken: 30 } });
    expect(result.rows[1].value).toMatchObject({ text: '30', data: true, tag: { text: 'read from the data', tone: 'neutral' } });
    expect(result.rows[1].value.tag.title).toBe('The panel cannot evaluate this formula (Unknown function FOO), so this is what the data holds for Broken.');
    expect(result.rows[1].value.estimated).toBe(false);
    expect(tableText(result).split('\n')[2]).toBe('Computed value\t30 · read from the data');
  });

  it('is null for an element that is no Formula one, or has no expression', () => {
    expect(table('Qty', data)).toBeNull();
    expect(table('Empty', data)).toBeNull();
  });

  it('masks what it comes to and what the fields hold in a copy', () => {
    const masked = tableText(table('Total', data), { mask: true });
    expect(masked).not.toContain('10');
    expect(masked).toContain('Computed value\t"<number>" · estimated ≈');
  });
});

describe('mergeFieldsTable', () => {
  const list = build([
    el('Name', 'Text'), el('City', 'Text'),
    el('Hello', 'Text Block', { text: '<p>Hello %Name% from %City%, %Name%!</p>' }),
    el('Plain', 'Text Block', { text: 'No fields here' }),
    el('Title', 'Headline', { label: 'Welcome %Name%' }),
    el('Notice', 'Messaging', { messages: [{ type: 'Info', text: 'Hi %Name%' }, { type: 'Warning', text: '=%City% & "!"' }] }),
    el('Input', 'Text', { label: 'Input %Name%' })
  ]);
  const table = (name, data) => mergeFieldsTable(named(list, name), data, createReferences(list), {}, createEstimator(list, data));
  const data = { Intro: { Name: 'Ada', City: 'London' } };

  it('lists each merge field a Text Block reads once, in reading order, with its value now', () => {
    expect(texts(table('Hello', data))).toEqual([['Name', '"Ada"'], ['City', '"London"']]);
    expect(table('Hello', data).rows[0].cells[0].link).toEqual({ kind: 'element', key: named(list, 'Name').key });
  });

  it('puts the label of the element a field names before its name', () => {
    const labelled = build([el('Dob', 'Date', { label: 'Date of birth' }), el('Line', 'Text Block', { text: 'Born %Dob%' })]);
    const result = mergeFieldsTable(named(labelled, 'Line'), { Intro: { Dob: '2000-01-01' } }, createReferences(labelled), {}, createEstimator(labelled, {}));
    expect(result.rows[0].cells[0]).toMatchObject({ text: 'Dob', label: 'Date of birth', link: { kind: 'element' } });
  });

  it('says not in data for a field the data does not hold, and can\'t tell when there is no data', () => {
    expect(texts(table('Hello', { Intro: { Name: 'Ada' } }))).toEqual([['Name', '"Ada"'], ['City', 'not in data']]);
    expect(texts(table('Hello', undefined))).toEqual([['Name', CANT_TELL], ['City', CANT_TELL]]);
  });

  it('reads a Headline and the messages of a Messaging element, formulas too', () => {
    expect(texts(table('Title', data))).toEqual([['Name', '"Ada"']]);
    expect(texts(table('Notice', data))).toEqual([['Name', '"Ada"'], ['City', '"London"']]);
  });

  it('is null for a text with no merge fields and for an element that is not a text', () => {
    expect(table('Plain', data)).toBeNull();
    expect(table('Input', data)).toBeNull();
    expect(table('Name', data)).toBeNull();
  });

  it('masks the values in a copy', () => {
    const masked = tableText(table('Hello', data), { mask: true });
    expect(masked).not.toContain('Ada');
    expect(masked).toContain('Name\t"<string>"');
  });
});

describe('additionalInputTables', () => {
  const list = build([
    el('Name', 'Text'),
    el('Call', 'Integration Procedure Action', {
      integrationProcedureKey: 'Acme_Find',
      extraPayload: { Mode: 'full', Who: '%Name%', Count: 3, Flag: false, Nested: { A: '%Name%' }, Calc: '=%Name% & "!"' },
      remoteOptions: { chainable: true, useQueueableApexRemoting: false }
    }),
    el('Json', 'Remote Action', { remoteClass: 'Acme', extraPayload: '{"K":"v"}' }),
    el('Plain', 'Remote Action', { remoteClass: 'Acme' }),
    el('Odd', 'Remote Action', { remoteClass: 'Acme', extraPayload: '[1]', remoteOptions: 'nope' }),
    el('NotRemote', 'Text', { extraPayload: { A: 1 } })
  ]);
  const tables = (name, data) => additionalInputTables(named(list, name), data, createReferences(list), {}, createEstimator(list, data));
  const data = { Intro: { Name: 'Ada' } };

  it('lists the extra input as name, value as written and what it comes to now', () => {
    const [extra] = tables('Call', data);
    expect(extra.rows[5].cells[2].tag).toMatchObject({ text: 'estimated ≈' });
    expect(extra.title).toBe('Additional input');
    expect(extra.columns.map((column) => column.label)).toEqual(['Name', 'Value', 'Computed value']);
    expect(texts(extra)).toEqual([
      ['Mode', 'full', '"full"'],
      ['Who', '%Name%', '"Ada"'],
      ['Count', '3', '3'],
      ['Flag', 'false', 'false'],
      ['Nested', '{"A":"%Name%"}', '{"A":"Ada"}'],
      ['Calc', '=%Name% & "!"', '"Ada!"']
    ]);
  });

  it('lists the remote options as a card of their own', () => {
    const result = tables('Call', data);
    expect(result.map((table) => table.id)).toEqual(['extra-input', 'remote-options']);
    expect(texts(result[1])).toEqual([['chainable', 'true', 'true'], ['useQueueableApexRemoting', 'false', 'false']]);
  });

  it('reads JSON text, and gives nothing for an action that sets none or an odd shape', () => {
    expect(texts(tables('Json', data)[0])).toEqual([['K', 'v', '"v"']]);
    expect(tables('Plain', data)).toEqual([]);
    expect(tables('Odd', data)).toEqual([]);
    expect(tables('NotRemote', data)).toEqual([]);
  });

  it("says can't tell when a field has no value or no data was read", () => {
    const missing = tables('Call', { Intro: {} })[0];
    expect(missing.rows[1].cells[2]).toMatchObject({ text: CANT_TELL });
    expect(missing.rows[1].cells[2].title).toBe('No value yet for %Name%');
    const none = tables('Call', undefined)[0];
    expect(none.rows[0].cells[2].text).toBe(CANT_TELL);
  });

  it('masks what the data fills in, in a copy', () => {
    const masked = tableText(tables('Call', data)[0], { mask: true });
    expect(masked).not.toContain('Ada');
    expect(masked).toContain('Who\t%Name%\t"<string>"');
    expect(masked).toContain('Nested\t{"A":"%Name%"}\t(masked)');
  });

  it('keeps a literal of the definition in a masked copy, and masks only what a field filled in', () => {
    const masked = tableText(tables('Call', data)[0], { mask: true });
    expect(masked).toContain('Mode\tfull\t"full"');
    expect(masked).toContain('Count\t3\t3');
  });

  it('fills a nested value in leaf by leaf, so a quote in the data cannot break the JSON', () => {
    const quoted = { Intro: { Name: 'Ada "the} one' } };
    const [extra] = tables('Call', quoted);
    const nested = extra.rows[4].cells[2].text;
    expect(() => JSON.parse(nested)).not.toThrow();
    expect(JSON.parse(nested)).toEqual({ A: 'Ada "the} one' });
  });
});

describe('elementTables', () => {
  const list = build([
    el('Name', 'Text'), el('Fill', 'Set Values', { elementValueMap: { Name: 'x' } }),
    el('Total', 'Formula', { expression: '1 + 1' }), el('Pick', 'Select', { options: OPTIONS }),
    el('Hello', 'Text Block', { text: '%Name%' }), el('Call', 'Remote Action', { remoteClass: 'A', extraPayload: { K: 1 } })
  ]);
  const ids = (tab, name, data = { Intro: { Name: 'Ada' } }) => elementTables({
    tab, element: named(list, name), data, refs: createReferences(list), rows: {}, estimator: createEstimator(list, data)
  }).map((table) => table.id);

  it('picks the cards each tab starts with', () => {
    expect(ids('value', 'Fill')).toEqual(['set-values']);
    expect(ids('value', 'Total')).toEqual(['formula']);
    expect(ids('options', 'Pick')).toEqual(['options']);
    expect(ids('props', 'Hello')).toEqual(['merge-fields']);
    expect(ids('calls', 'Call')).toEqual(['extra-input']);
  });

  it('gives nothing for a tab without a card, or an element without a table', () => {
    expect(ids('definition', 'Fill')).toEqual([]);
    expect(ids('value', 'Name')).toEqual([]);
    expect(ids('props', 'Name')).toEqual([]);
    expect(elementTables({ tab: 'value', element: null })).toEqual([]);
  });
});

describe('the tabs the cards add', () => {
  const list = build([el('Pick', 'Select', { options: OPTIONS }), el('Total', 'Formula', { expression: '1 + 1' })]);
  const ids = (tabs) => tabs.map((tab) => tab.id);

  it('adds an Options tab after the value, with the Opts. short name and an icon', () => {
    const tabs = detailTabs({ element: named(list, 'Pick'), value: 'GB', optionsCount: 3, propsCount: 2 });
    expect(ids(tabs)).toEqual(['value', 'options', 'props', 'definition']);
    expect(tabs[1]).toMatchObject({ label: 'Options', icon: 'options', enabled: true });
    expect(ids(detailTabs({ element: named(list, 'Pick'), optionsCount: 3 }))).toEqual(['options', 'definition']);
    expect(ids(detailTabs({ element: named(list, 'Pick'), value: 'GB' }))).toEqual(['value', 'definition']);
  });

  it('keeps Current value for a Formula element even while neither the data nor the estimate gives a value', () => {
    expect(ids(detailTabs({ element: named(list, 'Total'), formula: true }))).toEqual(['value', 'definition']);
    expect(ids(detailTabs({ element: named(list, 'Total') }))).toEqual(['definition']);
  });
});
