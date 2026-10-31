'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { createReferences } from '../../../src/core/shared/references.js';
import { textCell, valueCell, unknownCell, fieldCell, cellText, tableText, CANT_TELL } from '../../../src/core/structure/table-model.js';

const list = flatten({ children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: [
  { name: 'Name', type: 'Text', propSetMap: {} }, { name: 'Later', type: 'Text', propSetMap: {} }
] }] }] }, null);
const refs = createReferences(list);

describe('the cells of a table', () => {
  it('makes a value cell from what the data holds, with the type kept for a masked copy', () => {
    expect(valueCell('Ada')).toMatchObject({ text: '"Ada"', data: true, value: 'Ada', estimated: false, tone: '' });
    expect(valueCell(4, { estimated: true })).toMatchObject({ text: '4', estimated: true, tag: { text: 'estimated ≈', tone: 'outline' } });
    expect(valueCell(4).tag).toBeUndefined();
    expect(valueCell(undefined)).toMatchObject({ text: 'not in data', data: false, tone: 'unknown', prose: true });
    expect(valueCell(true).text).toBe('true');
  });

  it('says can\'t tell with a reason in the tooltip, in words', () => {
    expect(unknownCell('why')).toEqual({ text: CANT_TELL, tone: 'unknown', prose: true, title: 'why' });
  });

  it('shows an element by its name as a link that selects it, the field as written in the tooltip and the copy', () => {
    const data = { Intro: { Name: 'Ada' } };
    expect(fieldCell('Name', { refs, data })).toMatchObject({ text: 'Name', link: { kind: 'element' }, title: 'Select Name' });
    expect(fieldCell('%Name%', { refs, data }).text).toBe('Name');
    const path = fieldCell('Intro:Name', { refs, data });
    expect(path).toMatchObject({ text: 'Name', copy: 'Intro:Name', title: 'Select Name · Intro:Name', link: { kind: 'element' } });
    expect(fieldCell('Later', { refs, data }).link).toMatchObject({ kind: 'element' });
    expect(fieldCell('Name', { refs, data: undefined }).link).toMatchObject({ kind: 'element' });
  });

  it('links a field that is no element to its place in Data when the data holds it, else to nothing', () => {
    const data = { Intro: { Name: 'Ada' }, Extra: { Code: 'X1' } };
    expect(fieldCell('Extra:Code', { refs, data })).toMatchObject({ text: 'Extra:Code', link: { kind: 'data', segments: ['Extra', 'Code'] }, title: 'Show in Data' });
    expect(fieldCell('Elsewhere', { refs, data }).link).toBeUndefined();
  });

  it('puts the element\'s label before its name only when asked', () => {
    const labelled = createReferences(flatten({ children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: [
      { name: 'Dob', type: 'Date', propSetMap: { label: 'Date of birth' } }
    ] }] }] }, null));
    expect(fieldCell('Dob', { refs: labelled, data: {} }).label).toBeUndefined();
    expect(fieldCell('Dob', { refs: labelled, data: {} }, {}, { withLabel: true }).label).toBe('Date of birth');
  });

  it('adds what the caller says about the cell to the tooltip of a link', () => {
    expect(fieldCell('Name', { refs, data: { Intro: { Name: 'x' } } }, { title: 'Read by it' }).title).toBe('Select Name · Read by it');
  });
});

describe('cellText and tableText', () => {
  it('keeps the text and the tag, and masks only what the data held', () => {
    const held = { ...valueCell('Ada'), tag: { text: 'differs', tone: 'warn' } };
    expect(cellText(held)).toBe('"Ada" · differs');
    expect(cellText(held, { mask: true })).toBe('"<string>" · differs');
    expect(cellText(textCell('Name'), { mask: true })).toBe('Name');
    expect(cellText({ ...valueCell(3, { estimated: true }) }, { mask: true })).toBe('"<number>" · estimated ≈');
    expect(cellText({ text: 'Name', copy: 'Intro:Name' })).toBe('Intro:Name');
    expect(cellText({ text: '✓', data: true, masked: '(masked)' }, { mask: true })).toBe('(masked)');
    expect(cellText(valueCell(false), { mask: true })).toBe('false');
    expect(cellText(valueCell(''), { mask: true })).toBe('""');
  });

  it('lays a table out with its title, a header line and tab-separated rows, on single lines', () => {
    const table = {
      title: 'T', columns: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      rows: [{ cells: [textCell('x\ty'), textCell('line\nbreak')] }]
    };
    expect(tableText(table)).toBe('T\nA\tB\nx y\tline break');
    expect(tableText({ ...table, verdict: { text: 'No match' } }).split('\n')[0]).toBe('T · No match');
  });

  it('lays labelled rows out as label and value, with a sub-heading on a line of its own', () => {
    const card = {
      title: 'Formula', layout: 'rows', columns: [],
      rows: [{ label: textCell('Expression'), value: textCell('=1+1') }, { heading: 'Elements it reads' }, { label: textCell('Qty'), value: valueCell(4) }]
    };
    expect(tableText(card)).toBe('Formula\nExpression\t=1+1\nElements it reads\nQty\t4');
    expect(tableText(card, { mask: true }).split('\n')[3]).toBe('Qty\t"<number>"');
  });
});
