'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { formRows, filterFormRows, hasFormView, viewOf, MAX_FORM_ROWS, VIEWS } from '../../../src/core/structure/form-rows.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });

const elements = flatten({ children: [
  { name: 'Intro', type: 'Step', propSetMap: { label: 'Introduction' }, children: [{ eleArray: [
    el('First', 'Text', { label: 'First name' }),
    el('Age', 'Number', { label: 'Age' }),
    el('Agree', 'Checkbox', { label: 'I agree' }),
    el('Nick', 'Text', {}),
    el('Dependants', 'Edit Block', { label: 'Dependants' }, { children: [{ eleArray: [
      el('DepName', 'Text', { label: 'Dependant name' }), el('DepAge', 'Number', {})
    ] }] }),
    el('Prefs', 'Block', { label: 'Preferences' }, { children: [{ eleArray: [el('Colour', 'Text', { label: 'Favourite colour' })] }] })
  ] }] },
  { name: 'Other', type: 'Step', propSetMap: {}, children: [{ eleArray: [] }] }
] }, null);
const byName = (name) => elements.find((element) => element.name === name);

const VALUE = {
  First: 'Ada', Age: 36, Agree: true, Nick: null, ContextNote: '', Extra: { A: 1, B: { C: 2 } },
  Dependants: [{ DepName: 'Bea', DepAge: 4 }, { DepName: 'Cy', DepAge: 7, Tags: ['x', 'y'] }],
  Prefs: { Colour: 'green' }
};

const run = (value = VALUE, open = []) => formRows(byName('Intro'), value, elements, (id) => open.includes(id));
const summary = (result) => result.rows.map((row) => [row.depth, row.label, row.kind, row.text]);

describe('hasFormView', () => {
  it('is for a step or a block whose value holds keys or rows', () => {
    expect(hasFormView(byName('Intro'), VALUE)).toBe(true);
    expect(hasFormView(byName('Dependants'), [{}])).toBe(true);
    expect(hasFormView(byName('Prefs'), { Colour: 'x' })).toBe(true);
  });

  it('is not for a field, a scalar, or no value', () => {
    expect(hasFormView(byName('First'), { A: 1 })).toBe(false);
    expect(hasFormView(byName('Intro'), 'text')).toBe(false);
    expect(hasFormView(byName('Intro'), undefined)).toBe(false);
    expect(hasFormView(null, {})).toBe(false);
  });
});

describe('viewOf', () => {
  it('keeps a known pick and falls back to the form', () => {
    expect(VIEWS).toEqual(['form', 'tree', 'raw']);
    expect(viewOf('form')).toBe('form');
    expect(viewOf('raw')).toBe('raw');
    expect(viewOf(undefined)).toBe('form');
    expect(viewOf('other')).toBe('form');
  });
});

describe('formRows', () => {
  it('names the element after a label of its own, and nothing after a key or a row', () => {
    const result = run();
    expect(result.rows.map((row) => [row.label, row.name])).toEqual(expect.arrayContaining([
      ['First name', 'First'], ['I agree', 'Agree'], ['Nick', ''], ['Dependants', ''], ['Preferences', 'Prefs']
    ]));
    expect(result.rows.find((row) => row.label === 'Age').name).toBe(''); // the label is the key itself
  });

  it('labels a key with the label of the element that owns it, else the key', () => {
    const result = run();
    expect(summary(result)).toEqual([
      [0, 'First name', 'text', 'Ada'],
      [0, 'Age', 'number', '36'],
      [0, 'I agree', 'bool', 'true'],
      [0, 'Nick', 'empty', ''],
      [0, 'ContextNote', 'text', ''],
      [0, 'Extra', 'group', '2 items'],
      [0, 'Dependants', 'group', '2 items'],
      [0, 'Preferences', 'group', '1 item']
    ]);
  });

  it('writes a boolean as a word and a number as it is, and null as an empty field', () => {
    const rows = run({ Agree: false, Age: 0, Nick: null }).rows;
    expect(rows.map((row) => row.text)).toEqual(['false', '0', '']);
    expect(rows.map((row) => row.kind)).toEqual(['bool', 'number', 'empty']);
  });

  it('says in the tooltip which key it is and what element owns it', () => {
    const rows = run().rows;
    expect(rows[0].title).toBe('First · Text');
    expect(rows[4].title).toBe('ContextNote');
  });

  it('opens an object or list in place, one level at a time, indenting what is nested', () => {
    const ids = run().rows.filter((row) => row.kind === 'group').map((row) => row.id);
    expect(ids).toEqual(['Extra', 'Dependants', 'Prefs']);
    const open = run(VALUE, ['Extra', 'Dependants']);
    expect(summary(open).slice(5)).toEqual([
      [0, 'Extra', 'group', '2 items'],
      [1, 'A', 'number', '1'],
      [1, 'B', 'group', '1 item'],
      [0, 'Dependants', 'group', '2 items'],
      [1, 'Row 1', 'group', '2 items'],
      [1, 'Row 2', 'group', '3 items'],
      [0, 'Preferences', 'group', '1 item']
    ]);
    expect(open.rows.filter((row) => row.open).map((row) => row.id)).toEqual(['Extra', 'Dependants']);
  });

  it('names the fields inside a row of a block after the block\'s own elements, and a list in a row Item', () => {
    const open = run(VALUE, ['Dependants', ['Dependants', '1'].join('\u001f'), ['Dependants', '1', 'Tags'].join('\u001f')]);
    const inside = summary(open).filter((row) => row[0] >= 2);
    expect(inside).toEqual([
      [2, 'Dependant name', 'text', 'Cy'],
      [2, 'DepAge', 'number', '7'],
      [2, 'Tags', 'group', '2 items'],
      [3, 'Item 1', 'text', 'x'],
      [3, 'Item 2', 'text', 'y']
    ]);
  });

  it('opens a group only when it holds something', () => {
    const rows = run({ Empty: {}, EmptyList: [] }, ['Empty']).rows;
    expect(rows.map((row) => [row.canOpen, row.open, row.text])).toEqual([[false, false, '0 items'], [false, false, '0 items']]);
  });

  it('lays out a block\'s rows as the first level of a list value', () => {
    const result = formRows(byName('Dependants'), VALUE.Dependants, elements, (id) => id === '0');
    expect(summary(result)).toEqual([
      [0, 'Row 1', 'group', '2 items'],
      [1, 'Dependant name', 'text', 'Bea'],
      [1, 'DepAge', 'number', '4'],
      [0, 'Row 2', 'group', '3 items']
    ]);
  });

  it('reads an unowned level without labels, and a value that is not an object as nothing', () => {
    const result = formRows(byName('Intro'), { Stray: { First: 'x' } }, elements, () => true);
    expect(summary(result)).toEqual([[0, 'Stray', 'group', '1 item'], [1, 'First', 'text', 'x']]);
    expect(formRows(byName('Other'), {}, elements).rows).toEqual([]);
  });

  it('stops at a number of rows and says how many it left out', () => {
    const big = {};
    for (let i = 0; i < MAX_FORM_ROWS + 25; i++) big[`K${i}`] = i;
    const result = run(big);
    expect(result.rows).toHaveLength(MAX_FORM_ROWS);
    expect(result.truncated).toBe(25);
  });

  it('keeps the key order of the data', () => {
    expect(run({ b: 1, a: 2 }).rows.map((row) => row.label)).toEqual(['b', 'a']);
  });
});

describe('a list row that carries an Id', () => {
  const SEP = '\u001f';
  const rowsOf = (list, open) => formRows(byName('Intro'), { Dependants: list }, elements, (id) => open.includes(id));
  const rowRow = (result, label) => result.rows.find((row) => row.label === label);

  it('is known by its Id, so an open row stays with its data when a row before it leaves', () => {
    const bea = { Id: 'a1', DepName: 'Bea' };
    const cy = { Id: 'a2', DepName: 'Cy' };
    // Both rows are groups; open the second one (Cy)
    const cyId = rowRow(rowsOf([bea, cy], ['Dependants']), 'Row 2').id;
    expect(cyId).toBe(['Dependants', '#a2'].join(SEP));
    expect(rowRow(rowsOf([bea, cy], ['Dependants', cyId]), 'Row 2').open).toBe(true);
    // Bea leaves: Cy is now Row 1 and is still the open one
    const after = rowsOf([cy], ['Dependants', cyId]);
    expect(rowRow(after, 'Row 1')).toMatchObject({ id: cyId, open: true });
  });

  it('falls back to positions when an Id is missing or repeats', () => {
    expect(rowRow(rowsOf([{ Id: 'x', A: 1 }, { A: 2 }], ['Dependants']), 'Row 2').id).toBe(['Dependants', '1'].join(SEP));
    expect(rowRow(rowsOf([{ Id: 'x', A: 1 }, { Id: 'x', A: 2 }], ['Dependants']), 'Row 2').id).toBe(['Dependants', '1'].join(SEP));
  });
});

describe('filterFormRows', () => {
  it('keeps the rows whose label or key contains the text, any case, and counts them', () => {
    const result = filterFormRows(run(), 'NAME');
    expect(result.rows.map((row) => row.label)).toEqual(['First name']);
    expect(result).toMatchObject({ total: 8, filtered: true });
    expect(filterFormRows(run(), 'nick').rows.map((row) => row.key)).toEqual(['Nick']); // by key, no label of its own
  });

  it('keeps every row for an empty or blank filter', () => {
    const result = filterFormRows(run(), '  ');
    expect(result.rows).toHaveLength(run().rows.length);
    expect(result.filtered).toBe(false);
  });

  it('follows the groups that are open', () => {
    expect(filterFormRows(run(VALUE, ['Dependants', 'Dependants\u001f0', 'Dependants\u001f1']), 'Dependant name').rows).toHaveLength(2);
    expect(filterFormRows(run(VALUE, ['Dependants']), 'Dependant name').rows).toHaveLength(0); // the rows are still closed
    expect(filterFormRows(run(), 'Dependant name').rows).toHaveLength(0);
  });
});
