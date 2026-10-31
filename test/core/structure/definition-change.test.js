'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { structureSignature, remapKeys, remapSet } from '../../../src/core/structure/definition-change.js';

const field = (name, extra = {}) => ({ name, type: 'Text', propSetMap: {}, ...extra });

function script(steps, extra = {}) {
  return {
    asIndex: 0,
    children: steps.map(([name, elements, stepExtra], i) => ({
      name, type: 'Step', indexInParent: i, propSetMap: { label: name }, ...(stepExtra || {}),
      children: [{ eleArray: elements }]
    })),
    ...extra
  };
}

const base = () => script([
  ['Intro', [field('Greeting'), field('Amount', { propSetMap: { required: true, label: 'Amount' } })]],
  ['Details', [field('Notes')]]
]);

const sig = (definition) => structureSignature(flatten(definition, null));

describe('structureSignature', () => {
  it('is the same for the same definition', () => {
    expect(sig(base())).toBe(sig(base()));
  });

  it('ignores runtime fields: asIndex, bShow and the position in the list', () => {
    const running = base();
    running.asIndex = 1;
    running.children[0].bShow = false;
    running.children[0].children[0].eleArray[0].bShow = false;
    running.children[0].children[0].eleArray[0].indexInParent = 5;
    expect(sig(running)).toBe(sig(base()));
  });

  it.each([
    ['an added element', (d) => d.children[1].children[0].eleArray.push(field('Extra'))],
    ['a renamed element', (d) => { d.children[0].children[0].eleArray[0].name = 'Hello'; }],
    ['a changed type', (d) => { d.children[0].children[0].eleArray[0].type = 'Number'; }],
    ['a changed label', (d) => { d.children[0].children[0].eleArray[0].propSetMap.label = 'Hi'; }],
    ['required switched off', (d) => { d.children[0].children[0].eleArray[1].propSetMap.required = false; }],
    ['a new show rule', (d) => {
      d.children[1].propSetMap.show = { operator: 'AND', rules: [{ field: 'Intro:Greeting', condition: '=', data: 'x' }] };
    }],
    ['a changed show rule value', (d) => {
      d.children[1].propSetMap.show = { operator: 'AND', rules: [{ field: 'Intro:Greeting', condition: '=', data: 'y' }] };
    }],
    ['a remote call', (d) => { d.children[0].children[0].eleArray[0].propSetMap.remoteClass = 'SomeClass'; }],
    ['a JSONPath', (d) => { d.children[0].children[0].eleArray[0].JSONPath = 'Intro:Greeting'; }],
    ['a removed element', (d) => d.children[0].children[0].eleArray.pop()]
  ])('differs after %s', (_, change) => {
    const changed = base();
    change(changed);
    expect(sig(changed)).not.toBe(sig(base()));
  });

  it('differs after a validation message changes', () => {
    const withMessage = (text) => script([['Intro', [{
      name: 'Check', type: 'Set Errors', propSetMap: { elementErrorMap: { Amount: text } }
    }]]]);
    expect(sig(withMessage('Too small'))).not.toBe(sig(withMessage('Too large')));
    expect(sig(withMessage('Too small'))).toBe(sig(withMessage('Too small')));
  });
});

describe('structureSignature and propSetMap edits', () => {
  const eleAt = (d, i = 0) => d.children[0].children[0].eleArray[i];

  it.each([
    ['help text', (d) => { eleAt(d).propSetMap.helpText = 'Say hello'; }],
    ['an option list', (d) => { eleAt(d).propSetMap.options = [{ name: 'a', value: 'A' }]; }],
    ['a Set Values map', (d) => { eleAt(d).propSetMap.elementValueMap = { Amount: '=1+1' }; }],
    ['a custom-label key', (d) => { eleAt(d).propSetMap.label = 'Intro.Greeting.v2'; }],
    ['a nested value', (d) => { eleAt(d).propSetMap.messages = [{ type: 'Info', text: 'x', value: true }]; }]
  ])('differs after %s', (_, change) => {
    const changed = base();
    change(changed);
    expect(sig(changed)).not.toBe(sig(base()));
  });

  it('ignores runtime fields the page writes into propSetMap', () => {
    const running = base();
    Object.assign(eleAt(running).propSetMap, {
      bShow: false, asIndex: 3, __lastSeen: 12, bVisited: true,
      messages: undefined
    });
    expect(sig(running)).toBe(sig(base()));
  });

  it('does not depend on the order of keys', () => {
    const a = base();
    const b = base();
    eleAt(a).propSetMap = { helpText: 'h', options: [{ name: 'x', value: 'y' }] };
    eleAt(b).propSetMap = { options: [{ value: 'y', name: 'x' }], helpText: 'h' };
    expect(sig(a)).toBe(sig(b));
  });
});

describe('remapKeys', () => {
  const keyOf = (elements, name) => elements.find((element) => element.name === name).key;

  it('maps each element to itself when nothing changed', () => {
    const elements = flatten(base(), null);
    const map = remapKeys(elements, flatten(base(), null));
    elements.forEach((element) => expect(map.get(element.key)).toBe(element.key));
  });

  it('follows an element whose key shifted because one was added above it', () => {
    const before = flatten(base(), null);
    const edited = base();
    edited.children[0].children[0].eleArray.unshift(field('Inserted'));
    const after = flatten(edited, null);

    expect(keyOf(after, 'Notes')).not.toBe(keyOf(before, 'Notes'));
    const map = remapKeys(before, after);
    expect(map.get(keyOf(before, 'Notes'))).toBe(keyOf(after, 'Notes'));
    expect(map.get(keyOf(before, 'Amount'))).toBe(keyOf(after, 'Amount'));
  });

  it('drops an element that is gone', () => {
    const before = flatten(base(), null);
    const edited = base();
    edited.children[0].children[0].eleArray.shift();
    const map = remapKeys(before, flatten(edited, null));
    expect(map.has(keyOf(before, 'Greeting'))).toBe(false);
  });

  it('tells two elements with the same name apart by where they sit', () => {
    const twin = () => script([['A', [field('Same')]], ['B', [field('Same')]]]);
    const before = flatten(twin(), null);
    const edited = twin();
    edited.children[0].children[0].eleArray.unshift(field('Extra'));
    const after = flatten(edited, null);
    const map = remapKeys(before, after);
    const sameKeys = (elements) => elements.filter((element) => element.name === 'Same').map((element) => element.key);
    expect(sameKeys(before).map((key) => map.get(key))).toEqual(sameKeys(after));
  });

  it('pairs elements of equal path in order', () => {
    const dupes = () => script([['A', [field('Same'), field('Same')]]]);
    const before = flatten(dupes(), null);
    const map = remapKeys(before, flatten(dupes(), null));
    expect([...map.values()]).toEqual(before.map((element) => element.key));
  });
});

describe('remapSet', () => {
  it('moves the keys over and drops the unknown ones', () => {
    const map = new Map([['a', 'x'], ['b', 'y']]);
    expect([...remapSet(new Set(['a', 'c']), map)]).toEqual(['x']);
  });
});
