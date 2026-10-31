'use strict';

import { SEP } from '../../../src/core/shared/json-tree-model.js';
import {
  parseExpression, evaluateExpression, expressionRows, expressionId, compareValues, lengthOf, addExpression, MAX_EXPRESSIONS, NOT_IN_DATA
} from '../../../src/core/data/watch-expr.js';

const p = (...parts) => parts.join(SEP);
const data = {
  Step: {
    Total: 120, Qty: '5', Status: 'Done', Flag: true, Nothing: null, Note: 'Settled in full',
    Rows: [{ Code: 'a', N: 1 }, { Code: 'b', N: 2 }, { Code: 'c', N: 3 }],
    Items: ['x', 'y', 'z'], Name: 'Ada', Map: { a: 1, b: 2 }
  },
  Other: { Status: 'Open' }
};
const run = (text, payload = data) => evaluateExpression(payload, parseExpression(text));

describe('parseExpression', () => {
  it('reads a path, with positions from 1', () => {
    const parsed = parseExpression('Step:Rows|2:Code');
    expect(parsed.kind).toBe('path');
    expect(parsed.segments).toEqual([{ name: 'Step', index: null }, { name: 'Rows', index: 2 }, { name: 'Code', index: null }]);
    expect(parsed.text).toBe('Step:Rows|2:Code');
    expect(parsed.length).toBe(false);
  });

  it('reads a $ query', () => {
    const parsed = parseExpression('$.Rows[*].Qty');
    expect(parsed.kind).toBe('query');
    expect(parsed.steps).toHaveLength(3);
  });

  it('reads a comparison with each operator', () => {
    ['=', '!=', '<', '<=', '>', '>=', 'contains'].forEach((op) => {
      const parsed = parseExpression(`Step:Total ${op} 100`);
      expect(parsed.kind).toBe('compare');
      expect(parsed.op).toBe(op);
      expect(parsed.left.kind).toBe('path');
      expect(parsed.right).toBe(100);
    });
    expect(parseExpression('Step:Total>100').op).toBe('>');
    expect(parseExpression('Step:Total>=100').op).toBe('>=');
    expect(parseExpression('Step:Total<=100').op).toBe('<=');
    expect(parseExpression('Step:Total!=100').op).toBe('!=');
    expect(parseExpression('Note CONTAINS "x"').op).toBe('contains');
  });

  it('reads the value on the right: number, quoted text, true, false, null', () => {
    expect(parseExpression('Status = "Done"').right).toBe('Done');
    expect(parseExpression("Status = 'Done'").right).toBe('Done');
    expect(parseExpression('A = -2.5').right).toBe(-2.5);
    expect(parseExpression('A = true').right).toBe(true);
    expect(parseExpression('A = false').right).toBe(false);
    expect(parseExpression('A = null').right).toBeNull();
    expect(parseExpression('A = "it\\"s"').right).toBe('it"s');
    expect(parseExpression('A = "a > b"').right).toBe('a > b');
  });

  it('takes .length on the left', () => {
    const parsed = parseExpression('Items.length >= 3');
    expect(parsed.left.length).toBe(true);
    expect(parsed.left.segments).toEqual([{ name: 'Items', index: null }]);
    expect(parseExpression('Items.length').length).toBe(true);
  });

  it('takes a $ query on the left of a comparison, with brackets and quotes left alone', () => {
    const parsed = parseExpression('$.Rows[*].N > 1');
    expect(parsed.left.kind).toBe('query');
    expect(parseExpression('$["a>b"] = 1').left.kind).toBe('query');
  });

  it('gives an error for what it cannot read', () => {
    expect(parseExpression('').error).toBeTruthy();
    expect(parseExpression('   ').error).toBeTruthy();
    expect(parseExpression(undefined).error).toBeTruthy();
    expect(parseExpression('Step:Total >').error).toMatch(/Nothing to compare/);
    expect(parseExpression('Step:Total > abc').error).toMatch(/number/);
    expect(parseExpression('> 3').error).toBeTruthy();
    expect(parseExpression('a::b').error).toMatch(/path/);
    expect(parseExpression('$.a. > 1').error).toMatch(/\$ query/);
    expect(parseExpression('$.a.').error).toMatch(/\$ query/);
    expect(parseExpression('Rows|0').error).toMatch(/path/);
  });

  it('needs an operand after contains instead of reading "Total contains" as a path', () => {
    expect(parseExpression('Total contains').error).toMatch(/Nothing to compare/);
    expect(parseExpression('Total CONTAINS   ').error).toMatch(/Nothing to compare/);
    expect(parseExpression('Total contains "a"').op).toBe('contains');
  });

  it('refuses a quote inside a quoted text unless it is escaped', () => {
    expect(parseExpression('Total = "a"b"').error).toMatch(/inside the text/);
    expect(parseExpression('Total = \'a\'b\'').error).toMatch(/inside the text/);
    expect(parseExpression('Total = "a\\"b"').right).toBe('a"b');
    expect(parseExpression('Total = "it\'s"').right).toBe('it\'s');
  });
});

describe('evaluateExpression: a path', () => {
  it('gives the value as the watch list shows it', () => {
    expect(run('Step:Name')).toMatchObject({ text: '"Ada"', value: 'Ada', truthy: true, present: true, paths: [p('Step', 'Name')] });
    expect(run('Step:Total').text).toBe('120');
    expect(run('Step:Rows|2:Code')).toMatchObject({ text: '"b"', value: 'b' });
    expect(run('Step:Flag').value).toBe(true);
    expect(run('Step:Nothing')).toMatchObject({ text: 'null', value: null, truthy: false, present: true });
  });

  it('says a missing path is not in the data', () => {
    const result = run('Step:Nope');
    expect(result.value).toBeUndefined();
    expect(result.text).toBe(NOT_IN_DATA);
    expect(result.text).toContain('not in the data');
    expect(result.truthy).toBe(false);
    expect(result.present).toBe(false);
    expect(run('Step:Rows|9:Code').present).toBe(false);
    expect(evaluateExpression(undefined, parseExpression('A')).text).toBe(NOT_IN_DATA);
    expect(evaluateExpression(data, { error: 'x' }).present).toBe(false);
  });

  it('looks for a bare name at any depth, and lists several places', () => {
    const result = run('Status');
    expect(result.value).toEqual(['Done', 'Open']);
    expect(result.text).toBe('2 values: Done, Open');
    expect(result.paths).toEqual([p('Step', 'Status'), p('Other', 'Status')]);
  });

  it('summarises a branch', () => {
    expect(run('Step:Rows').text).toBe('[3]');
  });
});

describe('evaluateExpression: .length', () => {
  it('counts the items of a list, the characters of a text and the keys of an object', () => {
    expect(run('Step:Items.length')).toMatchObject({ value: 3, text: '3' });
    expect(run('Step:Name.length').value).toBe(3);
    expect(run('Step:Map.length').value).toBe(2);
    expect(lengthOf([])).toBe(0);
    expect(lengthOf({})).toBe(0);
    expect(lengthOf(12)).toBeUndefined();
    expect(lengthOf(null)).toBeUndefined();
  });

  it('has nothing for a value without a length', () => {
    expect(run('Step:Total.length').present).toBe(false);
    expect(run('Step:Nothing.length').present).toBe(false);
  });

  it('compares a length', () => {
    expect(run('Step:Items.length >= 3').text).toBe('true');
    expect(run('Step:Items.length > 3').text).toBe('false');
    expect(run('Step:Items.length = 3').truthy).toBe(true);
  });
});

describe('evaluateExpression: a comparison', () => {
  it('compares with each operator', () => {
    expect(run('Step:Total > 100').truthy).toBe(true);
    expect(run('Step:Total >= 120').truthy).toBe(true);
    expect(run('Step:Total >= 121').truthy).toBe(false);
    expect(run('Step:Total < 120').truthy).toBe(false);
    expect(run('Step:Total <= 120').truthy).toBe(true);
    expect(run('Step:Total = 120').truthy).toBe(true);
    expect(run('Step:Total != 120').truthy).toBe(false);
    expect(run('Step:Total != 5').truthy).toBe(true);
  });

  it('answers true or false as text, with the answer as the value', () => {
    expect(run('Step:Total > 100')).toMatchObject({ text: 'true', value: true, truthy: true, present: true });
    expect(run('Step:Total > 200')).toMatchObject({ text: 'false', value: false, truthy: false, present: true });
  });

  it('compares a number with a numeric text as numbers', () => {
    expect(run('Step:Qty > 3').truthy).toBe(true); // "5" > 3
    expect(run('Step:Qty = 5').truthy).toBe(true);
    expect(run('Step:Qty < 10').truthy).toBe(true); // numerically, not as text
    expect(run('Step:Total = "120"').truthy).toBe(true);
    expect(compareValues('05', '=', '5')).toBe(false); // two texts stay texts
    expect(compareValues('10', '<', '9')).toBe(false);
  });

  it('compares texts exactly, case included', () => {
    expect(run('Step:Status = "Done"').truthy).toBe(true);
    expect(run('Step:Status = "done"').truthy).toBe(false);
    expect(run('Step:Status != "Open"').truthy).toBe(true);
    expect(run('Step:Name > "Abc"').truthy).toBe(true);
    expect(run('Step:Name > 5').truthy).toBe(false); // not comparable
  });

  it('compares with true, false and null', () => {
    expect(run('Step:Flag = true').truthy).toBe(true);
    expect(run('Step:Flag = false').truthy).toBe(false);
    expect(run('Step:Nothing = null').truthy).toBe(true);
    expect(run('Step:Name = null').truthy).toBe(false);
    expect(run('Step:Name != null').truthy).toBe(true);
  });

  it('checks contains on a text and on a list', () => {
    expect(run('Step:Note contains "in full"').truthy).toBe(true);
    expect(run('Step:Note contains "Full"').truthy).toBe(false);
    expect(run('Step:Items contains "y"').truthy).toBe(true);
    expect(run('Step:Items contains "q"').truthy).toBe(false);
    expect(run('Step:Total contains 2').truthy).toBe(true);
    expect(run('Step:Map contains "a"').truthy).toBe(false);
  });

  it('is not in the data when the path is missing, and not a true or false', () => {
    const result = run('Step:Nope > 1');
    expect(result.present).toBe(false);
    expect(result.text).toBe(NOT_IN_DATA);
    expect(result.truthy).toBe(false);
  });

  it('is true when any of several places is', () => {
    expect(run('Status = "Open"').truthy).toBe(true);
    expect(run('Status = "Nope"').truthy).toBe(false);
    expect(run('$.Step.Rows[*].N > 2').truthy).toBe(true);
    expect(run('$.Step.Rows[*].N > 3').truthy).toBe(false);
  });
});

describe('evaluateExpression: a $ query', () => {
  it('gives one value as it is', () => {
    expect(run('$.Step.Total')).toMatchObject({ value: 120, text: '120' });
    expect(run('$.Step.Rows[-1].Code').text).toBe('"c"');
  });

  it('lists several values', () => {
    const result = run('$.Step.Rows[*].Code');
    expect(result.text).toBe('3 values: a, b, c');
    expect(result.value).toEqual(['a', 'b', 'c']);
    expect(result.paths).toHaveLength(3);
    expect(run('$.Step.Rows[*].N').text).toBe('3 values: 1, 2, 3');
  });

  it('shortens a long list of values', () => {
    const many = { R: Array.from({ length: 9 }, (_, i) => ({ v: `value${i}` })) };
    const text = run('$.R[*].v', many).text;
    expect(text.startsWith('9 values: value0, value1, value2, value3, value4, …')).toBe(true);
  });

  it('says when nothing matches', () => {
    expect(run('$.Nothing.Here').text).toBe(NOT_IN_DATA);
    expect(run('$.Step.Rows[*].Missing').present).toBe(false);
  });

  it('gives the length of a list', () => {
    expect(run('$.Step.Rows.length').value).toBe(3);
    expect(run('$.Step.Rows.length > 2').truthy).toBe(true);
  });
});

describe('expressionRows', () => {
  it('gives a row for each expression, in order, with a verdict for a comparison', () => {
    const rows = expressionRows(data, ['Step:Total > 100', 'Step:Total > 500', 'Step:Name', 'Step:Nope > 1']);
    expect(rows.map((row) => row.text)).toEqual(['true', 'false', '"Ada"', NOT_IN_DATA]);
    expect(rows.map((row) => row.verdict)).toEqual([true, false, null, null]);
    expect(rows.map((row) => row.shown).slice(0, 2)).toEqual(['✓ true', '✕ false']);
    expect(rows[0].label).toBe('Step:Total > 100');
    expect(rows[0].id).toBe(expressionId('Step:Total > 100'));
    expect(rows[3].present).toBe(false);
  });

  it('keeps an expression that does not parse, with its error', () => {
    const [row] = expressionRows(data, ['Step:Total >']);
    expect(row.error).toBe(true);
    expect(row.text).toMatch(/Nothing to compare/);
    expect(row.label).toBe('Step:Total >');
  });

  it('never gives an id that a tree path could have', () => {
    expect(expressionId('Name')).not.toBe('Name');
    expect(expressionId('Name')).not.toBe(p('Name'));
  });
});

describe('addExpression', () => {
  it('adds a good expression, trimmed, at the end', () => {
    expect(addExpression(['A'], '  Step:Total > 100 ')).toEqual({ texts: ['A', 'Step:Total > 100'], error: '', added: true });
  });

  it('does not add one twice, and says nothing about it', () => {
    expect(addExpression(['Step:Total > 100'], 'Step:Total > 100')).toEqual({ texts: ['Step:Total > 100'], error: '', added: false });
  });

  it('refuses what does not parse, with the reason', () => {
    const result = addExpression(['A'], 'Step:Total >');
    expect(result.texts).toEqual(['A']);
    expect(result.added).toBe(false);
    expect(result.error).toMatch(/Nothing to compare/);
    expect(addExpression([], '').error).toBeTruthy();
  });

  it('keeps to the limit', () => {
    const full = Array.from({ length: MAX_EXPRESSIONS }, (_, i) => `A${i}`);
    const result = addExpression(full, 'New');
    expect(result.texts).toBe(full);
    expect(result.error).toMatch(/At most 20/);
  });
});

describe('expressions with a mask', () => {
  const hide = (value) => (typeof value === 'string' ? '<string>' : value);

  it('hides the values of a path and of several places, and leaves a comparison\'s answer', () => {
    const rows = expressionRows({ A: { Name: 'Ada' }, B: [{ N: 'x' }, { N: 'y' }] }, ['A:Name', '$.B[*].N', 'A:Name = "Ada"'], hide);
    expect(rows[0].shown).toBe('"<string>"');
    expect(rows[0].text).toBe('"Ada"');
    expect(rows[1].shown).toBe('2 values: <string>, <string>');
    expect(rows[2].shown).toBe('✓ true');
  });

  it('shows the real text when nothing masks', () => {
    expect(expressionRows({ A: 'Ada' }, ['A'])[0].shown).toBe('"Ada"');
  });
});
