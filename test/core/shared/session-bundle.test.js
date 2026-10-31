'use strict';

import {
  parseBundle, savedAt, sessionCaption, sessionHistory, payloadText, definitionTexts, sessionAsIndex, sessionAnswer, sessionHost, sessionVisits
} from '../../../src/core/shared/session-bundle.js';
import { buildDebugBundle } from '../../../src/core/shared/debug-bundle.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const raw = '{"Step1":{"Name":"Ada","Age":36}}';
const definition = { raw: '{"bpType":"Demo","bpSubType":"Flow","bpLang":"English","asIndex":1}', headerRaw: '{"allCustomLabels":{}}' };

const built = (extra = {}, mask) => buildDebugBundle({
  now: new Date('2030-01-02T03:04:05.000Z'),
  script: { key: 'Demo/Flow/English', label: 'c-demo-flow', frame: '' },
  step: { key: 'Step2', name: 'Step2', asIndex: 1, visits: [] },
  payload: { prop: 'jsonDataStr', raw, data: JSON.parse(raw) },
  history: [
    { raw: '{"a":1}', time: new Date(1000) },
    { raw: '{"a":2}', time: new Date(2000), step: { name: 'Step2', visitFrom: 1500 } }
  ],
  definition,
  ...extra
}, mask);

describe('parseBundle', () => {
  it('accepts what buildDebugBundle writes', () => {
    const result = parseBundle(JSON.stringify(built()));
    expect(result.ok).toBe(true);
    expect(result.bundle.script.key).toBe('Demo/Flow/English');
  });

  it('refuses text that is not JSON, and JSON that is not a bundle', () => {
    expect(parseBundle('{nope').ok).toBe(false);
    expect(parseBundle('[1,2]').error).toMatch(/not a debug bundle/);
    expect(parseBundle('{"hello":"world"}').ok).toBe(false);
    expect(parseBundle('null').ok).toBe(false);
  });
});

describe('what a bundle gives a loaded session', () => {
  it('serialises the payload back to the text the page would hold', () => {
    expect(JSON.parse(payloadText(built()))).toEqual(JSON.parse(raw));
  });

  it('uses the raw text of a payload that was not JSON, and not a plain string payload', () => {
    const text = built({ payload: { prop: 'jsonDataStr', raw: 'not json' } });
    expect(payloadText(text)).toBe('not json');
    const string = built({ payload: { prop: 'jsonDataStr', raw: '"hi"', data: 'hi' } });
    expect(payloadText(string)).toBe('"hi"');
  });

  it('falls back to the newest history read when the payload is missing', () => {
    expect(payloadText(built({ payload: { prop: 'jsonDataStr', raw: null } }))).toBe('{"a":2}');
    expect(payloadText({})).toBeNull();
  });

  it('shows the placeholders of a masked bundle', () => {
    const masked = built({ masked: true }, maskValues);
    expect(JSON.parse(payloadText(masked))).toEqual({ Step1: { Name: '<string>', Age: '<number>' } });
  });

  it('keeps the definition texts, the step index and when it was saved', () => {
    const bundle = built();
    expect(definitionTexts(bundle)).toEqual(definition);
    expect(definitionTexts({})).toEqual({ raw: null, headerRaw: null });
    expect(sessionAsIndex(bundle)).toBe(1);
    expect(sessionAsIndex({ step: { asIndex: 'x' } })).toBeNull();
    expect(savedAt(bundle).toISOString()).toBe('2030-01-02T03:04:05.000Z');
    expect(savedAt({ generatedAt: 'never' })).toBeNull();
  });

  it('turns the history into entries oldest first, with the step each was read on', () => {
    const list = sessionHistory(built());
    expect(list.map((entry) => entry.raw)).toEqual(['{"a":1}', '{"a":2}']);
    expect(list[0].time.getTime()).toBe(1000);
    expect(list[0].step).toBeUndefined();
    expect(list[1].step).toEqual({ name: 'Step2', visitFrom: 1500 });
  });

  it('skips a read that could not be kept, and a repeat of the one before', () => {
    const bundle = { history: [{ value: { a: 1 } }, { value: { a: 1 } }, { note: 'Not valid JSON, so only its length is given while Mask values is on.' }, 7, { raw: 'text' }] };
    expect(sessionHistory(bundle).map((entry) => entry.raw)).toEqual(['{"a":1}', 'text']);
  });
});

describe('sessionAnswer', () => {
  const props = { data: 'jsonDataStr', def: 'jsonDef' };

  it('answers each property from the bundle', () => {
    const bundle = built();
    expect(JSON.parse(sessionAnswer(bundle, 'jsonDataStr', props))).toEqual(JSON.parse(raw));
    expect(sessionAnswer(bundle, 'jsonDef', props)).toBe(definition.raw);
    expect(sessionAnswer(bundle, 'scriptHeaderDef', props)).toBe(definition.headerRaw);
    expect(sessionAnswer(bundle, 'somethingElse', props)).toBeNull();
  });

  it('answers the payload for the property the bundle was saved with', () => {
    const bundle = built({ payload: { prop: 'myData', raw, data: JSON.parse(raw) } });
    expect(sessionAnswer(bundle, 'myData', props)).not.toBeNull();
  });

  it('answers nothing for a definition an older bundle did not keep', () => {
    expect(sessionAnswer(built({ definition: undefined }), 'jsonDef', props)).toBeNull();
  });
});

describe('the picker entry', () => {
  it('names the script and the file', () => {
    expect(sessionCaption(built(), 'bug.json')).toBe('Demo/Flow/English (loaded from bug.json)');
    expect(sessionCaption({}, '')).toBe('Bundle');
  });

  it('is a top-level host with the sizes of what the bundle holds', () => {
    const host = sessionHost(built(), 'bug.json');
    expect(host).toEqual(expect.objectContaining({
      key: 'Demo/Flow/English', label: 'c-demo-flow', frame: '', local: 0, top: true, session: true,
      caption: 'Demo/Flow/English (loaded from bug.json)', defLen: definition.raw.length
    }));
    expect(host.dataLen).toBe(payloadText(built()).length);
  });
});

describe('sessionVisits', () => {
  it('gives the steps the bundle was saved with, oldest first', () => {
    const bundle = { step: { key: 's2', visits: [
      { key: 's1', name: 'Account', from: 1000, to: 2000 },
      { key: 's2', name: 'Review', from: 2000, to: null }
    ] } };
    expect(sessionVisits(bundle)).toEqual([
      { key: 's1', name: 'Account', from: 1000, to: 2000 },
      { key: 's2', name: 'Review', from: 2000, to: null }
    ]);
  });

  it('gives none for a bundle without visits, or with ones that cannot place a call', () => {
    expect(sessionVisits({})).toEqual([]);
    expect(sessionVisits(null)).toEqual([]);
    expect(sessionVisits({ step: { key: 's1' } })).toEqual([]);
    expect(sessionVisits({ step: { visits: [null, 'x', { key: 's1', name: 'A' }, { key: 's2', from: 'soon' }] } })).toEqual([]);
  });

  it('copes with a missing name or end', () => {
    expect(sessionVisits({ step: { visits: [{ key: 's1', from: 5, to: 'never' }] } }))
      .toEqual([{ key: 's1', name: '', from: 5, to: null }]);
  });
});
