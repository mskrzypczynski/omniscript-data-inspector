'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { unusedKeys, PLATFORM_KEYS } from '../../../src/core/data/unused.js';

const p = (...parts) => parts.join(SEP);
const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements]) => ({ name, type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }))
  }, null);
}

const paths = (result) => result.keys.map((key) => key.path);

describe('unusedKeys', () => {
  it('leaves a key unused when no element reads it', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const data = { Step1: { Name: 'Ada' }, Other: { A: 1, B: 'two' } };
    const result = unusedKeys(data, elements);
    expect(paths(result)).toEqual(['Other']);
    expect(result.keys[0].size).toBe(JSON.stringify(data.Other).length);
    expect(result.total).toBe(result.keys[0].size);
  });

  it('reports the share of the whole payload, with one decimal', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const data = { Step1: { Name: 'Ada' }, Other: 'x'.repeat(98) };
    const whole = JSON.stringify(data).length;
    const result = unusedKeys(data, elements);
    expect(result.keys[0].share).toBe(Math.round((result.keys[0].size / whole) * 1000) / 10);
    expect(result.share).toBe(result.keys[0].share);
  });

  it('finds the unused keys inside a step', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const result = unusedKeys({ Step1: { Name: 'Ada', Leftover: 'x' } }, elements);
    expect(paths(result)).toEqual([p('Step1', 'Leftover')]);
  });

  it('counts a key as used when an element has its name (and not another spelling)', () => {
    const elements = build([['Step1', [el('Email', 'Text')]]]);
    const result = unusedKeys({ Step1: { Email: 'a', email: 'b' } }, elements);
    expect(paths(result)).toEqual([p('Step1', 'email')]);
  });

  it('counts a key a show rule, a validation, a merge field or a formula reads as used', () => {
    const elements = build([['Step1', [
      el('Name', 'Text', { show: rule('Prefill:Kind', '=', 'x') }),
      el('Age', 'Number', { validateExpression: { group: rule('Check:Limit', '>', '1') } }),
      el('Note', 'Text Block', { text: 'Hello %Greeting:Word%' }),
      el('Total', 'Formula', { expression: '=%Sum:Part% + 1' })
    ]]]);
    const data = {
      Step1: {}, Prefill: { Kind: 1 }, Check: { Limit: 1 }, Greeting: { Word: 'hi' }, Sum: { Part: 2 }, Spare: { Junk: 3 }
    };
    expect(paths(unusedKeys(data, elements))).toEqual(['Spare']);
  });

  it('counts a Set Values target and its source as used', () => {
    const elements = build([['Step1', [
      el('Fill', 'Set Values', { elementValueMap: { X: '%Source:Value%', 'Y:Z': 'literal' } })
    ]]]);
    const data = { Step1: {}, X: 1, Y: { Z: 2 }, Source: { Value: 3 }, Spare: 4 };
    expect(paths(unusedKeys(data, elements))).toEqual(['Spare']);
  });

  it('judges the keys of every row of a repeat block', () => {
    const elements = build([['Step1', [
      el('Rows', 'Block', {}, { children: [{ eleArray: [el('Code', 'Text')] }] })
    ]]]);
    const data = { Step1: { Rows: [{ Code: 'a', Junk: 'xx' }, { Code: 'b' }, { Code: 'c', Junk: 'y' }] } };
    const result = unusedKeys(data, elements);
    expect(paths(result)).toEqual([p('Step1', 'Rows', 0, 'Junk'), p('Step1', 'Rows', 2, 'Junk')]);
  });

  it('does not take apart an element\'s own value', () => {
    const elements = build([['Step1', [el('Account', 'Lookup'), el('Load', 'DataRaptor Extract Action')]]]);
    const data = { Step1: { Account: { Id: '1', Name: 'x' } }, Load: { Response: { A: 1 } } };
    expect(unusedKeys(data, elements).keys).toEqual([]);
  });

  it('does not judge what is under a name a reference runs through', () => {
    const elements = build([['Step1', [el('Name', 'Text', { label: '%Account:Name%' })]]]);
    const result = unusedKeys({ Step1: {}, Account: { Name: 'x', Id: 'y' } }, elements);
    expect(result.keys).toEqual([]);
  });

  it('counts a key a reference to a branch above it covers as used', () => {
    const elements = build([['Step1', [el('Note', 'Text Block', { text: '%Account%' })]]]);
    expect(unusedKeys({ Step1: {}, Account: { Name: 'x' } }, elements).keys).toEqual([]);
  });

  it('never lists the keys the platform writes', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const data = { Step1: { Name: 'a' } };
    PLATFORM_KEYS.forEach((key) => { data[key] = 'x'; });
    expect(unusedKeys(data, elements).keys).toEqual([]);
    ['timeStamp', 'userId', 'ContextId', 'error', 'vlcPersistentComponent'].forEach((key) => expect(PLATFORM_KEYS.has(key)).toBe(true));
  });

  it('lists the largest first, ties in tree order', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const data = { Step1: {}, Small: 'a', Big: 'xxxxxxxxxx', Other: 'b' };
    expect(paths(unusedKeys(data, elements))).toEqual(['Big', 'Small', 'Other']);
  });

  it('reports a whole unused branch once, not every key in it', () => {
    const elements = build([['Step1', [el('Name', 'Text')]]]);
    const result = unusedKeys({ Step1: {}, Dead: { A: { B: 1 }, C: 2 } }, elements);
    expect(paths(result)).toEqual(['Dead']);
  });

  it('has nothing to say without elements or a payload', () => {
    expect(unusedKeys({ A: 1 }, [])).toEqual({ keys: [], total: 0, share: 0 });
    expect(unusedKeys(undefined, build([['S', []]]))).toEqual({ keys: [], total: 0, share: 0 });
    expect(unusedKeys('text', build([['S', []]]))).toEqual({ keys: [], total: 0, share: 0 });
    expect(unusedKeys({}, build([['S', []]])).keys).toEqual([]);
  });

  describe('an action\'s send and response settings', () => {
    it('counts the data a Data Mapper action sends or lands as used', () => {
      const elements = build([['S1', [el('DR1', 'DataRaptor Turbo Action', { sendJSONPath: 'Applicant', responseJSONNode: 'Result' })]]]);
      const data = { S1: { DR1: { x: 1 } }, Applicant: { a: 1 }, Result: { b: 2 }, Leftover: 3 };
      expect(paths(unusedKeys(data, elements))).toEqual(['Leftover']);
    });

    it('reads a path with : steps and |N positions, as a reference', () => {
      const elements = build([['S1', [el('IP1', 'Integration Procedure Action', { sendJSONPath: 'Applicant:Rows|2:Code', sendJSONNode: 'Cust' })]]]);
      const data = { S1: { IP1: {} }, Applicant: { Rows: [{ Code: 1, Junk: 2 }], Name: 'a' }, Cust: { x: 1 } };
      expect(paths(unusedKeys(data, elements))).toEqual([]);
    });
  });
});
