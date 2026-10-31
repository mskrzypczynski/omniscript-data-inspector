'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import {
  propertyRows, filterPropertyRows, isInternalKey, propertyLabel, valueView, LONG_TEXT, MAX_DEPTH, MAX_KEYS, takesFormula } from '../../../src/core/structure/property-rows.js';

const element = (propSetMap, type = 'Text') => flatten({
  children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: [{ name: 'Field', type, propSetMap }] }] }]
}, null).find((e) => e.name === 'Field');

describe('propertyRows', () => {
  it('gives known keys a human label and lists them first, in a fixed order', () => {
    const { rows } = propertyRows(element({
      zebra: 'z', remoteMethod: 'run', required: true, label: 'Name', apple: 'a', remoteClass: 'Svc'
    }));
    expect(rows.map((row) => row.label)).toEqual(['Label', 'Required', 'Remote class', 'Remote method', 'zebra', 'apple']);
    expect(rows[0].key).toBe('label');
    expect(propertyLabel('integrationProcedureKey')).toBe('Integration Procedure');
    expect(propertyLabel('somethingNew')).toBe('somethingNew');
  });

  it('shows a boolean as a mark, a number and a string as they are', () => {
    const { rows } = propertyRows(element({ required: true, readOnly: false, repeatLimit: 3, placeholder: 'Type here', defaultValue: '' }));
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(byKey.required).toMatchObject({ kind: 'bool', text: '✓' });
    expect(byKey.readOnly).toMatchObject({ kind: 'bool', text: '–' });
    expect(byKey.repeatLimit).toMatchObject({ kind: 'number', text: '3' });
    expect(byKey.placeholder).toMatchObject({ kind: 'text', text: 'Type here', long: false });
    expect(byKey.defaultValue.text).toBe('(empty)');
  });

  it('counts the keys of an object and the items of an array, and keeps the value for a disclosure', () => {
    const { rows } = propertyRows(element({ elementValueMap: { A: '1', B: '2' }, options: [{ name: 'x' }], messages: [] }));
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    expect(byKey.elementValueMap).toMatchObject({ kind: 'object', text: '{2 keys}' });
    expect(byKey.elementValueMap.value).toEqual({ A: '1', B: '2' });
    expect(byKey.options).toMatchObject({ kind: 'array', text: '[1 item]' });
    expect(byKey.messages.text).toBe('[0 items]');
  });

  it('reads a show rule as its expression', () => {
    const { rows } = propertyRows(element({
      show: { group: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'x' }] } }
    }));
    expect(rows[0]).toMatchObject({ key: 'show', kind: 'object' });
    expect(rows[0].text).toContain('Intro:Kind');
  });

  it('cuts a long string and keeps the whole of it', () => {
    const long = 'w'.repeat(LONG_TEXT + 25);
    const { rows } = propertyRows(element({ helpText: long }));
    expect(rows[0]).toMatchObject({ long: true, full: long });
    expect(rows[0].text).toBe(`${'w'.repeat(LONG_TEXT)}…`);
  });

  it('sets internal keys apart', () => {
    const { rows, internal } = propertyRows(element({
      label: 'Name', _lwcId: 'x', lwcName: 'c-thing', pubsub: true, ssmKey: 1, lwcode: 'x'
    }));
    expect(rows.map((row) => row.key)).toEqual(['label']);
    expect(internal.map((row) => row.key).sort()).toEqual(['_lwcId', 'lwcName', 'lwcode', 'pubsub', 'ssmKey']);
    expect(isInternalKey('_x')).toBe(true);
    expect(isInternalKey('label')).toBe(false);
  });

  it('shows the override keys, which only look internal', () => {
    const { rows, internal } = propertyRows(element({
      label: 'Name', lwcComponentOverride: 'c-custom-input', lwcOverride: 'c-other', lwcName: 'c-thing'
    }));
    expect(rows.map((row) => row.key)).toEqual(expect.arrayContaining(['lwcComponentOverride', 'lwcOverride']));
    expect(rows.find((row) => row.key === 'lwcComponentOverride')).toMatchObject({ label: 'Overridden by', internal: false });
    expect(internal.map((row) => row.key)).toEqual(['lwcName']);
    expect(isInternalKey('lwcComponentOverride')).toBe(false);
    expect(isInternalKey('lwcOverride')).toBe(false);
    expect(isInternalKey('lwcOverrideX')).toBe(true);
  });

  it('is empty for an element without properties', () => {
    expect(propertyRows(element({}))).toEqual({ rows: [], internal: [] });
    expect(propertyRows(null)).toEqual({ rows: [], internal: [] });
  });
});

describe('filterPropertyRows', () => {
  const { rows } = propertyRows(element({
    label: 'Customer name', bundle: 'GetCustomer', elementValueMap: { Tier: 'Gold' }, required: true
  }));

  it('keeps every row for an empty query', () => {
    expect(filterPropertyRows(rows, '  ')).toBe(rows);
  });

  it('matches the label, the key and the value, all words', () => {
    expect(filterPropertyRows(rows, 'mapper').map((row) => row.key)).toEqual(['bundle']);
    expect(filterPropertyRows(rows, 'customer name').map((row) => row.key)).toEqual(['label']);
    expect(filterPropertyRows(rows, 'gold').map((row) => row.key)).toEqual(['elementValueMap']);
    expect(filterPropertyRows(rows, 'customer gold')).toEqual([]);
  });
});

describe('valueView', () => {
  const view = (key, value) => propertyRows(element({ [key]: value })).rows[0].view;

  it('gives a scalar the same short form as its row', () => {
    expect(view('required', true)).toMatchObject({ kind: 'bool', text: '✓' });
    expect(view('repeatLimit', 3)).toMatchObject({ kind: 'number', text: '3' });
    expect(view('placeholder', '')).toMatchObject({ kind: 'text', text: '(empty)' });
    const long = 'w'.repeat(LONG_TEXT + 5);
    expect(view('helpText', long)).toMatchObject({ kind: 'text', long: true, full: long });
  });

  it('turns a list of options into label → value rows', () => {
    const v = view('options', [{ name: 'US', value: 'United States' }, { label: 'Canada', value: 'CA' }]);
    expect(v.kind).toBe('rows');
    expect(v.rows.map((row) => [row.label, row.view.kind, row.view.text])).toEqual([
      ['US', 'text', 'United States'], ['Canada', 'text', 'CA']
    ]);
  });

  it('numbers the items that are not options, and nests an object as a sub-table', () => {
    const v = view('messages', [{ type: 'Requirement', text: 'Adults only', value: false }, 'plain']);
    expect(v.rows.map((row) => row.label)).toEqual(['1', '2']);
    expect(v.rows[0].view.kind).toBe('rows');
    expect(v.rows[0].view.rows.map((row) => row.label)).toEqual(['type', 'text', 'value']);
    expect(v.rows[0].view.rows[2].view).toMatchObject({ kind: 'bool', text: '–' });
    expect(v.rows[1].view).toMatchObject({ kind: 'text', text: 'plain' });
  });

  it('does not make a one-line option out of an object that has more to say', () => {
    const v = view('options', [{ name: 'a', value: 'b', autoAdv: true }]);
    expect(v.rows[0].label).toBe('1');
    expect(v.rows[0].view.kind).toBe('rows');
  });

  it('draws show as a rule', () => {
    const show = { group: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'x' }] } };
    expect(view('show', show)).toMatchObject({ kind: 'rule', rule: show });
    expect(view('validateExpression', show.group)).toMatchObject({ kind: 'rule' });
  });

  it('draws a show group without rules as rows, not as a rule', () => {
    expect(view('show', { group: { operator: 'AND', rules: [] } }).kind).toBe('rows');
  });

  it('draws elementValueMap as assignments, from an object or a list', () => {
    expect(view('elementValueMap', { Kind: 'a', Tier: '%Level%' })).toMatchObject({
      kind: 'assignments', items: [{ target: 'Kind', expression: 'a' }, { target: 'Tier', expression: '%Level%' }]
    });
    expect(view('elementValueMap', [{ name: 'Kind', value: 'a' }])).toMatchObject({
      kind: 'assignments', items: [{ target: 'Kind', expression: 'a' }]
    });
  });

  it('reads an empty object or list as empty', () => {
    expect(view('messages', [])).toMatchObject({ kind: 'null', text: '(empty)' });
    expect(view('remoteOptions', {})).toMatchObject({ kind: 'null', text: '(empty)' });
  });

  it('nests plain objects up to the depth limit, then offers JSON', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    const v = view('remoteOptions', deep);
    let level = v;
    let depth = 1;
    while (level.kind === 'rows') { level = level.rows[0].view; depth += 1; }
    expect(depth).toBe(MAX_DEPTH + 1);
    expect(level).toMatchObject({ kind: 'json', text: '{1 key}' });
    expect(level.value).toEqual({ d: 1 });
  });

  it('falls back to JSON for a level with more than the key limit', () => {
    const big = Object.fromEntries(Array.from({ length: MAX_KEYS + 1 }, (_, i) => [`k${i}`, i]));
    expect(view('remoteOptions', big)).toMatchObject({ kind: 'json', text: `{${MAX_KEYS + 1} keys}` });
    const ok = Object.fromEntries(Array.from({ length: MAX_KEYS }, (_, i) => [`k${i}`, i]));
    expect(view('remoteOptions', ok).kind).toBe('rows');
    expect(view('options', new Array(MAX_KEYS + 1).fill('x'))).toMatchObject({ kind: 'json', text: `[${MAX_KEYS + 1} items]` });
  });

  it('gives every nested view an id of its own', () => {
    const v = view('remoteOptions', { a: { b: 1 }, c: 2 });
    expect(v.id).toBe('remoteOptions');
    expect(v.rows[0].view.id).toBe('remoteOptions.a');
    expect(v.rows[0].view.rows[0].view.id).toBe('remoteOptions.a.b');
  });

  it('keeps the old short form and value on the row', () => {
    const row = propertyRows(element({ options: [{ name: 'x', value: 'y' }] })).rows[0];
    expect(row).toMatchObject({ kind: 'array', text: '[1 item]' });
    expect(row.value).toEqual([{ name: 'x', value: 'y' }]);
    expect(valueView('options', row.value).kind).toBe('rows');
  });
});

describe('which properties are read as formulas', () => {
  it('is the texts a person reads, and the messages of Set Errors and Messaging', () => {
    ['text', 'label', 'helpText', 'hint', 'defaultValue', 'messages.0.text', 'elementErrorMap.Consent', 'elementErrorMap.a.b']
      .forEach((id) => expect(takesFormula(id)).toBe(true));
  });

  it('is not a Formula element\'s expression, or any other text that happens to start with =', () => {
    ['expression', 'elementValueMap.Total', 'Total', 'show', 'elementErrorMap', ''].forEach((id) => expect(takesFormula(id)).toBe(false));
  });
});
