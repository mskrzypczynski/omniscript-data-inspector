'use strict';

import { SEP } from '../../../src/core/shared/json-tree-model.js';
import { expressionId, MAX_EXPRESSIONS } from '../../../src/core/data/watch-expr.js';
import { pinsToWrite, pinsToRestore, pinsKey, MAX_SCRIPTS, MAX_PATHS } from '../../../src/core/data/pins-store.js';

const p = (...parts) => parts.join(SEP);
const KEY = 'Account/Onboarding/English';
const list = (extra = {}) => ({ paths: [p('Step', 'Name')], expressions: ['Step:Total > 100'], notify: [], ...extra });

describe('pinsKey', () => {
  it('is the script\'s Type/SubType/Language', () => {
    expect(pinsKey({ frame: '', key: KEY, label: 'c-os' })).toBe(KEY);
  });

  it('is empty for a script with no key, or no script', () => {
    expect(pinsKey({ frame: '', key: '', label: 'c-os' })).toBe('');
    expect(pinsKey(null)).toBe('');
    expect(pinsKey(undefined)).toBe('');
    expect(pinsKey({ key: 'x'.repeat(400) })).toBe('');
  });
});

describe('pinsToWrite', () => {
  it('stores the paths, expressions and bells under the script\'s key', () => {
    const bells = [p('Step', 'Name'), expressionId('Step:Total > 100')];
    expect(pinsToWrite(undefined, KEY, list({ notify: bells }))).toEqual({ [KEY]: { paths: [p('Step', 'Name')], expressions: ['Step:Total > 100'], notify: bells } });
  });

  it('keeps the other scripts as they were, and puts this one last', () => {
    const stored = { A: { paths: ['a'], expressions: [], notify: [] }, [KEY]: { paths: ['old'], expressions: [], notify: [] }, B: { paths: ['b'], expressions: [], notify: [] } };
    const next = pinsToWrite(stored, KEY, list());
    expect(Object.keys(next)).toEqual(['A', 'B', KEY]);
    expect(next[KEY].paths).toEqual([p('Step', 'Name')]);
    expect(next.A).toEqual(stored.A);
  });

  it('leaves the script out when nothing is watched any more', () => {
    const stored = { [KEY]: { paths: ['a'], expressions: [], notify: [] }, B: { paths: ['b'], expressions: [], notify: [] } };
    expect(pinsToWrite(stored, KEY, { paths: [], expressions: [], notify: [] })).toEqual({ B: stored.B });
    expect(pinsToWrite(undefined, KEY, { paths: [], expressions: [], notify: [] })).toEqual({});
  });

  it('keeps at most 50 scripts, dropping the oldest', () => {
    let stored = {};
    for (let i = 0; i < MAX_SCRIPTS + 5; i++) stored = pinsToWrite(stored, `S${i}`, { paths: [`p${i}`], expressions: [], notify: [] });
    const names = Object.keys(stored);
    expect(names).toHaveLength(MAX_SCRIPTS);
    expect(names[0]).toBe('S5');
    expect(names[names.length - 1]).toBe(`S${MAX_SCRIPTS + 4}`);
  });

  it('a script written again moves to the newest place', () => {
    let stored = {};
    for (let i = 0; i < MAX_SCRIPTS; i++) stored = pinsToWrite(stored, `S${i}`, { paths: ['p'], expressions: [], notify: [] });
    stored = pinsToWrite(stored, 'S0', { paths: ['q'], expressions: [], notify: [] });
    stored = pinsToWrite(stored, 'New', { paths: ['p'], expressions: [], notify: [] });
    expect(Object.keys(stored)).not.toContain('S1');
    expect(Object.keys(stored)).toContain('S0');
  });

  it('keeps at most 50 paths and 20 expressions of a script', () => {
    const paths = Array.from({ length: MAX_PATHS + 10 }, (_, i) => `p${i}`);
    const expressions = Array.from({ length: MAX_EXPRESSIONS + 5 }, (_, i) => `Name${i}`);
    const entry = pinsToWrite(undefined, KEY, { paths, expressions, notify: [] })[KEY];
    expect(entry.paths).toHaveLength(MAX_PATHS);
    expect(entry.paths[0]).toBe('p0');
    expect(entry.expressions).toHaveLength(MAX_EXPRESSIONS);
  });

  it('takes only text, once each, and not too long', () => {
    const entry = pinsToWrite(undefined, KEY, {
      paths: ['a', 'a', 5, null, {}, '', 'x'.repeat(2000), ['b'], 'c'],
      expressions: [7, 'Step:Total'],
      notify: 'nope'
    })[KEY];
    expect(entry.paths).toEqual(['a', 'c']);
    expect(entry.expressions).toEqual(['Step:Total']);
    expect(entry.notify).toEqual([]);
  });

  it('drops a path that starts with an expression\'s marker or points at a removed row', () => {
    const gone = p('Rows', '\u0002gone:1', 'Code');
    const entry = pinsToWrite(undefined, KEY, {
      paths: ['\u0002Step:Total > 100', gone, p('Step', 'Name')],
      expressions: ['Step:Total > 100'],
      notify: [expressionId('Step:Total > 100'), gone]
    })[KEY];
    expect(entry.paths).toEqual([p('Step', 'Name')]);
    expect(entry.expressions).toEqual(['Step:Total > 100']);
    expect(entry.notify).toEqual([expressionId('Step:Total > 100')]); // the bell is the expression's; the path that looked like it is gone
  });

  it('does not store an expression that does not parse', () => {
    const entry = pinsToWrite(undefined, KEY, { paths: ['a'], expressions: ['Step:Total >', 'Step:Total > 1'], notify: [] })[KEY];
    expect(entry.expressions).toEqual(['Step:Total > 1']);
  });

  it('keeps a bell only for what is kept', () => {
    const entry = pinsToWrite(undefined, KEY, { paths: ['a'], expressions: ['B'], notify: ['a', 'gone', expressionId('B'), expressionId('gone'), 'B'] })[KEY];
    expect(entry.notify).toEqual(['a', expressionId('B')]);
  });

  it('cleans what was stored before, and ignores a stored value that is not an object', () => {
    expect(pinsToWrite('junk', KEY, list())).toEqual({ [KEY]: expect.any(Object) });
    expect(pinsToWrite([1], KEY, list())).toEqual({ [KEY]: expect.any(Object) });
    const next = pinsToWrite({ A: 'junk', B: { paths: 'x' }, C: { paths: ['c'] } }, KEY, list());
    expect(Object.keys(next)).toEqual(['C', KEY]);
  });

  it('never writes a key that would reach the object\'s prototype', () => {
    const next = pinsToWrite(JSON.parse('{"__proto__":{"paths":["a"]}}'), '__proto__', list());
    expect(Object.keys(next)).toEqual([]);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
  });

  it('does not write for a script without a key', () => {
    expect(pinsToWrite({ B: { paths: ['b'], expressions: [], notify: [] } }, '', list())).toEqual({ B: { paths: ['b'], expressions: [], notify: [] } });
  });

  it('does not change what it was given', () => {
    const stored = { B: { paths: ['b'], expressions: [], notify: [] } };
    const copy = JSON.parse(JSON.stringify(stored));
    const given = list();
    const givenCopy = JSON.parse(JSON.stringify(given));
    pinsToWrite(stored, KEY, given);
    expect(stored).toEqual(copy);
    expect(given).toEqual(givenCopy);
  });
});

describe('pinsToRestore', () => {
  const none = { paths: [], expressions: [], notify: [] };

  it('gives back what was stored for the script', () => {
    const bells = [p('Step', 'Name')];
    const stored = pinsToWrite(undefined, KEY, list({ notify: bells }));
    expect(pinsToRestore(stored, KEY)).toEqual({ paths: [p('Step', 'Name')], expressions: ['Step:Total > 100'], notify: bells });
  });

  it('gives nothing for another script, no key, or nothing stored', () => {
    const stored = pinsToWrite(undefined, KEY, list());
    expect(pinsToRestore(stored, 'Other/Script/English')).toEqual(none);
    expect(pinsToRestore(stored, '')).toEqual(none);
    expect(pinsToRestore(undefined, KEY)).toEqual(none);
    expect(pinsToRestore(null, KEY)).toEqual(none);
    expect(pinsToRestore('junk', KEY)).toEqual(none);
    expect(pinsToRestore([], KEY)).toEqual(none);
  });

  it('takes only arrays of text, and at most 50 paths', () => {
    expect(pinsToRestore({ [KEY]: { paths: 'a', expressions: { 0: 'b' }, notify: 5 } }, KEY)).toEqual(none);
    expect(pinsToRestore({ [KEY]: { paths: ['a', 1, null, {}, 'b'] } }, KEY).paths).toEqual(['a', 'b']);
    const many = Array.from({ length: 80 }, (_, i) => `p${i}`);
    expect(pinsToRestore({ [KEY]: { paths: many } }, KEY).paths).toHaveLength(50);
  });

  it('drops an expression that does not parse, and a bell for something gone', () => {
    const restored = pinsToRestore({ [KEY]: { paths: ['a'], expressions: ['> 3', 'B'], notify: ['a', 'zzz', expressionId('B')] } }, KEY);
    expect(restored.expressions).toEqual(['B']);
    expect(restored.notify).toEqual(['a', expressionId('B')]);
  });

  it('does not put back a path that starts with an expression\'s marker or points at a removed row', () => {
    const stored = { [KEY]: { paths: ['\u0002Step:Total > 100', p('\u0002gone:2', 'x'), p('Step', 'Name')], expressions: [], notify: ['\u0002Step:Total > 100'] } };
    expect(pinsToRestore(stored, KEY)).toEqual({ paths: [p('Step', 'Name')], expressions: [], notify: [] });
  });

  it('does not take a key that only the object\'s prototype has', () => {
    expect(pinsToRestore({}, 'toString')).toEqual(none);
    expect(pinsToRestore({}, '__proto__')).toEqual(none);
  });
});
