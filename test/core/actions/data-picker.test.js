'use strict';

import {
  listRows, sizeWords, valueAt, suggestName, originalInput, sameValue, emptyMemory, remember, recall, nameProblem, clashes,
  addPicked, replacePicked, pickStatus, pickCount, addedWords, moreWords, ROW_CAP, NO_DATA_WORDS, WHOLE_LABEL, REPLACED_WORDS
} from '../../../src/core/actions/data-picker.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';

const DATA = {
  Step1: { Account: { Name: 'Acme Ltd', Tier: 'Gold', Address: { City: 'Oslo' } }, Rows: [{ Code: 'a1' }, { Code: 'b2' }], Note: 'hi' },
  Step2: { Total: 12 },
  Flag: true
};
const labels = (result) => result.rows.map((row) => row.label);
const rowFor = (result, label) => result.rows.find((row) => row.label === label);

describe('sizeWords', () => {
  it('counts containers the way the Data tab does, without brackets', () => {
    expect(sizeWords({ a: 1, b: 2 })).toBe('2 keys');
    expect(sizeWords({ a: 1 })).toBe('1 key');
    expect(sizeWords({})).toBe('0 keys');
    expect(sizeWords([1, 2, 3])).toBe('3 items');
    expect(sizeWords([1])).toBe('1 item');
  });

  it('shows a short look at a plain value', () => {
    expect(sizeWords('Gold')).toBe('"Gold"');
    expect(sizeWords(42)).toBe('42');
    expect(sizeWords(true)).toBe('true');
    expect(sizeWords(null)).toBe('null');
    const long = sizeWords('x'.repeat(100));
    expect(long.length).toBe(40);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('listRows without a query', () => {
  it('says there is no data when none was read, and lists nothing', () => {
    expect(listRows(undefined)).toEqual({ empty: true, rows: [], more: 0 });
    expect(NO_DATA_WORDS).toBe('No data has been read yet');
  });

  it('starts with Whole data JSON, then the top level with each object opened one level', () => {
    const result = listRows(DATA);
    expect(result.empty).toBe(false);
    expect(labels(result)).toEqual([
      WHOLE_LABEL, 'Step1', 'Step1:Account', 'Step1:Rows', 'Step1:Note', 'Step2', 'Step2:Total', 'Flag'
    ]);
    expect(result.rows[0]).toMatchObject({ whole: true, path: '', size: '3 keys', value: DATA });
    expect(rowFor(result, 'Step1:Account')).toMatchObject({ key: 'Account', size: '3 keys', depth: 2, container: true });
    expect(rowFor(result, 'Step1:Rows').size).toBe('2 items');
    expect(rowFor(result, 'Step1:Note')).toMatchObject({ size: '"hi"', container: false, value: 'hi' });
    expect(rowFor(result, 'Step1')).toMatchObject({ key: 'Step1', depth: 1 });
  });

  it('does not open the items of a list', () => {
    expect(labels(listRows(DATA))).not.toContain('Step1:Rows|1');
  });

  it('puts remembered paths first, right after the whole row', () => {
    const account = ['Step1', 'Account'].join(SEP);
    const total = ['Step2', 'Total'].join(SEP);
    const result = listRows(DATA, '', { first: [total, account, 'Gone'] });
    expect(labels(result).slice(0, 3)).toEqual([WHOLE_LABEL, 'Step2:Total', 'Step1:Account']);
    expect(labels(result).filter((label) => label === 'Step1:Account')).toHaveLength(1);
  });

  it('puts an item of a list first under the list\'s key', () => {
    const item = ['Step1', 'Rows', '1'].join(SEP);
    const result = listRows(DATA, '', { first: [item] });
    expect(result.rows[1]).toMatchObject({ label: 'Step1:Rows|2', key: 'Rows', path: item });
  });

  it('lists a data value that is not a container as the whole row only', () => {
    expect(labels(listRows('text'))).toEqual([WHOLE_LABEL]);
  });
});

describe('listRows with a query', () => {
  it('finds a node at any depth by its value, with the ancestors that reach it marked as context', () => {
    const result = listRows(DATA, 'oslo');
    expect(labels(result)).toEqual([WHOLE_LABEL, 'Step1', 'Step1:Account', 'Step1:Account:Address', 'Step1:Account:Address:City']);
    expect(rowFor(result, 'Step1:Account:Address:City')).toMatchObject({ context: false, key: 'City', size: '"Oslo"' });
    expect(rowFor(result, 'Step1').context).toBe(true);
    expect(rowFor(result, 'Step1:Account:Address').context).toBe(true);
  });

  it('finds a node by its path in the colon notation', () => {
    const result = listRows(DATA, 'step1:account');
    expect(rowFor(result, 'Step1:Account').context).toBe(false);
    expect(labels(result)).toContain('Step1:Account:Tier');
    expect(labels(result)).not.toContain('Step2:Total');
  });

  it('needs every word, in any order', () => {
    expect(labels(listRows(DATA, 'gold tier'))).toContain('Step1:Account:Tier');
    expect(labels(listRows(DATA, 'gold step2'))).toEqual([WHOLE_LABEL]);
  });

  it('names an item of a list by its position and sends it under the list\'s key', () => {
    const result = listRows(DATA, 'b2');
    expect(rowFor(result, 'Step1:Rows|2')).toMatchObject({ key: 'Rows', context: true });
    expect(rowFor(result, 'Step1:Rows|2:Code')).toMatchObject({ key: 'Code', size: '"b2"', context: false });
  });

  it('keeps the whole row first even when nothing matches', () => {
    expect(labels(listRows(DATA, 'nothing like this'))).toEqual([WHOLE_LABEL]);
  });

  it('cuts the list at the cap and counts what it left out', () => {
    const wide = { Step: {} };
    for (let i = 0; i < ROW_CAP + 25; i++) wide.Step[`Key${i}`] = 'v';
    const result = listRows(wide, 'key');
    expect(result.rows).toHaveLength(ROW_CAP + 1);
    expect(result.more).toBe(26);
    expect(moreWords(26)).toBe('26 more, type to narrow');
  });

  it('reads the masked data when Mask values is on: sizes are masked, a real value finds nothing, the row keeps the real one', () => {
    const mask = (value) => JSON.parse(JSON.stringify(value, (key, item) => (typeof item === 'string' && item ? '<string>' : item)));
    const masked = listRows(DATA, '', { mask });
    expect(rowFor(masked, 'Step1:Note')).toMatchObject({ size: '"<string>"', value: 'hi' });
    expect(labels(listRows(DATA, 'oslo', { mask }))).toEqual([WHOLE_LABEL]);
    expect(labels(listRows(DATA, 'city', { mask }))).toContain('Step1:Account:Address:City');
    // Names and paths stay.
    expect(rowFor(masked, 'Step1:Account').label).toBe('Step1:Account');
  });
});

describe('valueAt', () => {
  it('finds a node by tree path, the root by the empty path, and says when it is gone', () => {
    expect(valueAt(DATA, ['Step1', 'Note'].join(SEP))).toEqual({ found: true, value: 'hi' });
    expect(valueAt(DATA, '').value).toBe(DATA);
    expect(valueAt(DATA, ['Step1', 'Missing'].join(SEP)).found).toBe(false);
    expect(valueAt(undefined, '').found).toBe(false);
  });
});

describe('suggestName', () => {
  const account = { Name: 'Acme Ltd', Tier: 'Gold' };
  const row = { key: 'Account', value: account };

  it('offers the node\'s own key without an original input', () => {
    expect(suggestName(row, null)).toEqual({ name: 'Account', sentAs: false });
    expect(suggestName(row, { Other: 1 })).toEqual({ name: 'Account', sentAs: false });
  });

  it('offers the input key whose value equals the node, deeply and in any key order', () => {
    expect(suggestName(row, { AccountDetails: { Tier: 'Gold', Name: 'Acme Ltd' } })).toEqual({ name: 'AccountDetails', sentAs: true });
  });

  it('prefers the node\'s own key when it is one of the equal ones', () => {
    expect(suggestName(row, { Copy: account, Account: account })).toEqual({ name: 'Account', sentAs: true });
  });

  it('does not match a value that only looks alike', () => {
    expect(suggestName(row, { AccountDetails: { Name: 'Acme Ltd' } }).sentAs).toBe(false);
    expect(suggestName({ key: 'Total', value: 12 }, { Total: '12' }).sentAs).toBe(false);
  });

  it('offers nothing special for the whole row', () => {
    expect(suggestName({ whole: true, key: '', value: DATA }, { A: DATA })).toEqual({ name: '', sentAs: false });
  });
});

describe('sameValue and originalInput', () => {
  it('compares deeply', () => {
    expect(sameValue([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(sameValue([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
  });

  it('reads a call\'s input as an object, from the object or its JSON text', () => {
    expect(originalInput({ action: { input: { a: 1 } } })).toEqual({ a: 1 });
    expect(originalInput({ action: { input: '{"a":1}' } })).toEqual({ a: 1 });
    expect(originalInput({ action: { input: '[1]' } })).toBeNull();
    expect(originalInput({ action: { input: 'nope' } })).toBeNull();
    expect(originalInput({})).toBeNull();
    expect(originalInput(null)).toBeNull();
  });
});

describe('the memory per procedure', () => {
  const path = ['Step1', 'Account'].join(SEP);

  it('keeps the names given, per signature, as plain data', () => {
    let memory = emptyMemory();
    memory = remember(memory, 'ns.IPService.Account_Fetch', [{ path, name: 'AccountDetails' }, { path: '', name: 'x' }, { path: 'Gone', name: '' }]);
    memory = remember(memory, 'ns.IPService.Other', [{ path, name: 'Acc' }]);
    expect(memory).toEqual({
      'ns.IPService.Account_Fetch': [{ path, name: 'AccountDetails' }],
      'ns.IPService.Other': [{ path, name: 'Acc' }]
    });
    expect(recall(memory, 'ns.IPService.Account_Fetch', DATA)).toEqual([{ path, name: 'AccountDetails' }]);
    expect(recall(memory, 'unknown', DATA)).toEqual([]);
  });

  it('does not remember under an empty signature, and does not offer a node the data no longer has', () => {
    expect(remember({}, '', [{ path, name: 'A' }])).toEqual({});
    const memory = remember({}, 's', [{ path, name: 'A' }]);
    expect(recall(memory, 's', { Step1: {} })).toEqual([]);
    expect(recall(memory, 's', undefined)).toEqual([]);
  });

  it('does not change the memory it was given', () => {
    const before = remember({}, 's', [{ path, name: 'A' }]);
    remember(before, 's', [{ path, name: 'B' }]);
    expect(before).toEqual({ s: [{ path, name: 'A' }] });
  });
});

describe('names and clashes', () => {
  it('refuses an empty name and an empty part of a dotted name', () => {
    expect(nameProblem('')).toBe('Name every picked node');
    expect(nameProblem('  ')).toBe('Name every picked node');
    expect(nameProblem('Context..Account')).toBe('Context..Account has an empty part');
    expect(nameProblem('Context.Account')).toBe('');
  });

  it('finds names two nodes share, and a name inside another', () => {
    expect(clashes([{ name: 'A' }, { name: 'B' }])).toEqual([]);
    expect(clashes([{ name: 'A' }, { name: 'B' }, { name: 'A' }])).toEqual(['A']);
    expect(clashes([{ name: 'Context' }, { name: 'Context.Account' }])).toEqual(['Context', 'Context.Account']);
    expect(clashes([{ name: 'Context.A' }, { name: 'Context.B' }])).toEqual([]);
    expect(clashes([{ name: 'Con' }, { name: 'Context' }])).toEqual([]);
  });
});

describe('addPicked', () => {
  const picks = [{ name: 'AccountDetails', value: { Tier: 'Gold' } }, { name: 'Total', value: 12 }];

  it('merges the picked nodes into the JSON in the box, pretty-printed', () => {
    const result = addPicked('{"AccountId":"001"}', picks);
    expect(result).toEqual({ ok: true, replaced: [], text: JSON.stringify({ AccountId: '001', AccountDetails: { Tier: 'Gold' }, Total: 12 }, null, 2) });
  });

  it('treats an empty box as an empty object', () => {
    expect(addPicked('', [{ name: 'A', value: 1 }])).toEqual({ ok: true, replaced: [], text: '{\n  "A": 1\n}' });
  });

  it('nests a dotted name, keeping what the object already holds', () => {
    const result = addPicked('{"Context":{"User":"u"}}', [{ name: 'Context.Account', value: { Tier: 'Gold' } }]);
    expect(JSON.parse(result.text)).toEqual({ Context: { User: 'u', Account: { Tier: 'Gold' } } });
    expect(result.replaced).toEqual([]);
  });

  it('nests deeper and builds the parts that are missing, over a value that is not an object', () => {
    const result = addPicked('{"Context":"text"}', [{ name: 'Context.A.B', value: 1 }, { name: 'Other.C', value: 2 }]);
    expect(JSON.parse(result.text)).toEqual({ Context: { A: { B: 1 } }, Other: { C: 2 } });
  });

  it('says which names were already in the input and replaces them', () => {
    const result = addPicked('{"Total":1,"Context":{"Account":1}}', [{ name: 'Total', value: 12 }, { name: 'Context.Account', value: 2 }, { name: 'New', value: 3 }]);
    expect(result.ok).toBe(true);
    expect(result.replaced).toEqual(['Total', 'Context.Account']);
    expect(JSON.parse(result.text)).toEqual({ Total: 12, Context: { Account: 2 }, New: 3 });
  });

  it('does not change the text when the box does not parse', () => {
    expect(addPicked('{"a":', picks)).toEqual({ ok: false, why: 'Fix the input first' });
  });

  it('refuses a box that is not an object', () => {
    expect(addPicked('[1]', picks)).toEqual({ ok: false, why: 'The input is not a JSON object: use Replace input' });
  });

  it('refuses two nodes with the same name, and lists the clash', () => {
    const result = addPicked('{}', [{ name: 'AccountDetails', value: 1 }, { name: 'AccountDetails', value: 2 }]);
    expect(result).toEqual({ ok: false, why: 'Two nodes named AccountDetails', clash: ['AccountDetails'] });
  });

  it('refuses a missing name', () => {
    expect(addPicked('{}', [{ name: '', value: 1 }])).toEqual({ ok: false, why: 'Name every picked node' });
  });

  it('keeps "__proto__" as a key', () => {
    const result = addPicked('{}', [{ name: '__proto__', value: { a: 1 } }]);
    expect(Object.keys(JSON.parse(result.text))).toEqual(['__proto__']);
  });
});

describe('replacePicked', () => {
  it('makes an object of the picked nodes alone, nesting dotted names', () => {
    const result = replacePicked([{ name: 'Context.Account', value: { Tier: 'Gold' } }, { name: 'Total', value: 12 }]);
    expect(JSON.parse(result.text)).toEqual({ Context: { Account: { Tier: 'Gold' } }, Total: 12 });
  });

  it('refuses a clash and a missing name', () => {
    expect(replacePicked([{ name: 'A', value: 1 }, { name: 'A', value: 2 }]).why).toBe('Two nodes named A');
    expect(replacePicked([{ name: '', value: 1 }]).ok).toBe(false);
  });
});

describe('pickStatus', () => {
  const pick = (name, value = 1) => ({ name, value });

  it('asks to tick something when nothing is picked', () => {
    expect(pickStatus('{}', [])).toMatchObject({ canAdd: false, canReplace: false, words: 'Tick the nodes the call reads' });
  });

  it('counts the picked nodes when all is well', () => {
    expect(pickStatus('{}', [pick('A'), pick('B')])).toMatchObject({ canAdd: true, canReplace: true, words: '2 nodes picked', tone: '' });
    expect(pickCount(1)).toBe('1 node picked');
  });

  it('marks a clash and holds Add and Replace back', () => {
    const status = pickStatus('{}', [pick('AccountDetails'), pick('AccountDetails')]);
    expect(status).toMatchObject({ canAdd: false, canReplace: false, words: 'Two nodes named AccountDetails', tone: 'bad', clash: ['AccountDetails'] });
  });

  it('warns, without blocking, about a name already in the input', () => {
    const status = pickStatus('{"AccountDetails":1}', [pick('AccountDetails')]);
    expect(status).toMatchObject({ canAdd: true, tone: 'warn', replaced: ['AccountDetails'], words: 'AccountDetails is already in the input: it will be replaced' });
    expect(pickStatus('{"A":1,"B":1}', [pick('A'), pick('B')]).words).toBe('A, B are already in the input: they will be replaced');
  });

  it('says Fix the input first when the box does not parse, and still lets Replace through', () => {
    expect(pickStatus('{"a":', [pick('A')])).toMatchObject({ canAdd: false, canReplace: true, words: 'Fix the input first', tone: 'bad' });
  });

  it('holds back on a missing name', () => {
    expect(pickStatus('{}', [pick('')])).toMatchObject({ canAdd: false, canReplace: false, words: 'Name every picked node' });
  });

  it('lets the whole data JSON replace, with no names needed', () => {
    expect(pickStatus('{"a":', [], { whole: true })).toMatchObject({ canAdd: true, canReplace: true });
  });
});

describe('the words', () => {
  it('say what happened to the input', () => {
    expect(addedWords(2)).toBe('Added 2 nodes to the input');
    expect(addedWords(1)).toBe('Added 1 node to the input');
    expect(REPLACED_WORDS).toBe('Input replaced');
  });
});
