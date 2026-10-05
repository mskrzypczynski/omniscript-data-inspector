'use strict';

import {
  compare, evaluateShow, failingRules, describeFailure, computeVisibility, explainVisibility
} from '../../src/core/visibility.js';

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

  it('cannot judge unknown operators or objects', () => {
    expect(compare('a', 'contains', 'a')).toBeNull();
    expect(compare({ a: 1 }, '=', 'a')).toBeNull();
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

  it('says none of the rules of an OR holds', () => {
    const els = [{ key: 'a', name: 'A', parentKey: '', shown: true,
      show: show('OR', rule('StepA:Kind', '=', 'x'), rule('StepA:Kind', '=', 'y')) }];
    const vis = computeVisibility(els, data);
    expect(explainVisibility(els[0], vis, { a: els[0] }).headline)
      .toBe('Hidden: none of these holds — StepA:Kind should be "x", but is "beta"; StepA:Kind should be "y", but is "beta"');
  });

  it('is empty when the group is true or unknown', () => {
    expect(failingRules(evaluateShow(show('AND', rule('StepA:Kind', '=', 'beta')), data).tree)).toEqual([]);
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
    expect(why.headline).toBe('Hidden: StepA:Kind should be "alpha", but is "beta"');
    expect(why.lines).toEqual([{ ok: false, text: 'StepA:Kind = "alpha" — currently "beta"' }]);
  });

  it('blames the hidden parent for a child', () => {
    const why = explain('b');
    expect(why.headline).toBe('Hidden because Parent is hidden');
    expect(why.lines[0].text).toMatch(/^Hidden: StepA:Kind/);
  });

  it('confirms a visible element whose rules hold, and flags a stale snapshot', () => {
    expect(explain('c').headline).toBe('Visible: its show rules currently hold');
    expect(explain('d').lines[0].text).toMatch(/Rescan/);
  });

  it('has nothing to say about an element with no rule that is visible', () => {
    expect(explain('e')).toEqual({ hidden: false, headline: '', lines: [] });
  });
});
