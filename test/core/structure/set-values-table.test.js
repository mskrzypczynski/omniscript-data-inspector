'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { createReferences } from '../../../src/core/shared/references.js';
import { createEstimator } from '../../../src/core/structure/formula-values.js';
import { setValuesTable } from '../../../src/core/structure/set-values.js';
import { tableText, cellText, CANT_TELL } from '../../../src/core/structure/table-model.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });

function build(elements) {
  return flatten({ children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }] }, null);
}
const named = (list, name) => list.find((element) => element.name === name);

const FILL = el('Fill', 'Set Values', { elementValueMap: {
  Full: '%First% %Last%', Age: '%Years%', Tag: 'fixed', Calc: '=%First% & "x"', Broken: '=FOO(%First%)', Gap: '%Nothing%'
} });

function table(data, rows = {}, elements = [el('First', 'Text'), el('Last', 'Text'), el('Full', 'Text'), el('Age', 'Number'), FILL]) {
  const list = build(elements);
  return setValuesTable(named(list, 'Fill'), data, createReferences(list), rows, createEstimator(list, data));
}
const rowOf = (result, target) => result.rows.find((row) => row.cells[0].text === target);

describe('setValuesTable', () => {
  const data = { Intro: { First: 'Ada', Last: 'Lovelace', Full: 'Ada Byron', Years: 36, Age: 36 } };

  it('has a row per assignment with Target, Expression, Computed value and Current value', () => {
    const result = table(data);
    expect(result.columns.map((entry) => entry.label)).toEqual(['Target', 'Expression', 'Computed value', 'Current value']);
    expect(result.rows).toHaveLength(6);
    const full = rowOf(result, 'Full');
    expect(full.cells.map((cell) => cell.text)).toEqual(['Full', '%First% %Last%', '"Ada Lovelace"', '"Ada Byron"']);
    expect(full.tone).toBe('differs');
  });

  it('shows a target that is an element by its name, as a link that selects it, whether or not the data holds it', () => {
    const result = table(data);
    expect(rowOf(result, 'Full').cells[0].link).toMatchObject({ kind: 'element' });
    expect(rowOf(result, 'Full').cells[0].title).toBe('Select Full · Where the value is written');
    const noData = table({ Intro: { First: 'Ada' } });
    expect(rowOf(noData, 'Full').cells[0].link).toMatchObject({ kind: 'element' });
    expect(rowOf(noData, 'Tag').cells[0].link).toBeUndefined();
  });

  it('names a target written as a path by its element, with the path in the tooltip and the copy', () => {
    const elements = [el('Full', 'Text'), el('Fill', 'Set Values', { elementValueMap: { 'Intro:Full': 'x' } })];
    const result = table(data, {}, elements);
    expect(result.rows[0].cells[0]).toMatchObject({ text: 'Full', copy: 'Intro:Full' });
    expect(result.rows[0].cells[0].title).toBe('Select Full · Intro:Full · Where the value is written');
    expect(tableText(result).split('\n')[2].split('\t')[0]).toBe('Intro:Full');
  });

  it('keeps the type of a single merge field and does not mark equal values as differing', () => {
    const age = rowOf(table(data), 'Age');
    expect(age.cells.map((cell) => cell.text)).toEqual(['Age', '%Years%', '36', '36']);
    expect(age.tone).toBe('');
  });

  it('tags a formula estimated ≈ and compares the estimate with what the target holds', () => {
    const calc = rowOf(table({ Intro: { First: 'Ada', Last: 'L', Calc: 'old' } }), 'Calc');
    expect(calc.cells[2]).toMatchObject({ text: '"Adax"', estimated: true, data: true, tag: { text: 'estimated ≈', tone: 'outline' } });
    expect(calc.cells[2].tag.title).toMatch(/Estimated/);
    expect(calc.tone).toBe(''); // an estimate is no ground for an amber row
    expect(calc.cells[3].tag).toMatchObject({ text: 'differs', tone: 'warn' });
    expect(calc.cells[3].tag.title).toMatch(/estimate/);
  });

  it('tags an exact value that differs from what the target holds "differs", in amber', () => {
    const full = rowOf(table(data), 'Full');
    expect(full.cells[3].tag).toEqual({ text: 'differs', tone: 'warn', title: 'The computed value and the current value are not the same.' });
    expect(rowOf(table(data), 'Age').cells[3].tag).toBeUndefined();
  });

  it("says can't tell, with the reason, for a formula that does not evaluate", () => {
    const broken = rowOf(table({ Intro: { First: 'Ada' } }), 'Broken');
    expect(broken.cells[2]).toMatchObject({ text: CANT_TELL, tone: 'unknown' });
    expect(broken.cells[2].title).toBe('The formula could not be evaluated: Unknown function FOO');
    expect(broken.tone).toBe('');
  });

  it("says can't tell, naming the fields, when a merge field has no value yet", () => {
    const gap = rowOf(table({ Intro: { First: 'Ada' } }), 'Gap');
    expect(gap.cells[2]).toMatchObject({ text: CANT_TELL });
    expect(gap.cells[2].title).toBe('No value yet for %Nothing%');
  });

  it('shows a literal exactly, not as an estimate', () => {
    const tag = rowOf(table(data), 'Tag');
    expect(tag.cells[2]).toMatchObject({ text: '"fixed"', estimated: false });
    expect(tag.cells[3]).toMatchObject({ text: 'not in data', tone: 'unknown' });
    expect(tag.tone).toBe('differs');
  });

  it('reads the chosen row of a repeat block', () => {
    const elements = [
      el('Qty', 'Number', { }, { JSONPath: 'Intro:Rows:Qty' }),
      el('Copy', 'Number', { }, { JSONPath: 'Intro:Rows:Copy' }),
      el('Fill', 'Set Values', { elementValueMap: { Copy: '%Qty%' } })
    ];
    const rowsData = { Intro: { Rows: [{ Qty: 1, Copy: 1 }, { Qty: 5, Copy: 1 }] } };
    expect(rowOf(table(rowsData, { Rows: 1 }, elements), 'Copy').tone).toBe('');
    expect(rowOf(table(rowsData, { Rows: 2 }, elements), 'Copy').tone).toBe('differs');
  });

  it("says can't tell everywhere when no data was read", () => {
    const result = table(undefined);
    expect(rowOf(result, 'Full').cells[2].text).toBe(CANT_TELL);
    expect(rowOf(result, 'Full').cells[3].text).toBe(CANT_TELL);
    expect(rowOf(result, 'Tag').cells[2].text).toBe(CANT_TELL);
  });

  it('copes with the list form of the map and an element with no map', () => {
    const list = table(data, {}, [el('First', 'Text'), el('Fill', 'Set Values', { elementValueMap: [{ name: 'Tag', value: 'a' }, { name: '', value: 'b' }] })]);
    expect(list.rows.map((row) => row.cells[0].text)).toEqual(['Tag']);
    const none = table(data, {}, [el('Fill', 'Set Values', {})]);
    expect(none.rows).toEqual([]);
    expect(none.empty).toMatch(/sets no values/);
  });

  describe('as text for a copy', () => {
    it('is the table with tabs between the columns', () => {
      const result = table(data);
      const lines = tableText(result).split('\n');
      expect(lines[0]).toBe('Set Values');
      expect(lines[1]).toBe('Target\tExpression\tComputed value\tCurrent value');
      expect(lines).toContain('Full\t%First% %Last%\t"Ada Lovelace"\t"Ada Byron" · differs');
    });

    it('masks what the data holds when Mask values is on, and keeps the definition', () => {
      const result = table(data);
      const text = tableText(result, { mask: true });
      expect(text).not.toContain('Lovelace');
      expect(text).not.toContain('Ada Byron');
      expect(text).toContain('Full\t%First% %Last%\t"<string>"\t"<string>" · differs');
      expect(text).toContain('Age\t%Years%\t"<number>"\t"<number>"');
    });

    it('masks an estimate and leaves "can\'t tell" and "not in data" as they are', () => {
      const result = table({ Intro: { First: 'Ada', Last: 'L' } });
      const calc = rowOf(result, 'Calc');
      expect(cellText(calc.cells[2], { mask: true })).toBe('"<string>" · estimated ≈');
      expect(cellText(rowOf(result, 'Broken').cells[2], { mask: true })).toBe(CANT_TELL);
      expect(cellText(rowOf(result, 'Calc').cells[3], { mask: true })).toBe('not in data · differs');
    });

    it('keeps a literal in a masked copy, and masks a value a merge field filled in', () => {
      const text = tableText(table(data), { mask: true });
      expect(text).toContain('Tag\tfixed\t"fixed"');
      expect(rowOf(table(data), 'Tag').cells[2].data).toBe(false);
      expect(rowOf(table(data), 'Full').cells[2].data).toBe(true);
    });
  });
});
