'use strict';

import { ruleTree, describeVerdict, withOverrides, evaluateShow } from '../../../src/core/structure/visibility.js';
import { createEstimator } from '../../../src/core/structure/formula-values.js';
import { parseWhatIf, whatIfText, fingerprint, staleWhatIf } from '../../../src/core/structure/what-if.js';

const rule = (field, condition, data) => ({ field, condition, data });
const show = (operator, ...rules) => ({ group: { operator, rules } });
const data = { S: { Kind: 'person', Age: 30 } };

const nested = show('AND',
  rule('S:Age', '>', '18'),
  { group: { operator: 'OR', rules: [rule('S:Kind', '=', 'business'), rule('S:Kind', '=', 'trust')] } });

describe('ruleTree with overrides', () => {
  it('is the plain tree when there are none', () => {
    const plain = ruleTree(nested, data);
    expect(ruleTree(nested, data, undefined, new Map())).toEqual(plain);
    expect(plain.edited).toBe(false);
    expect(plain.ok).toBe(false);
  });

  it('reads an overridden field as typed and recomputes the rows, the roll-ups and the verdict', () => {
    const tree = ruleTree(nested, data, undefined, new Map([['S:Kind', 'trust']]));
    const [age, either] = tree.children;
    expect(age).toMatchObject({ ok: true, edited: false });
    expect(either).toMatchObject({ kind: 'group', operator: 'OR', ok: true, edited: true, holds: 1, fails: 1 });
    expect(either.children.map((c) => [c.ok, c.edited, c.actual])).toEqual([[false, true, '"trust"'], [true, true, '"trust"']]);
    expect(tree).toMatchObject({ ok: true, edited: true });
    expect(describeVerdict(tree)).toBe('Shown: its condition is true (what if)');
  });

  it('turns a holding rule into a failing one', () => {
    const tree = ruleTree(nested, data, undefined, new Map([['S:Age', 10]]));
    expect(tree.children[0]).toMatchObject({ ok: false, edited: true, actual: '10', actualValue: 10 });
    expect(describeVerdict(tree)).toBe('Hidden: 2 of 2 conditions fail (what if)');
  });

  it('accepts an object as well as a Map', () => {
    expect(ruleTree(nested, data, undefined, { 'S:Age': 10 }).children[0].ok).toBe(false);
  });

  it('leaves the data alone', () => {
    const copy = JSON.stringify(data);
    ruleTree(nested, data, undefined, new Map([['S:Age', 1]]));
    expect(JSON.stringify(data)).toBe(copy);
  });

  it('can set a field the data does not have', () => {
    const tree = ruleTree(show('AND', rule('S:Nope', '=', 'x')), data, undefined, new Map([['S:Nope', 'x']]));
    expect(tree).toMatchObject({ ok: true, edited: true });
    expect(ruleTree(show('AND', rule('S:Nope', '=', 'x')), data).ok).toBe(false);
  });

  it('judges nothing without data, edited or not', () => {
    const tree = ruleTree(nested, undefined, undefined, new Map([['S:Age', 10]]));
    expect(tree.ok).toBeNull();
    expect(tree.edited).toBe(false);
    expect(tree.children[0].actualValue).toBeUndefined();
  });

  it('keeps an edit apart from an estimate: the typed value is not estimated', () => {
    const formula = show('AND', rule('S:Age', '>', '=10 + 8'));
    const plain = ruleTree(formula, data);
    expect(plain.estimated).toBe(true);
    const edited = ruleTree(formula, data, undefined, new Map([['S:Age', 5]]));
    expect(edited.children[0]).toMatchObject({ edited: true, actualEstimated: false, expectedEstimated: true, ok: false });
    expect(describeVerdict(edited)).toBe('Hidden: S:Age is 5, not at least ≈ 18 (estimated) (what if)'.replace('not at least', 'not greater than'));
  });

  it('also applies to a field named as a %merge% expected value', () => {
    const tree = ruleTree(show('AND', rule('S:Age', '=', '%S:Kind%')), data, undefined, new Map([['S:Kind', 30]]));
    expect(tree).toMatchObject({ ok: true, edited: true });
  });
});

describe('withOverrides', () => {
  it('returns the estimator itself when there is nothing to override', () => {
    const ctx = createEstimator([], data);
    expect(withOverrides(ctx, new Map())).toBe(ctx);
    expect(withOverrides(ctx, undefined)).toBe(ctx);
  });

  it('answers for the overridden fields and defers for the rest', () => {
    const ctx = withOverrides(createEstimator([], data), new Map([['S:Age', 5]]));
    expect(ctx.read('S:Age')).toEqual({ value: 5, estimated: false, edited: true });
    expect(ctx.read('S:Kind')).toEqual({ value: 'person', estimated: false });
    expect(evaluateShow(show('AND', rule('S:Age', '<', '10')), data, ctx).result).toBe(true);
  });

  it('works without an estimator', () => {
    expect(withOverrides(undefined, { 'S:Age': 5 }, data).read('S:Age').value).toBe(5);
  });
});

describe('parseWhatIf and whatIfText', () => {
  it.each([['12', 12], ['-3.5', -3.5], [' 7 ', 7], ['12,5', '12,5'], ['abc', 'abc'], ['', ''], ['true', 'true']])(
    'reads %j as %j', (text, expected) => { expect(parseWhatIf(text)).toEqual(expected); });

  it('turns a value into text for the input', () => {
    expect(whatIfText(undefined)).toBe('');
    expect(whatIfText(null)).toBe('');
    expect(whatIfText(30)).toBe('30');
    expect(whatIfText('x')).toBe('x');
    expect(whatIfText(false)).toBe('false');
    expect(whatIfText({ a: 1 })).toBe('{"a":1}');
  });
});

describe('staleWhatIf', () => {
  const values = new Map([['A', 'typed'], ['B', 1]]);
  const bases = new Map([['A', fingerprint('old')], ['B', fingerprint(undefined)]]);

  it('names the fields whose live value is not the one they were typed against', () => {
    const live = { A: 'old', B: 2 };
    expect(staleWhatIf(values, bases, (field) => live[field])).toEqual(['B']);
  });

  it('keeps all while nothing changed, including a field that held nothing', () => {
    const live = { A: 'old' };
    expect(staleWhatIf(values, bases, (field) => live[field])).toEqual([]);
  });

  it('drops a field whose value was cleared', () => {
    expect(staleWhatIf(values, bases, () => undefined)).toEqual(['A']);
  });
});
