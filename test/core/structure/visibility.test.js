'use strict';

import {
  compare, evaluateShow, failingRules, describeFailure, computeVisibility, explainVisibility, evaluateExpression, ruleTree,
  describeVerdict, isCertainlyHidden
} from '../../../src/core/structure/visibility.js';

const rule = (field, condition, data) => ({ field, condition, data });
const show = (operator, ...rules) => ({ group: { operator, rules } });
const data = { StepA: { Kind: 'beta', Age: 30, Tags: ['x', 'y'] }, Other: 'beta' };

describe('compare', () => {
  it('compares strings and numbers', () => {
    expect(compare('a', '=', 'a')).toBe(true);
    expect(compare('a', '<>', 'a')).toBe(false);
    expect(compare('30', '>', 4)).toBe(true);
    expect(compare(30, '<=', '30')).toBe(true);
    expect(compare(undefined, '=', '')).toBe(true);
  });

  it('treats an array as a set of values', () => {
    expect(compare(['x', 'y'], '=', 'x')).toBe(true);
    expect(compare(['x'], '<>', 'z')).toBe(true);
  });

  it('tells long integers apart: two 16-digit ids are not equal because their doubles are', () => {
    expect(compare('1234567890123456', '=', '1234567890123457')).toBe(false);
    expect(compare('1234567890123456', '<>', '1234567890123457')).toBe(true);
    expect(compare('1234567890123456', '<', '1234567890123457')).toBe(true);
    expect(compare('1234567890123456', '=', '1234567890123456')).toBe(true);
    expect(compare('12345678901234567', '>', 5)).toBe(true);
  });

  it('does not order a number against text that is not one, but still equates them', () => {
    expect(compare('$5', '<', '10')).toBeNull();
    expect(compare('1,000', '>', '999')).toBeNull();
    expect(compare('abc', '>=', 3)).toBeNull();
    expect(compare('$5', '=', '10')).toBe(false);
    expect(compare('$5', '<>', '10')).toBe(true);
    expect(compare('b', '>', 'a')).toBe(true); // two texts are still ordered as text
    expect(compare('', '>', 5)).toBe(false);
  });

  it('cannot judge unknown operators or objects', () => {
    expect(compare('a', 'contains', 'a')).toBeNull();
    expect(compare({ a: 1 }, '=', 'a')).toBeNull();
  });
});

describe('compare: what a value is', () => {
  it('compares as numbers only plain decimals, never ids, hex or exponents', () => {
    expect(compare('01234', '=', '1234')).toBe(false);
    expect(compare('01234', '=', 1234)).toBe(false);
    expect(compare('0x10', '=', 16)).toBe(false);
    expect(compare('1e3', '=', 1000)).toBe(false);
    expect(compare('007', '<>', '7')).toBe(true);
    expect(compare('12', '=', 12)).toBe(true);
    expect(compare('12.50', '=', '12.5')).toBe(true);
    expect(compare('-3', '<', '10')).toBe(true);
    expect(compare('9', '<', '10')).toBe(true); // as numbers, not as text
  });

  it('does not judge "less than" a value that is not there', () => {
    expect(compare(undefined, '<', 5)).toBeNull();
    expect(compare('', '<=', 5)).toBeNull();
    expect(compare(null, '<', 5)).toBeNull();
    expect(compare(3, '<', undefined)).toBeNull();
    expect(compare(undefined, '>', 5)).toBe(false);
    expect(compare('', '>=', 5)).toBe(false);
    expect(compare(0, '<', 5)).toBe(true); // 0 is a value
  });

  it('reads true and false whatever case or type the data holds', () => {
    expect(compare('TRUE', '=', true)).toBe(true);
    expect(compare(true, '=', 'True')).toBe(true);
    expect(compare('false', '=', false)).toBe(true);
    expect(compare('FALSE', '<>', false)).toBe(false);
    expect(compare(['TRUE'], '=', true)).toBe(true);
    expect(compare('Yes', '=', 'yes')).toBe(false); // other text stays case sensitive
  });
});

describe('evaluateShow', () => {
  it('evaluates AND and OR groups', () => {
    expect(evaluateShow(show('AND', rule('StepA:Kind', '=', 'beta'), rule('StepA:Age', '>', '18')), data).result).toBe(true);
    expect(evaluateShow(show('AND', rule('StepA:Kind', '=', 'x'), rule('StepA:Age', '>', '18')), data).result).toBe(false);
    expect(evaluateShow(show('OR', rule('StepA:Kind', '=', 'x'), rule('StepA:Age', '>', '18')), data).result).toBe(true);
  });

  it('looks a bare field name up anywhere in the data', () => {
    expect(evaluateShow(show('AND', rule('Kind', '=', 'beta')), data).result).toBe(true);
  });

  it('reads %merge% values from the data', () => {
    expect(evaluateShow(show('AND', rule('StepA:Kind', '=', '%Other%')), data).result).toBe(true);
  });

  it('handles nested groups', () => {
    const nested = { group: { operator: 'AND', rules: [
      rule('StepA:Age', '>', '18'),
      { group: { operator: 'OR', rules: [rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y')] } }
    ] } };
    expect(evaluateShow(nested, data).result).toBe(false);
  });

  it('is unknown without data, without rules, or with an operator it cannot judge', () => {
    expect(evaluateShow(show('AND', rule('a', '=', 'b')), undefined).result).toBeNull();
    expect(evaluateShow({ group: { operator: 'AND', rules: [] } }, data).result).toBeNull();
    expect(evaluateShow(show('AND', rule('StepA:Kind', 'contains', 'm')), data).result).toBeNull();
  });

  it('lets a false rule decide an AND even when another is unknown', () => {
    const mixed = show('AND', rule('StepA:Kind', 'contains', 'm'), rule('StepA:Kind', '=', 'x'));
    expect(evaluateShow(mixed, data).result).toBe(false);
  });
});

describe('failingRules / describeFailure', () => {
  it('names the rule that hides the element and what the field holds now', () => {
    const { tree } = evaluateShow(show('AND', rule('StepA:Age', '>', '18'), rule('StepA:Kind', '=', 'alpha')), data);
    const failing = failingRules(tree);
    expect(failing).toHaveLength(1);
    expect(describeFailure(failing[0])).toBe('StepA:Kind should be "alpha", but is "beta"');
  });

  it('lists every rule of an OR that failed, and says "not set" for a missing field', () => {
    const { tree } = evaluateShow(show('OR', rule('StepA:Kind', '=', 'x'), rule('Missing', '=', 'y')), data);
    const text = failingRules(tree).map(describeFailure);
    expect(text).toEqual([
      'StepA:Kind should be "x", but is "beta"',
      'Missing should be "y", but is not set'
    ]);
  });

  it('writes booleans the same way on both sides, so a failing rule does not read as a contradiction', () => {
    const flags = { flagOne: false, flagTwo: true };
    const { tree } = evaluateShow(show('AND',
      rule('flagOne', '=', 'true'), rule('flagTwo', '=', 'false'), rule('flagThree', '=', 'true')), flags);
    expect(failingRules(tree).map(describeFailure)).toEqual([
      'flagOne should be true, but is false',
      'flagTwo should be false, but is true',
      'flagThree should be true, but is not set'
    ]);
  });

  it('says no condition of an OR holds, with the count', () => {
    const els = [{ key: 'a', name: 'A', parentKey: '', shown: true,
      show: show('OR', rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y')) }];
    const vis = computeVisibility(els, data);
    expect(explainVisibility(els[0], vis, { a: els[0] }).headline).toBe('Hidden: no condition is true (0 of 2)');
  });

  it('is empty when the group is true or unknown', () => {
    expect(failingRules(evaluateShow(show('AND', rule('StepA:Kind', '=', 'beta')), data).tree)).toEqual([]);
  });
});

describe('formulas and nested ORs', () => {
  it('cannot judge a rule whose expected value is a formula', () => {
    expect(evaluateShow(show('AND', rule('StepA:Kind', '=', '=UPPER(x)')), data).result).toBeNull();
    expect(evaluateShow(show('AND', rule('StepA:Kind', '=', '=UPPER(x)'), rule('StepA:Kind', '=', 'x')), data).result).toBe(false);
  });

  it('reports an OR inside an AND as one item, "one of"', () => {
    const nested = { group: { operator: 'AND', rules: [
      rule('StepA:Age', '>', '99'),
      { group: { operator: 'OR', rules: [rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y')] } }
    ] } };
    const failing = failingRules(evaluateShow(nested, data).tree).map(describeFailure);
    expect(failing).toEqual([
      'StepA:Age should be greater than 99, but is 30',
      'one of: StepA:Kind should be "x", but is "beta" or StepA:Kind should be "y", but is "beta"'
    ]);
  });
});

describe('evaluateExpression', () => {
  it('judges a rule group like a show rule and gives up on a formula string', () => {
    expect(evaluateExpression(show('AND', rule('StepA:Age', '>', '18')), data).result).toBe(true);
    expect(evaluateExpression('StepA:Age > 18', data).result).toBeNull();
    expect(evaluateExpression(undefined, data).result).toBeNull();
  });
});

describe('computeVisibility', () => {
  const elements = [
    { key: 's', parentKey: '', shown: true, show: null },
    { key: 'a', parentKey: 's', shown: true, show: show('AND', rule('StepA:Kind', '=', 'alpha')) },
    { key: 'b', parentKey: 'a', shown: true, show: null },
    { key: 'c', parentKey: 's', shown: false, show: null },
    { key: 'd', parentKey: 's', shown: false, show: show('AND', rule('StepA:Kind', '=', 'beta')) }
  ];

  it('re-evaluates rules against the live data', () => {
    const vis = computeVisibility(elements, data);
    expect(vis.a.hidden).toBe(true);
    expect(vis.a.via).toBe('a');
    expect(vis.a.live).toBe(true);
    expect(vis.d.hidden).toBe(false); // the bShow snapshot is stale; the rule now holds
  });

  it('hides children of a hidden element and points at the ancestor', () => {
    const vis = computeVisibility(elements, data);
    expect(vis.b.hidden).toBe(true);
    expect(vis.b.via).toBe('a');
  });

  it('falls back to bShow when there is no rule to evaluate', () => {
    const vis = computeVisibility(elements, data);
    expect(vis.c.hidden).toBe(true);
    expect(vis.s.hidden).toBe(false);
    expect(computeVisibility(elements, undefined).a.hidden).toBe(false);
  });
});

describe('a show rule that cannot be judged', () => {
  const unjudged = show('AND', rule('StepA:Kind', 'contains', 'be'));
  const elements = [
    { key: 's', parentKey: '', shown: true, show: null, conditional: false },
    { key: 'u', parentKey: 's', shown: false, show: unjudged, conditional: true },
    { key: 'v', parentKey: 's', shown: true, show: unjudged, conditional: true },
    { key: 'child', parentKey: 'u', shown: true, show: null, conditional: false },
    { key: 'plain', parentKey: 's', shown: false, show: null, conditional: false }
  ];

  it('is marked unknown and estimated, never certain', () => {
    const vis = computeVisibility(elements, data);
    expect(vis.u).toMatchObject({ unknown: true, estimated: true, live: false });
    expect(vis.v).toMatchObject({ unknown: true, estimated: true, hidden: false });
    expect(vis.child.estimated).toBe(true); // under an element that may not be hidden at all
  });

  it('keeps the stale bShow only for how the list looks', () => {
    const vis = computeVisibility(elements, data);
    expect(vis.u.hidden).toBe(true);
    expect(vis.plain).toMatchObject({ hidden: true, unknown: false, estimated: false }); // no rule: bShow is the only word
  });

  it('is not unknown when the rule can be judged', () => {
    const judged = [{ key: 'a', parentKey: '', shown: false, show: show('AND', rule('StepA:Kind', '=', 'beta')), conditional: true }];
    expect(computeVisibility(judged, data).a).toMatchObject({ unknown: false, estimated: false, hidden: false });
  });
});

describe('explainVisibility', () => {
  const elements = [
    { key: 'a', name: 'Parent', parentKey: '', shown: true, show: show('AND', rule('StepA:Kind', '=', 'alpha')) },
    { key: 'b', name: 'Child', parentKey: 'a', shown: true, show: null },
    { key: 'c', name: 'Shown', parentKey: '', shown: true, show: show('AND', rule('StepA:Age', '>', '18')) },
    { key: 'd', name: 'Stale', parentKey: '', shown: false, show: show('AND', rule('StepA:Kind', '=', 'beta')) },
    { key: 'e', name: 'Plain', parentKey: '', shown: true, show: null }
  ];
  const byKey = Object.fromEntries(elements.map((e) => [e.key, e]));
  const vis = computeVisibility(elements, data);
  const explain = (key) => explainVisibility(byKey[key], vis, byKey);

  it('says which rule hides an element and what the field holds', () => {
    const why = explain('a');
    expect(why.hidden).toBe(true);
    expect(why.headline).toBe('Hidden: StepA:Kind is "beta", not "alpha"');
    expect(why.lines).toEqual([{
      ok: false, text: 'StepA:Kind = "alpha" — currently "beta"', field: 'StepA:Kind', rest: ' = "alpha" — currently "beta"'
    }]);
  });

  it('blames the hidden parent for a child', () => {
    const why = explain('b');
    expect(why.headline).toBe('Hidden because Parent is hidden');
    expect(why.lines[0].text).toMatch(/^Hidden: StepA:Kind/);
  });

  it('confirms a visible element whose rules hold, and flags a stale snapshot', () => {
    expect(explain('c').headline).toBe('Shown: its condition is true');
    expect(explain('d').lines[0].text).toMatch(/Rescan/);
  });

  it('has nothing to say about an element with no rule that is visible', () => {
    expect(explain('e')).toEqual({ hidden: false, headline: '', lines: [] });
  });

  it('uses plain words for what the loaded definition says, never the property name', () => {
    expect(explain('d').lines[0].text).toBe(
      'The loaded copy of the definition says it was hidden, but its rules are true now. Rescan to reload it.');
    const plainHidden = [{ key: 'p', name: 'Plain', parentKey: '', shown: false, show: null }];
    const map = Object.fromEntries(plainHidden.map((e) => [e.key, e]));
    const text = explainVisibility(plainHidden[0], computeVisibility(plainHidden, data), map).headline;
    expect(text).toBe('Hidden: the loaded copy of the definition says it was hidden');
    expect(text).not.toMatch(/bShow/);
  });
});

describe('ruleTree', () => {
  const nested = { group: { operator: 'AND', rules: [
    rule('StepA:Age', '>', '18'),
    { group: { operator: 'OR', rules: [rule('StepA:Kind', '=', 'x'), rule('Missing', '=', '=FOO(1)')] } }
  ] } };

  it('turns nested groups into nodes with ALL of / ANY of and a verdict per rule', () => {
    const tree = ruleTree(nested, data);
    expect(tree).toMatchObject({ kind: 'group', operator: 'AND', label: 'ALL of', ok: null });
    const [age, either] = tree.children;
    expect(age).toEqual({
      kind: 'rule', ok: true, field: 'StepA:Age', condition: '>', expected: '18', formula: false, actual: '30',
      estimated: false, expectedEstimated: false, actualEstimated: false, reason: '', edited: false, actualValue: 30
    });
    expect(either).toMatchObject({ kind: 'group', operator: 'OR', label: 'ANY of', ok: null });
    expect(either.children[0]).toMatchObject({ ok: false, field: 'StepA:Kind', expected: '"x"', actual: '"beta"' });
  });

  it('never expands a formula, and says when a value is not set', () => {
    const [, either] = ruleTree(nested, data).children;
    expect(either.children[1]).toMatchObject({ ok: null, formula: true, expected: '(formula)', actual: 'not set' });
  });

  it('judges nothing without data but still draws the rules', () => {
    const tree = ruleTree(nested, undefined);
    expect(tree.ok).toBeNull();
    expect(tree.children[0]).toMatchObject({ ok: null, actual: null, field: 'StepA:Age' });
  });

  it('accepts a bare group and reads a %merge% expected value', () => {
    const tree = ruleTree({ operator: 'OR', rules: [rule('StepA:Kind', '=', '%Other%')] }, data);
    expect(tree).toMatchObject({ label: 'ANY of', ok: true });
    expect(tree.children[0].expected).toBe('"beta"');
  });

  it('is null for a formula string or nothing', () => {
    expect(ruleTree('Age > 17', data)).toBeNull();
    expect(ruleTree(null, data)).toBeNull();
  });
});

describe('describeVerdict', () => {
  const tree = (spec) => ruleTree(spec, data);
  const allOf = (...rules) => ({ operator: 'AND', rules });
  const anyOf = (...rules) => ({ operator: 'OR', rules });

  it('says a script with no rule is always shown', () => {
    expect(describeVerdict(null)).toBe('Always shown');
    expect(describeVerdict(tree({ operator: 'AND', rules: [] }))).toBe('Always shown');
  });

  it('says a rule that holds is shown', () => {
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '>', '18'))))).toBe('Shown: its condition is true');
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '>', '18'), rule('StepA:Kind', '=', 'beta')))))
      .toBe('Shown: its condition is true');
    expect(describeVerdict(tree(anyOf(rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'beta')))))
      .toBe('Shown: at least one condition is true');
  });

  it('names the field, what it holds and what it should be for a single failing rule', () => {
    expect(describeVerdict(tree(allOf(rule('StepA:Kind', '=', 'alpha')))))
      .toBe('Hidden: StepA:Kind is "beta", not "alpha"');
    expect(describeVerdict(tree(allOf(rule('StepA:Kind', '<>', 'beta')))))
      .toBe('Hidden: StepA:Kind is "beta", but must not be "beta"');
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '>', '40')))))
      .toBe('Hidden: StepA:Age is 30, not greater than 40');
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '<', '20')))))
      .toBe('Hidden: StepA:Age is 30, not less than 20');
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '>=', '31')))))
      .toBe('Hidden: StepA:Age is 30, not at least 31');
    expect(describeVerdict(tree(allOf(rule('StepA:Age', '<=', '29')))))
      .toBe('Hidden: StepA:Age is 30, not at most 29');
    expect(describeVerdict(tree(allOf(rule('Nowhere', '=', 'x'))))).toBe('Hidden: Nowhere is not set, not "x"');
  });

  it('counts the failing conditions of an ALL group', () => {
    expect(describeVerdict(tree(allOf(
      rule('StepA:Kind', '=', 'x'), rule('StepA:Age', '>', '40'), rule('StepA:Age', '>', '18')
    )))).toBe('Hidden: 2 of 3 conditions fail');
  });

  it('says fails, not fail, when exactly one condition does', () => {
    expect(describeVerdict(tree(allOf(
      rule('StepA:Kind', '=', 'x'), rule('StepA:Age', '>', '18'), rule('StepA:Age', '>', '19')
    )))).toBe('Hidden: 1 of 3 conditions fails');
  });

  it('says no condition holds for an ANY group', () => {
    expect(describeVerdict(tree(anyOf(
      rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y'), rule('StepA:Kind', '=', 'z')
    )))).toBe('Hidden: no condition is true (0 of 3)');
  });

  it('reads a group holding a single group as that group', () => {
    const nested = { operator: 'AND', rules: [{ group: anyOf(rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y')) }] };
    expect(describeVerdict(tree(nested))).toBe('Hidden: no condition is true (0 of 2)');
  });

  it('cannot judge a formula or an unknown operator, and says what the script shows', () => {
    const formula = tree(allOf(rule('StepA:Kind', '=', '=FOO(1)')));
    expect(describeVerdict(formula, { assumed: false }))
      .toBe('Can\'t tell if this rule is true (a formula or an operator the panel does not evaluate); the script treats it as hidden');
    expect(describeVerdict(formula, { assumed: true }))
      .toBe('Can\'t tell if this rule is true (a formula or an operator the panel does not evaluate); the script treats it as shown');
    expect(describeVerdict(tree(allOf(rule('StepA:Kind', 'contains', 'b'))), { assumed: false })).toMatch(/Can't tell if this rule is true/);
  });

  it('is used for elements that cannot be judged, with what the definition says', () => {
    const els = [
      { key: 'a', name: 'A', parentKey: '', shown: false, show: show('AND', rule('StepA:Kind', '=', '=FOO(1)')) },
      { key: 'b', name: 'B', parentKey: '', shown: true, show: show('AND', rule('StepA:Kind', '=', '=FOO(1)')) }
    ];
    const vis = computeVisibility(els, data);
    const byKey = { a: els[0], b: els[1] };
    expect(explainVisibility(els[0], vis, byKey).headline).toMatch(/Can't tell if this rule is true.*treats it as hidden$/);
    expect(explainVisibility(els[1], vis, byKey).headline).toMatch(/Can't tell if this rule is true.*treats it as shown$/);
  });
});

describe('ruleTree roll-up counts', () => {
  it('counts the failing and holding children of a group', () => {
    const tree = ruleTree({ operator: 'AND', rules: [
      rule('StepA:Kind', '=', 'x'), rule('StepA:Age', '>', '18'), rule('StepA:Age', '>', '40')
    ] }, data);
    expect(tree).toMatchObject({ total: 3, fails: 2, holds: 1 });
  });
});

describe('isCertainlyHidden', () => {
  const elements = [
    { key: 'p', parentKey: '', name: 'P', show: show('AND', rule('Missing', 'contains', 'x')), conditional: true, shown: false },
    { key: 'c', parentKey: 'p', name: 'C', show: null, conditional: false, shown: true },
    { key: 'h', parentKey: '', name: 'H', show: show('AND', rule('StepA:Kind', '=', 'zeta')), conditional: true, shown: true }
  ];

  it('is false for an element hidden only by a rule that cannot be judged, and for what sits under it', () => {
    const out = computeVisibility(elements, data);
    expect(out.p.hidden).toBe(true);
    expect(isCertainlyHidden(out.p)).toBe(false);
    expect(out.c.hidden).toBe(true);
    expect(isCertainlyHidden(out.c)).toBe(false);
  });

  it('is true for an element a judged rule hides', () => {
    expect(isCertainlyHidden(computeVisibility(elements, data).h)).toBe(true);
    expect(isCertainlyHidden(undefined)).toBe(false);
  });
});
