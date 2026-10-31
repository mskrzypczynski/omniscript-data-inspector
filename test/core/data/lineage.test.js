'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { lastChange, callFor, changeNote, writersOf, lineageFor } from '../../../src/core/data/lineage.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements]) => ({ name, type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }))
  }, null);
}

const T = (h, m, s) => new Date(2030, 0, 2, h, m, s);
const change = (path, time, extra = {}) => ({ id: 1, time, step: 'Step1', path, text: path, kind: 'changed', before: 'a', after: 'b', ...extra });
const call = (id, name, start, duration = 1000) => ({ id, name, time: start, duration });

describe('lastChange', () => {
  it('is the newest entry for exactly that path', () => {
    const log = [change('A', T(10, 0, 0), { after: 1 }), change('B', T(10, 0, 1)), change('A', T(10, 0, 2), { after: 2 })];
    expect(lastChange('A', log).after).toBe(2);
    expect(lastChange('A\u0001x', log)).toBeNull();
    expect(lastChange('C', log)).toBeNull();
    expect(lastChange('A', undefined)).toBeNull();
  });
});

describe('callFor', () => {
  const entry = change('A', T(10, 42, 3));

  it('finds the call whose window holds the change', () => {
    const calls = [call(1, 'Early', T(10, 40, 0)), call(2, 'Onboarding_GetPlans', T(10, 42, 1), 1500)];
    expect(callFor(entry, calls).id).toBe(2);
  });

  it('allows five seconds after the call ended, not more', () => {
    const calls = [call(1, 'Quote', T(10, 42, 0), 1000)]; // ended 10:42:01, window to 10:42:06
    expect(callFor(change('A', T(10, 42, 6)), calls).id).toBe(1);
    expect(callFor(change('A', T(10, 42, 7)), calls)).toBeNull();
  });

  it('ignores a call that started after the change', () => {
    expect(callFor(entry, [call(1, 'Late', T(10, 42, 4))])).toBeNull();
  });

  it('takes the call that started last when windows overlap', () => {
    const calls = [call(1, 'Slow', T(10, 42, 0), 4000), call(2, 'Fast', T(10, 42, 2), 200)];
    expect(callFor(entry, calls).id).toBe(2);
  });

  it('treats a call with an unknown duration as ending when it started', () => {
    expect(callFor(entry, [call(1, 'NoTime', T(10, 42, 0), null)]).id).toBe(1);
  });

  it('is null without a change or calls', () => {
    expect(callFor(null, [call(1, 'x', T(10, 0, 0))])).toBeNull();
    expect(callFor(entry, [])).toBeNull();
    expect(callFor(entry, undefined)).toBeNull();
  });
});

describe('changeNote', () => {
  it('names the time and the call', () => {
    expect(changeNote(change('A', T(10, 42, 3)), call(2, 'Onboarding_GetPlans', T(10, 42, 1)))).toBe('Last changed 10:42:03 after Onboarding_GetPlans');
  });

  it('drops the call when there is none, and is empty without a change', () => {
    expect(changeNote(change('A', T(9, 5, 7)), null)).toBe('Last changed 09:05:07');
    expect(changeNote(null, null)).toBe('');
  });
});

describe('writersOf', () => {
  const elements = build([
    ['Step1', [
      el('Plan', 'Select'),
      el('Fill', 'Set Values', { elementValueMap: { Plan: 'Gold', 'Step1:Note': 'x', Other: 'y' } })
    ]],
    ['Step2', [
      el('Later', 'Set Values', { elementValueMap: { Plan: 'Silver' } })
    ]]
  ]);
  const data = { Step1: { Plan: 'Gold', Note: 'x' } };

  it('lists the Set Values elements that write the element owning the place', () => {
    const names = writersOf('Step1\u0001Plan', elements, data).map((writer) => writer.name);
    expect(names).toEqual(['Fill', 'Later']);
  });

  it('gives the assignment that matched', () => {
    expect(writersOf('Step1\u0001Plan', elements, data)[0]).toEqual(
      expect.objectContaining({ name: 'Fill', target: 'Plan', expression: 'Gold' }));
  });

  it('matches a target that is no element by the end of its keys', () => {
    const writers = writersOf('Step1\u0001Note', elements, data);
    expect(writers.map((writer) => [writer.name, writer.target])).toEqual([['Fill', 'Step1:Note']]);
  });

  it('counts repeat positions out of the path', () => {
    const repeated = build([['Step1', [
      el('Rows', 'Block', {}, { children: [{ eleArray: [el('Code', 'Text')] }] }),
      el('Fill', 'Set Values', { elementValueMap: { Code: '1' } })
    ]]]);
    const rows = { Step1: { Rows: [{ Code: 'a' }, { Code: 'b' }] } };
    expect(writersOf('Step1\u0001Rows\u00011\u0001Code', repeated, rows).map((writer) => writer.name)).toEqual(['Fill']);
  });

  it('is empty for a place nothing writes, and when there is no Set Values', () => {
    expect(writersOf('Step1', elements, data)).toEqual([]);
    expect(writersOf('', elements, data)).toEqual([]);
    expect(writersOf('Step1\u0001Plan', build([['Step1', [el('Plan', 'Select')]]]), data)).toEqual([]);
    expect(writersOf('Step1\u0001Plan', [], data)).toEqual([]);
  });
});

describe('lineageFor', () => {
  const elements = build([['Step1', [el('Plan', 'Select'), el('Fill', 'Set Values', { elementValueMap: { Plan: 'Gold' } })]]]);
  const data = { Step1: { Plan: 'Gold' } };
  const path = 'Step1\u0001Plan';

  it('puts the change, its call and the writers together', () => {
    const result = lineageFor(path, {
      changes: [change(path, T(10, 42, 3))], calls: [call(2, 'Onboarding_GetPlans', T(10, 42, 1))], elements, data
    });
    expect(result.change.path).toBe(path);
    expect(result.call.id).toBe(2);
    expect(result.writers.map((writer) => writer.name)).toEqual(['Fill']);
    expect(result.empty).toBe(false);
  });

  it('gives only what is known', () => {
    const noLog = lineageFor(path, { changes: [], calls: [call(2, 'x', T(10, 0, 0))], elements, data });
    expect(noLog.change).toBeNull();
    expect(noLog.call).toBeNull();
    expect(noLog.writers).toHaveLength(1);
    expect(noLog.empty).toBe(false);
  });

  it('is empty when nothing is known', () => {
    const result = lineageFor('Step1\u0001Other', { changes: [], calls: [], elements, data });
    expect(result).toEqual({ change: null, call: null, writers: [], empty: true });
    expect(lineageFor('x').empty).toBe(true);
  });
});
