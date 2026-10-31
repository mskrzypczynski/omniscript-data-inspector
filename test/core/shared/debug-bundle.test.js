'use strict';

import { buildDebugBundle, bundleFileName, MAX_BUNDLE_CALLS, MAX_BUNDLE_SNAPSHOTS } from '../../../src/core/shared/debug-bundle.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const call = (n) => ({
  time: new Date(1000 * n),
  name: `call ${n}`,
  type: 'ip',
  signature: 'sig',
  flags: [],
  duration: n,
  httpStatus: 200,
  state: 'OK',
  action: { input: { who: 'Ada' }, options: {} },
  output: { total: 42 },
  error: null
});

const base = {
  now: new Date('2030-01-02T03:04:05.000Z'),
  version: '9.9.9',
  script: { key: 'Demo/Sample/English', label: 'Demo', frame: 'f1' },
  step: { key: 'Step1', name: 'Step1', asIndex: 0, visits: [] },
  payload: { prop: 'jsonDataStr', raw: '{"name":"Ada","age":36}', data: { name: 'Ada', age: 36 } },
  elements: [
    { name: 'Step1', category: { key: 'step' } },
    { name: 'Name', category: { key: 'input' } },
    { name: 'Step2', category: { key: 'step' } }
  ],
  calls: [call(1), call(2)],
  masked: false
};

describe('buildDebugBundle', () => {
  it('collects the script, step, payload, step names and calls', () => {
    const bundle = buildDebugBundle(base);
    expect(bundle.generatedAt).toBe('2030-01-02T03:04:05.000Z');
    expect(bundle.extensionVersion).toBe('9.9.9');
    expect(bundle.masked).toBe(false);
    expect(bundle.script).toEqual({ key: 'Demo/Sample/English', label: 'Demo', frame: 'f1' });
    expect(bundle.step.name).toBe('Step1');
    expect(bundle.payload).toEqual({ prop: 'jsonDataStr', value: { name: 'Ada', age: 36 } });
    expect(bundle.definition).toEqual({ elementCount: 3, steps: ['Step1', 'Step2'] });
    expect(bundle.calls.map((c) => c.action)).toEqual(['call 1', 'call 2']);
  });

  it('masks the payload and the calls when given the mask', () => {
    const bundle = buildDebugBundle({ ...base, masked: true }, maskValues);
    expect(bundle.masked).toBe(true);
    expect(bundle.payload.value).toEqual({ name: '<string>', age: '<number>' });
    expect(bundle.calls[0].input).toEqual({ who: '<string>' });
    expect(bundle.calls[0].output).toEqual({ total: '<number>' });
    expect(JSON.stringify(bundle)).not.toMatch(/Ada/);
  });

  it('keeps only the last calls', () => {
    const many = Array.from({ length: MAX_BUNDLE_CALLS + 10 }, (_, i) => call(i + 1));
    const bundle = buildDebugBundle({ ...base, calls: many });
    expect(bundle.calls).toHaveLength(MAX_BUNDLE_CALLS);
    expect(bundle.calls[0].action).toBe('call 11');
  });

  it('chooses the OmniStudio calls before it takes the newest, so other Apex traffic cannot fill the room', () => {
    const own = Array.from({ length: 3 }, (_, i) => ({ ...call(i + 1), omni: true }));
    const noise = Array.from({ length: MAX_BUNDLE_CALLS + 5 }, (_, i) => ({ ...call(i + 10), omni: false }));
    const bundle = buildDebugBundle({ ...base, calls: [...own, ...noise] });
    expect(bundle.calls.map((c) => c.action)).toEqual(['call 1', 'call 2', 'call 3']);
    const all = buildDebugBundle({ ...base, calls: [...own, ...noise], onlyOmni: false });
    expect(all.calls).toHaveLength(MAX_BUNDLE_CALLS);
    expect(all.calls[0].action).toBe('call 15');
  });

  it('includes the raw text when the payload did not parse, unless masking', () => {
    const payload = { prop: 'jsonDataStr', raw: '{oops secret', data: undefined };
    expect(buildDebugBundle({ ...base, payload }).payload.value).toBe('{oops secret');
    const masked = buildDebugBundle({ ...base, payload, masked: true }, maskValues);
    expect(masked.payload.value).toBeNull();
    expect(JSON.stringify(masked)).not.toMatch(/secret/);
  });

  it('tolerates everything missing', () => {
    const bundle = buildDebugBundle({});
    expect(bundle).toEqual({
      generatedAt: null,
      extensionVersion: null,
      masked: false,
      panel: null,
      settings: null,
      script: null,
      step: null,
      payload: { prop: null, value: null },
      history: [],
      definition: { elementCount: 0, steps: [] },
      calls: [],
      tabs: {}
    });
  });
});

describe('buildDebugBundle: the definition', () => {
  const answered = JSON.stringify({
    bpType: 'Demo',
    children: [{
      name: 'Name', type: 'Text',
      propSetMap: { label: 'Your name', defaultValue: 'Ada', response: { value: 'Ada Example', count: 3 }, required: true },
      children: [{ eleArray: [{ name: 'Age', response: 36, defaultValue: 41 }] }]
    }]
  });

  it('carries the definition and header text as read while Mask values is off', () => {
    const definition = { raw: answered, headerRaw: '{"allCustomLabels":{"Hello":"Hi Ada"}}' };
    const bundle = buildDebugBundle({ ...base, masked: false, definition }, (value) => value);
    expect(bundle.definition.raw).toBe(answered);
    expect(bundle.definition.headerRaw).toBe(definition.headerRaw);
    expect(bundle.definition.elementCount).toBe(3);
    expect(bundle.definition.steps).toEqual(['Step1', 'Step2']);
    expect(bundle.definition.note).toBeUndefined();
  });

  it('masks the answers in the definition while Mask values is on, and keeps the keys, names and rules', () => {
    const definition = { raw: answered, headerRaw: '{"allCustomLabels":{"Hello":"Hi Ada"},"response":"x"}' };
    const bundle = buildDebugBundle({ ...base, masked: true, definition }, maskValues);
    const raw = JSON.parse(bundle.definition.raw);
    const field = raw.children[0];
    expect(field.propSetMap.defaultValue).toBe('<string>');
    expect(field.propSetMap.response).toEqual({ value: '<string>', count: '<number>' });
    expect(field.propSetMap.label).toBe('Your name');
    expect(field.propSetMap.required).toBe(true);
    expect(field.children[0].eleArray[0]).toEqual({ name: 'Age', response: '<number>', defaultValue: '<number>' });
    expect(bundle.definition.raw).not.toContain('Ada');
    expect(JSON.parse(bundle.definition.headerRaw)).toEqual({ allCustomLabels: { Hello: 'Hi Ada' }, response: '<string>' });
    expect(bundle.definition.elementCount).toBe(3);
    expect(bundle.definition.steps).toEqual(['Step1', 'Step2']);
    expect(bundle.definition.note).toBeUndefined();
  });

  it('leaves a definition text that cannot be parsed out while Mask values is on, and says so', () => {
    const bundle = buildDebugBundle({ ...base, masked: true, definition: { raw: '{not json "Ada"', headerRaw: '{}' } }, maskValues);
    expect(bundle.definition.raw).toBeUndefined();
    expect(bundle.definition.headerRaw).toBe('{}');
    expect(bundle.definition.note).toBe('Not valid JSON, so it is left out while Mask values is on.');
    expect(JSON.stringify(bundle)).not.toContain('Ada');
    const open = buildDebugBundle({ ...base, masked: false, definition: { raw: '{not json "Ada"' } }, (value) => value);
    expect(open.definition.raw).toBe('{not json "Ada"');
  });

  it('leaves the texts out when the page gave none', () => {
    const bundle = buildDebugBundle({ ...base, definition: { raw: null, headerRaw: '' } });
    expect(Object.keys(bundle.definition)).toEqual(['elementCount', 'steps']);
  });
});

describe('buildDebugBundle: the whole panel', () => {
  const snapshot = (n, raw, step) => ({ raw, time: new Date(1000 * n), ...(step ? { step } : {}) });

  it('carries the tab dumps, settings and the panel size as given', () => {
    const tabs = { data: { view: 'tree' }, structure: { selected: 'Step1' } };
    const bundle = buildDebugBundle({
      ...base,
      settings: { dataProp: 'jsonDataStr', dataChanges: false },
      panel: { width: 800, height: 600, theme: 'dark' },
      tabs
    });
    expect(bundle).not.toHaveProperty('advanced');
    expect(bundle.settings).toEqual({ dataProp: 'jsonDataStr', dataChanges: false });
    expect(bundle.panel).toEqual({ width: 800, height: 600, theme: 'dark' });
    expect(bundle.tabs).toBe(tabs);
  });

  it('lists the payload history with time, step, size and the parsed value', () => {
    const history = [snapshot(1, '{"n":1}'), snapshot(2, '{"n":2}', { name: 'Step2', visitFrom: 0 })];
    const bundle = buildDebugBundle({ ...base, history });
    expect(bundle.history).toEqual([
      { time: '1970-01-01T00:00:01.000Z', bytes: 7, value: { n: 1 } },
      { time: '1970-01-01T00:00:02.000Z', bytes: 7, step: 'Step2', stepFrom: 0, value: { n: 2 } }
    ]);
  });

  it('keeps the last 12 reads only', () => {
    const history = Array.from({ length: MAX_BUNDLE_SNAPSHOTS + 5 }, (_, i) => snapshot(i, `{"i":${i}}`));
    const bundle = buildDebugBundle({ ...base, history });
    expect(bundle.history).toHaveLength(MAX_BUNDLE_SNAPSHOTS);
    expect(bundle.history[0].value).toEqual({ i: 5 });
  });

  it('masks the history values, and gives only the length of text that is not JSON while masking', () => {
    const history = [snapshot(1, '{"name":"Ada"}'), snapshot(2, 'oops Ada')];
    const masked = buildDebugBundle({ ...base, masked: true, history }, maskValues);
    expect(masked.history[0].value).toEqual({ name: '<string>' });
    expect(masked.history[1]).toEqual({
      time: '1970-01-01T00:00:02.000Z', bytes: 8,
      note: 'Not valid JSON, so only its length is given while Mask values is on.'
    });
    expect(JSON.stringify(masked)).not.toMatch(/Ada/);

    const plain = buildDebugBundle({ ...base, history });
    expect(plain.history[1].raw).toBe('oops Ada');
  });
});

describe('bundleFileName', () => {
  it('is a safe name with the timestamp', () => {
    expect(bundleFileName(new Date('2030-01-02T03:04:05.678Z'))).toBe('omniscript-debug-2030-01-02T03-04-05-678Z.json');
  });
});
