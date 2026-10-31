'use strict';

/* Formulas where they meet the script: show rules, Formula elements, Set Values
 * and the Stop-Next count. Everything here is an estimate and must say so. */

import { flatten } from '../../../src/core/shared/structure-model.js';
import {
  evaluateShow, computeVisibility, explainVisibility, ruleTree, describeVerdict, ruleLines
} from '../../../src/core/structure/visibility.js';
import { createEstimator, formulaOf } from '../../../src/core/structure/formula-values.js';
import { stepStoppers, activeMessages } from '../../../src/core/structure/step-validation.js';
import { liveMessaging, liveSetErrors } from '../../../src/core/structure/live-validation.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ field, condition, data });
const show = (operator, ...rules) => ({ group: { operator, rules } });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements]) => ({ name, type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }))
  }, null);
}

describe('a formula in a rule', () => {
  const data = { Intro: { Qty: 3, Price: 10 } };

  it('is evaluated and the verdict is marked estimated', () => {
    const result = evaluateShow(show('AND', rule('Intro:Qty', '=', '=1 + 2')), data);
    expect(result.result).toBe(true);
    expect(result.estimated).toBe(true);
    const leaf = result.tree.children[0];
    expect(leaf).toMatchObject({ result: true, estimated: true, expected: 3, expectedEstimated: true });
  });

  it('reads fields the formula names', () => {
    expect(evaluateShow(show('AND', rule('Intro:Qty', '<', '=%Intro:Price% / 2')), data).result).toBe(true);
    expect(evaluateShow(show('AND', rule('Intro:Qty', '>', '=%Intro:Price% / 2')), data).result).toBe(false);
  });

  it('is not judged when it cannot be evaluated, and says why', () => {
    const result = evaluateShow(show('AND', rule('Intro:Qty', '=', '=FOO(1)')), data);
    expect(result.result).toBeNull();
    expect(result.estimated).toBe(false);
    expect(result.tree.children[0].formulaReason).toBe('Unknown function FOO');
    const node = ruleTree(show('AND', rule('Intro:Qty', '=', '=FOO(1)')), data).children[0];
    expect(node).toMatchObject({ ok: null, formula: true, expected: '(formula)', reason: 'Unknown function FOO' });
  });

  it('is not judged while a field it reads has no value', () => {
    const result = evaluateShow(show('AND', rule('Intro:Qty', '=', '=%Intro:Nope% + 1')), data);
    expect(result.result).toBeNull();
    expect(result.tree.children[0].formulaReason).toBe('No value for %Intro:Nope%');
  });

  it('can be the field of a rule too', () => {
    const result = evaluateShow(show('AND', rule('=%Intro:Qty% * 2', '=', '6')), data);
    expect(result.result).toBe(true);
    expect(result.estimated).toBe(true);
  });

  it('shows ≈ next to the estimate in the rule tree and in the lines', () => {
    const tree = ruleTree(show('AND', rule('Intro:Qty', '=', '=1 + 1')), data);
    const leaf = tree.children[0];
    expect(leaf).toMatchObject({ ok: false, estimated: true, expected: '≈ 2', formula: true, actual: '3' });
    expect(tree.estimated).toBe(true);
    expect(ruleLines(evaluateShow(show('AND', rule('Intro:Qty', '=', '=1 + 1')), data).tree)[0].text)
      .toBe('Intro:Qty = ≈ 2 — currently 3');
  });

  it('puts "(estimated)" on the headline', () => {
    const failing = ruleTree(show('AND', rule('Intro:Qty', '=', '=1 + 1')), data);
    expect(describeVerdict(failing)).toBe('Hidden: Intro:Qty is 3, not ≈ 2 (estimated)');
    const holding = ruleTree(show('AND', rule('Intro:Qty', '=', '=1 + 2')), data);
    expect(describeVerdict(holding)).toBe('Shown: its condition is true (estimated)');
    const plain = ruleTree(show('AND', rule('Intro:Qty', '=', '4')), data);
    expect(describeVerdict(plain)).toBe('Hidden: Intro:Qty is 3, not 4');
  });

  it('is certain when a rule that holds no estimate settles the group', () => {
    const certainFalse = evaluateShow(show('AND', rule('Intro:Qty', '=', '9'), rule('Intro:Qty', '=', '=1 + 1')), data);
    expect(certainFalse).toMatchObject({ result: false, estimated: false });
    const estimatedFalse = evaluateShow(show('AND', rule('Intro:Qty', '=', '3'), rule('Intro:Qty', '=', '=1 + 1')), data);
    expect(estimatedFalse).toMatchObject({ result: false, estimated: true });
    const certainTrue = evaluateShow(show('OR', rule('Intro:Qty', '=', '3'), rule('Intro:Qty', '=', '=1 + 1')), data);
    expect(certainTrue).toMatchObject({ result: true, estimated: false });
    const estimatedTrue = evaluateShow(show('OR', rule('Intro:Qty', '=', '9'), rule('Intro:Qty', '=', '=1 + 2')), data);
    expect(estimatedTrue).toMatchObject({ result: true, estimated: true });
    const allHold = evaluateShow(show('AND', rule('Intro:Qty', '=', '3'), rule('Intro:Qty', '=', '=1 + 2')), data);
    expect(allHold).toMatchObject({ result: true, estimated: true });
  });
});

describe('a rule that reads a Formula element', () => {
  const elements = () => build([['Intro', [
    el('Qty', 'Number'),
    el('Total', 'Formula', { expression: '%Qty% * 2' }),
    el('Big', 'Text', { show: show('AND', rule('Total', '>', '5')) }),
    el('Child', 'Text', {}, { }),
    el('Looped', 'Formula', { expression: '%Looped% + 1' })
  ]]]);

  it('formulaOf reads the expression of a Formula element only', () => {
    const list = elements();
    expect(formulaOf(list.find((e) => e.name === 'Total'))).toBe('%Qty% * 2');
    expect(formulaOf(list.find((e) => e.name === 'Qty'))).toBe('');
  });

  it('uses the estimate while the data holds nothing for the element', () => {
    const list = elements();
    const info = computeVisibility(list, { Intro: { Qty: 4 } })[list.find((e) => e.name === 'Big').key];
    expect(info).toMatchObject({ hidden: false, live: true, estimated: true });
  });

  it('prefers the value the data holds, and then is certain', () => {
    const list = elements();
    const info = computeVisibility(list, { Intro: { Qty: 4, Total: 1 } })[list.find((e) => e.name === 'Big').key];
    expect(info).toMatchObject({ hidden: true, estimated: false });
  });

  it('uses the estimate when the data holds null for a Formula element', () => {
    const list = elements();
    const info = computeVisibility(list, { Intro: { Qty: 4, Total: null } })[list.find((e) => e.name === 'Big').key];
    expect(info).toMatchObject({ hidden: false, estimated: true });
  });

  it('gives no estimate when the formula cannot be evaluated (the field just holds nothing)', () => {
    const list = elements();
    const info = computeVisibility(list, { Intro: {} })[list.find((e) => e.name === 'Big').key];
    expect(info).toMatchObject({ hidden: true, estimated: false });
  });

  it('cuts a formula that needs itself', () => {
    const list = elements();
    const looped = list.find((e) => e.name === 'Looped');
    const estimator = createEstimator(list, { Intro: {} });
    expect(estimator.estimate(looped)).toMatchObject({ ok: false, estimated: true });
    expect(estimator.read('Looped')).toBeUndefined();
  });

  it('estimate() is null for an element that is not a Formula one', () => {
    const list = elements();
    expect(createEstimator(list, {}).estimate(list.find((e) => e.name === 'Qty'))).toBeNull();
  });

  it('read() says whether a value is an estimate', () => {
    const list = elements();
    const estimator = createEstimator(list, { Intro: { Qty: 4 } });
    expect(estimator.read('Qty')).toEqual({ value: 4, estimated: false });
    expect(estimator.read('Total')).toEqual({ value: 8, estimated: true });
    expect(estimator.read('Nothing')).toBeUndefined();
  });
});

describe('visibility through a parent', () => {
  const elements = () => build([['Intro', [
    el('Qty', 'Number'),
    el('Group', 'Block', { show: show('AND', rule('Intro:Qty', '=', '=1 + 1')) }, {
      children: [{ eleArray: [el('Inner', 'Text'), el('Sure', 'Text', { show: show('AND', rule('Intro:Qty', '=', '9')) })] }]
    })
  ]]]);

  it('marks a child of an estimated parent as estimated, and a certain rule as certain', () => {
    const list = elements();
    const vis = computeVisibility(list, { Intro: { Qty: 3 } });
    const by = (name) => vis[list.find((e) => e.name === name).key];
    expect(by('Group')).toMatchObject({ hidden: true, estimated: true });
    expect(by('Inner')).toMatchObject({ hidden: true, estimated: true });
    expect(by('Sure')).toMatchObject({ hidden: true, estimated: false });
  });

  it('adds (estimated) to a "hidden because of a parent" headline', () => {
    const list = elements();
    const vis = computeVisibility(list, { Intro: { Qty: 3 } });
    const byKey = Object.fromEntries(list.map((e) => [e.key, e]));
    const inner = list.find((e) => e.name === 'Inner');
    expect(explainVisibility(inner, vis, byKey).headline).toBe('Hidden because Group is hidden (estimated)');
  });
});

describe('what may stop Next', () => {
  const steps = () => [['Intro', [
    el('Qty', 'Number'),
    el('Gate', 'Text', { required: true, show: show('AND', rule('Intro:Qty', '=', '=1 + 2')) }),
    el('Plain', 'Text', { required: true }),
    el('Warn', 'Set Errors', {
      elementErrorMap: { Qty: 'Too many' }, show: show('AND', rule('Intro:Qty', '>', '=1 + 1'))
    }),
    el('Hard', 'Set Errors', { elementErrorMap: { Qty: 'No' }, show: show('AND', rule('Intro:Qty', '>', '1')) })
  ]]];
  const run = (data) => {
    const list = build(steps());
    const step = list.find((e) => e.name === 'Intro');
    return stepStoppers(list, step.key, data, computeVisibility(list, data));
  };

  it('keeps estimated findings out of the count and lists them apart', () => {
    const result = run({ Intro: { Qty: 3 } });
    expect(result.items.map((i) => i.name)).toEqual(['Plain', 'Hard']);
    expect(result.count).toBe(2);
    expect(result.estimated.map((i) => i.name)).toEqual(['Gate', 'Warn']);
    expect(result.estimated.every((i) => i.estimated)).toBe(true);
    expect(result.required.map((i) => i.name)).toEqual(['Plain']);
    expect(result.firing.map((i) => i.name)).toEqual(['Hard']);
  });

  it('counts nothing that rests on an estimate alone', () => {
    const list = build([['Intro', [
      el('Qty', 'Number'),
      el('Warn', 'Set Errors', { elementErrorMap: { Qty: 'x' }, show: show('AND', rule('Intro:Qty', '>', '=1 + 1')) })
    ]]]);
    const step = list.find((e) => e.name === 'Intro');
    const data = { Intro: { Qty: 3 } };
    const result = stepStoppers(list, step.key, data, computeVisibility(list, data));
    expect(result.count).toBe(0);
    expect(result.estimated).toHaveLength(1);
  });

  it('marks a messaging expression that compares with a formula', () => {
    const list = build([['Intro', [
      el('Qty', 'Number'),
      el('Note', 'Messaging', {
        validateExpression: show('AND', rule('Intro:Qty', '>', '=1 + 1')),
        messages: [{ type: 'Requirement', text: 'Too many', value: true, active: true }]
      })
    ]]]);
    const note = list.find((e) => e.name === 'Note');
    const data = { Intro: { Qty: 3 } };
    expect(activeMessages(note.validation, data)).toMatchObject({ result: true, estimated: true });
    expect(liveMessaging(note.validation, data).headline).toBe('Expression is true (estimated)');
    const step = list.find((e) => e.name === 'Intro');
    const result = stepStoppers(list, step.key, data, computeVisibility(list, data));
    expect(result.count).toBe(0);
    expect(result.estimated.map((i) => i.name)).toEqual(['Note']);
  });

  it('says (estimated) on a Set Errors headline that rests on one', () => {
    const list = build([['Intro', [
      el('Qty', 'Number'),
      el('Warn', 'Set Errors', { elementErrorMap: { Qty: 'x' }, show: show('AND', rule('Intro:Qty', '>', '=1 + 1')) })
    ]]]);
    const warn = list.find((e) => e.name === 'Warn');
    const data = { Intro: { Qty: 3 } };
    const info = computeVisibility(list, data)[warn.key];
    expect(liveSetErrors(warn.validation, info).headline)
      .toBe('Condition is true now: the error is set and blocks Next (estimated)');
  });
});
