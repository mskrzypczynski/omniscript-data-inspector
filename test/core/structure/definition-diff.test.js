'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { diffDefinitions, elementChanges, definitionFromFile, elementsInside } from '../../../src/core/structure/definition-diff.js';

const el = (name, type = 'Text', propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const show = (field, data) => ({ group: { operator: 'AND', rules: [{ field, condition: '=', data }] } });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements, propSetMap]) => ({
      name, type: 'Step', propSetMap: propSetMap || {}, children: [{ eleArray: elements }]
    }))
  }, null);
}

const base = () => [['Intro', [
  el('Name', 'Text', { label: 'Name', required: true }),
  el('Kind', 'Select', { label: 'Kind', options: [{ name: 'a', value: 'A' }, { name: 'b', value: 'B' }] }),
  el('Lookup', 'Integration Procedure Action', { integrationProcedureKey: 'Acme_Find' })
]], ['Review', [el('Notes', 'Text Block', { text: 'Hello' })]]];

const diff = (steps) => diffDefinitions(build(base()), build(steps));
const namesOf = (list) => list.map((entry) => (entry.element || entry.after).name);

describe('diffDefinitions', () => {
  it('finds nothing in two equal scripts', () => {
    const result = diff(base());
    expect(result).toMatchObject({ added: [], removed: [], renamed: [], changed: [], total: 0 });
    expect(result.unchanged).toBe(6);
  });

  it('copes with empty input', () => {
    expect(diffDefinitions(undefined, undefined).total).toBe(0);
    expect(diffDefinitions([], build(base())).added).toHaveLength(6);
  });

  it('finds an added element and one inside it', () => {
    const steps = base();
    steps[0][1].push(el('Group', 'Block', {}, { children: [{ eleArray: [el('Inner')] }] }));
    const result = diff(steps);
    expect(namesOf(result.added)).toEqual(['Group', 'Inner']);
    expect(result.added[0]).toMatchObject({ path: 'Intro › Group', parentAdded: false });
    expect(result.added[1]).toMatchObject({ path: 'Intro › Group › Inner', parentAdded: true });
    expect(result.total).toBe(2);
  });

  it('finds a removed element and a removed step with what is inside it', () => {
    const steps = base().slice(0, 1);
    steps[0][1] = steps[0][1].filter((e) => e.name !== 'Kind');
    const result = diff(steps);
    expect(namesOf(result.removed)).toEqual(['Kind', 'Review', 'Notes']);
    expect(result.removed.map((r) => r.parentRemoved)).toEqual([false, false, true]);
  });

  it('calls it a rename when the same type sits in the same place under another name', () => {
    const steps = base();
    steps[0][1][0] = el('FullName', 'Text', { label: 'Name', required: true });
    const result = diff(steps);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.renamed).toHaveLength(1);
    expect(result.renamed[0].before.name).toBe('Name');
    expect(result.renamed[0].after.name).toBe('FullName');
    expect(result.renamed[0].changes).toEqual([]);
  });

  it('keeps the children of a renamed parent paired', () => {
    const before = [['Intro', [el('Group', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { label: 'A' })] }] })]]];
    const after = [['Intro', [el('Section', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { label: 'B' })] }] })]]];
    const result = diffDefinitions(build(before), build(after));
    expect(result.renamed.map((r) => r.after.name)).toEqual(['Section']);
    expect(result.changed.map((r) => r.after.name)).toEqual(['Inner']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('does not call a different type at the same place a rename', () => {
    const steps = base();
    steps[0][1][0] = el('Other', 'Number');
    const result = diff(steps);
    expect(namesOf(result.added)).toEqual(['Other']);
    expect(namesOf(result.removed)).toEqual(['Name']);
    expect(result.renamed).toEqual([]);
  });

  it('does not call it a rename when the position differs', () => {
    const before = build([['Intro', [el('A'), el('B')]]]);
    const after = build([['Intro', [el('N'), el('A')]]]);
    const result = diffDefinitions(before, after);
    expect(result.renamed).toEqual([]);
    expect(namesOf(result.added)).toEqual(['N']);
    expect(namesOf(result.removed)).toEqual(['B']);
  });

  it('reports a rename together with an edit', () => {
    const steps = base();
    steps[0][1][0] = el('FullName', 'Text', { label: 'Name', required: false });
    expect(diff(steps).renamed[0].changes).toEqual(['required: yes → no']);
  });

  it('pairs elements that share a name in order', () => {
    const before = build([['Intro', [el('Dup', 'Text', { label: 'one' }), el('Dup', 'Text', { label: 'two' })]]]);
    const after = build([['Intro', [el('Dup', 'Text', { label: 'one' }), el('Dup', 'Text', { label: 'TWO' })]]]);
    const result = diffDefinitions(before, after);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].changes).toEqual(['label: “two” → “TWO”']);
  });

  it('orders changed elements as in the newer script', () => {
    const steps = base();
    steps[0][1][2] = el('Lookup', 'Integration Procedure Action', { integrationProcedureKey: 'Acme_Other' });
    steps[0][1][0] = el('Name', 'Text', { label: 'Name!', required: true });
    expect(diff(steps).changed.map((c) => c.after.name)).toEqual(['Name', 'Lookup']);
  });

  it('ignores what the running script rewrites', () => {
    const steps = base();
    steps[0][1][0] = el('Name', 'Text', { label: 'Name', required: true, bShow: false, asIndex: 3 }, { bShow: false, indexInParent: 9 });
    expect(diff(steps).total).toBe(0);
  });
});

describe('elementChanges', () => {
  const pair = (beforeProps, afterProps, beforeType = 'Text', afterType = beforeType) => {
    const [a] = build([['S', [el('X', beforeType, beforeProps)]]]).slice(1);
    const [b] = build([['S', [el('X', afterType, afterProps)]]]).slice(1);
    return elementChanges(a, b);
  };

  it('says what a label change was', () => {
    expect(pair({ label: 'Old' }, { label: 'New' })).toEqual(['label: “Old” → “New”']);
    expect(pair({}, { label: 'New' })).toEqual(['label: (none) → “New”']);
  });

  it('says a required change', () => {
    expect(pair({}, { required: true })).toEqual(['required: no → yes']);
  });

  it('says a show rule change with both sides', () => {
    const changes = pair({ show: show('S:A', 'x') }, { show: show('S:A', 'y') });
    expect(changes).toEqual(['show rule: “S:A = "x"” → “S:A = "y"”']);
    expect(pair({}, { show: show('S:A', 'x') })).toEqual(['show rule: (none) → “S:A = "x"”']);
  });

  it('says a remote target change', () => {
    expect(pair({ remoteClass: 'A' }, { remoteClass: 'B' }, 'Remote Action')).toEqual(['calls: “A” → “B”']);
  });

  it('summarises options added, removed and changed', () => {
    const was = [{ name: 'a', value: 'A' }, { name: 'b', value: 'B' }, { name: 'c', value: 'C' }];
    const now = [{ name: 'a', value: 'AA' }, { name: 'c', value: 'C' }, { name: 'd', value: 'D' }];
    expect(pair({ options: was }, { options: now }, 'Select')).toEqual(['options: added d; removed b; changed a']);
    expect(pair({ options: was }, { options: [...was].reverse() }, 'Select')).toEqual(['options: reordered']);
  });

  it('summarises Set Values assignments', () => {
    const changes = pair({ elementValueMap: { A: '1', B: '2' } }, { elementValueMap: { A: '9', C: '3' } }, 'Set Values');
    expect(changes).toEqual(['Set Values: added C; removed B; changed A']);
  });

  it('says a help text change', () => {
    expect(pair({ helpText: 'one' }, { helpText: 'two' })).toEqual(['help text: “one” → “two”']);
  });

  it('names the parts of a validation that changed', () => {
    const setErrors = (message, extra = {}) => ({ elementErrorMap: { A: message }, show: show('S:A', 'x'), ...extra });
    expect(pair(setErrors('one'), setErrors('two'), 'Set Errors')).toEqual(['validation: error targets']);
    const expr = (data) => ({ validateExpression: show('S:A', data), messages: [{ type: 'Requirement', text: 'm', value: false, active: true }] });
    expect(pair(expr('x'), expr('y'), 'Messaging')).toContain('validation: expression');
  });

  it('shortens a long value', () => {
    const long = 'x'.repeat(100);
    expect(pair({ helpText: long }, { helpText: 'y' })[0]).toContain(`“${'x'.repeat(60)}…”`);
  });

  it('finds nothing when only runtime keys differ', () => {
    expect(pair({ label: 'A', bVisited: true }, { label: 'A' })).toEqual([]);
  });
});

describe('elementsInside', () => {
  it('lists everything beneath an element', () => {
    const list = build(base());
    const intro = list.find((e) => e.name === 'Intro');
    expect(elementsInside(intro, list).map((e) => e.name)).toEqual(['Name', 'Kind', 'Lookup']);
  });
});

describe('definitionFromFile', () => {
  const def = { bpType: 'demo', children: [{ name: 'S', type: 'Step', children: [] }] };

  it('takes a raw definition', () => {
    expect(definitionFromFile(JSON.stringify(def))).toEqual({ definition: def, from: 'definition' });
  });

  it('takes the definition out of a debug bundle, as text or as an object', () => {
    const bundle = (raw) => JSON.stringify({ generatedAt: 'now', tabs: {}, definition: { elementCount: 1, raw } });
    expect(definitionFromFile(bundle(JSON.stringify(def)))).toEqual({ definition: def, from: 'bundle' });
    expect(definitionFromFile(bundle(def))).toEqual({ definition: def, from: 'bundle' });
  });

  it('says a bundle has no definition', () => {
    const text = JSON.stringify({ generatedAt: 'now', tabs: {}, definition: { elementCount: 1, steps: [] } });
    expect(definitionFromFile(text).error).toMatch(/holds no definition/);
    const unreadable = JSON.stringify({ generatedAt: 'now', tabs: {}, definition: { raw: 'not json' } });
    expect(definitionFromFile(unreadable).error).toMatch(/holds no definition/);
  });

  it('refuses text that is not JSON, and JSON that is not a definition', () => {
    expect(definitionFromFile('{nope').error).toMatch(/not valid JSON/);
    expect(definitionFromFile('[1,2]').error).toMatch(/not an OmniScript definition/);
    expect(definitionFromFile('"text"').error).toMatch(/not an OmniScript definition/);
    expect(definitionFromFile('{"a":1}').error).toMatch(/not an OmniScript definition or a debug bundle/);
  });
});
