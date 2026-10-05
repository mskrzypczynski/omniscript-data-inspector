'use strict';

/* Characterization tests for src/core/structure-model.js — the Structure tab's
 * domain model: flattening an OmniScript definition and reading each
 * element's current value. Each case names the OmniScript quirk it pins. */

import {
  makeResolver, stripHtml, resolveText, elementLabel, missingLabels,
  optionLabelMap, flatten, categoryOf, describeShow, formatRule,
  describeValidation, valueFor, resolvePath, resolveElementValue,
  displayValue, preview, parseObj, executionStatus
} from '../../src/core/structure-model.js';

/* ------------------------------------------------------------ makeResolver */

describe('makeResolver', () => {
  it('flags a script multi-language only when bpLang says so', () => {
    expect(makeResolver({ bpLang: 'Multi-Language' }).multiLang).toBe(true);
    expect(makeResolver({ bpLang: 'English' }).multiLang).toBe(false);
    expect(makeResolver(null).multiLang).toBe(false);
  });

  it('resolves a known key and returns empty for one that is absent', () => {
    const resolver = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { Greeting: 'Hello' } });
    expect(resolver.key('Greeting')).toBe('Hello');
    expect(resolver.key('Missing')).toBe('');
    expect(resolver.has('Greeting')).toBe(true);
    expect(resolver.has('Missing')).toBe(false);
  });

  it('tolerates a label value stored as an object, not a bare string', () => {
    const resolver = makeResolver({ allCustomLabels: { K: { value: 'V' } } });
    expect(resolver.key('K')).toBe('V');
  });

  it('reports hasLabels false when allCustomLabels is empty or missing, so "missing" checks are not trusted', () => {
    expect(makeResolver({ bpLang: 'Multi-Language' }).hasLabels).toBe(false);
    expect(makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { K: 'v' } }).hasLabels).toBe(true);
  });
});

/* ---------------------------------------------------------------- stripHtml */

describe('stripHtml', () => {
  it('turns <br> into a space and strips tags and entities', () => {
    expect(stripHtml('Hello<br/>World &amp; <b>friends</b>')).toBe('Hello World & friends');
  });
});

describe('resolveText', () => {
  it('resolves through the label map only in a multi-language script', () => {
    const multiLang = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { K: 'Resolved' } });
    expect(resolveText('K', multiLang)).toBe('Resolved');

    const singleLang = makeResolver({ bpLang: 'English' });
    expect(resolveText('Literal text', singleLang)).toBe('Literal text');
  });

  it('falls back to the raw key when it is not in the label map', () => {
    const resolver = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: {} });
    expect(resolveText('UnresolvedKey', resolver)).toBe('UnresolvedKey');
  });
});

/* ------------------------------------------------------------ elementLabel */

describe('elementLabel', () => {
  it('reads a Text Block from its text property when not multi-language', () => {
    const node = { type: 'Text Block' };
    const propertySet = { text: 'Some <b>text</b>' };
    const resolver = makeResolver({ bpLang: 'English' });
    expect(elementLabel(node, propertySet, resolver)).toBe('Some text');
  });

  it('reads a Text Block through its textKey when multi-language', () => {
    const node = { type: 'Text Block' };
    const propertySet = { textKey: 'BlockKey' };
    const resolver = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { BlockKey: 'Resolved text' } });
    expect(elementLabel(node, propertySet, resolver)).toBe('Resolved text');
  });

  it('resolves an ordinary element label through the label map when multi-language', () => {
    const node = { type: 'Text' };
    const propertySet = { label: 'NameKey' };
    const resolver = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { NameKey: 'First name' } });
    expect(elementLabel(node, propertySet, resolver)).toBe('First name');
  });
});

describe('missingLabels', () => {
  it('is empty for a single-language script, since keys are never expected there', () => {
    const node = { type: 'Text' };
    const propertySet = { label: 'AnyKey' };
    const resolver = makeResolver({ bpLang: 'English' });
    expect(missingLabels(node, propertySet, resolver)).toEqual([]);
  });

  it('flags a label key absent from allCustomLabels in a multi-language script', () => {
    const node = { type: 'Text' };
    const propertySet = { label: 'MissingKey' };
    const resolver = makeResolver({ bpLang: 'Multi-Language', allCustomLabels: { OtherKey: 'x' } });
    const missing = missingLabels(node, propertySet, resolver);
    expect(missing).toEqual([{ where: 'label', key: 'MissingKey' }]);
  });

  it('does not flag anything when allCustomLabels itself was never read (hasLabels false)', () => {
    const node = { type: 'Text' };
    const propertySet = { label: 'AnyKey' };
    const resolver = makeResolver({ bpLang: 'Multi-Language' });
    expect(missingLabels(node, propertySet, resolver)).toEqual([]);
  });
});

describe('optionLabelMap', () => {
  it('maps a manual option’s stored value to its display label', () => {
    const propertySet = { options: [{ name: 'US', value: 'United States' }, { name: 'CA', value: 'Canada' }] };
    const resolver = makeResolver({ bpLang: 'English' });
    expect(optionLabelMap(propertySet, resolver)).toEqual({ US: 'United States', CA: 'Canada' });
  });

  it('returns null for a dependent option source, since it carries no static labels', () => {
    const propertySet = { options: [{ name: 'US', value: 'US' }], optionSource: { type: 'DataRaptor' } };
    const resolver = makeResolver({ bpLang: 'English' });
    expect(optionLabelMap(propertySet, resolver)).toBeNull();
  });
});

/* -------------------------------------------------------------------- flatten */

describe('flatten', () => {
  const definition = {
    name: 'Step1', type: 'Step',
    eleArray: [
      { name: 'Email', type: 'Text', propSetMap: { label: 'Email address' } },
      {
        name: 'Block1', type: 'Block',
        eleArray: [
          { name: 'Nested', type: 'Text', propSetMap: {} }
        ]
      }
    ]
  };

  it('walks every nested element and records its depth and parent', () => {
    const elements = flatten(definition, null);
    const names = elements.map((e) => e.name);
    expect(names).toEqual(['Step1', 'Email', 'Block1', 'Nested']);
    expect(elements.find((e) => e.name === 'Nested').depth).toBe(2);
  });

  it('marks a parent hasChildren true only when a child was actually recorded', () => {
    const elements = flatten(definition, null);
    expect(elements.find((e) => e.name === 'Block1').hasChildren).toBe(true);
    expect(elements.find((e) => e.name === 'Email').hasChildren).toBe(false);
  });

  it('resolves a JSONPath from the header labelMap when the node has none of its own', () => {
    const header = { labelMap: { Email: 'Step1:Email' } };
    const elements = flatten(definition, header);
    expect(elements.find((e) => e.name === 'Email').jsonPath).toBe('Step1:Email');
  });
});

describe('categoryOf', () => {
  it('classifies a Step before anything else matches', () => {
    expect(categoryOf('Step').key).toBe('step');
  });

  it('classifies a Text Block as display, not input, despite containing "text"', () => {
    expect(categoryOf('Text Block').key).toBe('display');
  });

  it('classifies an unrecognised type as "other"', () => {
    expect(categoryOf('Something Unknown').key).toBe('other');
  });
});

/* --------------------------------------------------------- show / validation */

describe('describeShow / formatGroup', () => {
  it('renders a single rule as field condition value', () => {
    const show = { group: { operator: 'AND', rules: [{ field: 'Email', condition: '!=', data: '' }] } };
    expect(describeShow(show)).toBe('Email != ""');
  });

  it('joins multiple rules with the group operator and parenthesizes nested groups', () => {
    const show = {
      group: {
        operator: 'AND',
        rules: [
          { field: 'Type', condition: '=', data: 'Business' },
          { group: { operator: 'OR', rules: [{ field: 'Amount', condition: '>', data: 1000 }] } }
        ]
      }
    };
    expect(describeShow(show)).toBe('Type = "Business" AND (Amount > 1000)');
  });

  it('returns empty for a missing or malformed show definition', () => {
    expect(describeShow(null)).toBe('');
    expect(describeShow('not an object')).toBe('');
  });
});

describe('formatRule', () => {
  it('quotes a string value and leaves a number bare', () => {
    expect(formatRule({ field: 'Name', condition: '=', data: 'Ada' })).toBe('Name = "Ada"');
    expect(formatRule({ field: 'Amount', condition: '>', data: 100 })).toBe('Amount > 100');
  });

  it('renders an empty/undefined value as an empty string literal', () => {
    expect(formatRule({ field: 'Email', condition: '!=', data: '' })).toBe('Email != ""');
  });
});

describe('describeValidation', () => {
  it('reads a Set Errors element’s elementErrorMap', () => {
    const node = { type: 'Set Errors', bSetErrors: true };
    const propertySet = { elementErrorMap: { Email: 'Email is required' } };
    const resolver = makeResolver({ bpLang: 'English' });
    const validation = describeValidation(node, propertySet, '', resolver);
    expect(validation.kind).toBe('set-errors');
    expect(validation.errorMap).toEqual([{ element: 'Email', message: 'Email is required' }]);
  });

  it('reads a Messaging element’s conditional messages', () => {
    const node = { type: 'Messaging', bMessaging: true };
    const propertySet = {
      validateExpression: 'Amount > 0',
      messages: [{ message: 'Looks good', value: true }]
    };
    const resolver = makeResolver({ bpLang: 'English' });
    const validation = describeValidation(node, propertySet, '', resolver);
    expect(validation.kind).toBe('messaging');
    expect(validation.validateExpr).toBe('Amount > 0');
    expect(validation.messages).toEqual([{ type: 'message', text: 'Looks good', when: 'true', condition: '' }]);
  });

  it('reports has: false for an element that is neither Set Errors nor Messaging', () => {
    const node = { type: 'Text' };
    const resolver = makeResolver({ bpLang: 'English' });
    expect(describeValidation(node, {}, '', resolver).has).toBe(false);
  });
});

/* ------------------------------------------------------------------ values */

describe('valueFor', () => {
  it('finds a value nested under an arbitrary step name', () => {
    const data = { Step1: { Email: 'a@b.com' } };
    expect(valueFor(data, 'Email')).toBe('a@b.com');
  });

  it('returns undefined when the name is nowhere in the tree', () => {
    expect(valueFor({ Step1: {} }, 'Missing')).toBeUndefined();
  });
});

describe('resolvePath', () => {
  it('walks a colon-separated path through nested steps', () => {
    const data = { Step1: { Email: 'a@b.com' } };
    expect(resolvePath(data, 'Step1:Email')).toBe('a@b.com');
  });

  it('resolves a repeat-block "|N" suffix to that array index', () => {
    const data = { Step1: { Block: [{ Field: 'first' }, { Field: 'second' }] } };
    expect(resolvePath(data, 'Step1:Block|1:Field')).toBe('second');
  });

  it('falls back toward index 0 when the requested repeat index no longer exists', () => {
    const data = { Step1: { Block: [{ Field: 'only' }] } };
    expect(resolvePath(data, 'Step1:Block|5:Field')).toBe('only');
  });

  it('returns undefined for a path segment that is not present', () => {
    expect(resolvePath({ Step1: {} }, 'Step1:Missing')).toBeUndefined();
  });
});

describe('resolveElementValue', () => {
  it('prefers the exact jsonPath over a name search', () => {
    const element = { jsonPath: 'Step1:Email', name: 'Email' };
    const data = { Step1: { Email: 'exact' }, Other: { Email: 'wrong' } };
    expect(resolveElementValue(element, data)).toBe('exact');
  });

  it('falls back to a name search when there is no jsonPath', () => {
    const element = { jsonPath: '', name: 'Email' };
    const data = { Step1: { Email: 'found by name' } };
    expect(resolveElementValue(element, data)).toBe('found by name');
  });
});

describe('displayValue', () => {
  it('joins a stored option value with its label', () => {
    const element = { optionLabels: { US: 'United States' } };
    expect(displayValue(element, 'US')).toBe('US (United States)');
  });

  it('joins every value in a multi-select array', () => {
    const element = { optionLabels: { US: 'United States', CA: 'Canada' } };
    expect(displayValue(element, ['US', 'CA'])).toBe('US (United States), CA (Canada)');
  });

  it('falls back to preview() when the element has no option labels', () => {
    expect(displayValue({}, { a: 1 })).toBe('{1}');
    expect(displayValue({}, undefined)).toBe('');
  });
});

describe('preview', () => {
  it('summarises containers by size and clips long strings', () => {
    expect(preview([1, 2, 3])).toBe('[3]');
    expect(preview({ a: 1, b: 2 })).toBe('{2}');
    expect(preview('x'.repeat(50)).endsWith('…')).toBe(true);
  });
});

describe('parseObj', () => {
  it('parses a JSON string and passes an object straight through', () => {
    expect(parseObj('{"a":1}')).toEqual({ a: 1 });
    expect(parseObj({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns null for empty or unparsable input rather than throwing', () => {
    expect(parseObj('')).toBeNull();
    expect(parseObj('{broken')).toBeNull();
  });
});

describe('executionStatus', () => {
  const definition = { children: [
    { name: 'Step1', type: 'Step', eleArray: [{ name: 'Name', type: 'Text' }, { name: 'Lookup', type: 'DataRaptor Turbo Action' }] },
    { name: 'Step2', type: 'Step', eleArray: [] },
    { name: 'Step3', type: 'Step', eleArray: [] }
  ] };
  const elements = flatten(definition, {});
  const statusOf = (data, activeIndex) => {
    const status = executionStatus(elements, data, activeIndex);
    return Object.fromEntries(elements.map((e) => [e.name, status[e.key]]));
  };

  it('marks reached steps done, the furthest one current, and the rest pending', () => {
    expect(statusOf({ Step1: { Name: 'x' }, Step2: {} })).toMatchObject({
      Step1: 'done', Step2: 'current', Step3: 'pending'
    });
  });

  it('marks an action done once its name appears in the data', () => {
    expect(statusOf({ Step1: { Lookup: { ok: true } } })).toMatchObject({ Lookup: 'done', Step1: 'current' });
    expect(statusOf({ Step1: {} }).Lookup).toBe('pending');
  });

  it('does not track plain inputs and returns nothing without data', () => {
    expect(statusOf({ Step1: { Name: 'x' } }).Name).toBeUndefined();
    expect(executionStatus(elements, undefined)).toEqual({});
  });

  it('uses asIndex against indexInParent for steps and top-level actions', () => {
    const indexed = flatten({ children: [
      { name: 'A', type: 'Step', indexInParent: 0, eleArray: [] },
      { name: 'DoWork', type: 'Integration Procedure Action', indexInParent: 1 },
      { name: 'Hidden', type: 'Step', indexInParent: 2, bShow: false, eleArray: [] },
      { name: 'B', type: 'Step', indexInParent: 3, eleArray: [] },
      { name: 'C', type: 'Step', indexInParent: 4, eleArray: [] }
    ] }, {});
    const status = executionStatus(indexed, {}, 3);
    expect(Object.fromEntries(indexed.map((e) => [e.name, status[e.key]]))).toEqual({
      A: 'done', DoWork: 'done', Hidden: 'skipped', B: 'current', C: 'pending'
    });
  });

  it('indexes by position among top-level elements, not step count', () => {
    const indexed = flatten({ children: [
      { name: 'Prep', type: 'Set Values', indexInParent: 0 },
      { name: 'S1', type: 'Step', indexInParent: 1, eleArray: [] },
      { name: 'S2', type: 'Step', indexInParent: 7, eleArray: [] }
    ] }, {});
    const status = executionStatus(indexed, {}, 7);
    expect(status[indexed[0].key]).toBeUndefined();
    expect(status[indexed[1].key]).toBe('done');
    expect(status[indexed[2].key]).toBe('current');
  });
});

describe('searchText', () => {
  it('lets a word from the screen find an element in a multi-language script', async () => {
    const { flatten } = await import('../../src/core/structure-model.js');
    const definition = { children: [
      { name: 'Greeting', type: 'Text Block', propSetMap: { textKey: 'k_greet' } },
      { name: 'Email', type: 'Email', propSetMap: { label: 'k_email', helpText: 'k_help' } }
    ] };
    const header = { bpLang: 'Multi-Language', allCustomLabels: {
      k_greet: '<b>Welcome aboard</b>', k_email: 'Your address', k_help: 'We never share it'
    } };
    const [greeting, email] = flatten(definition, header);
    expect(greeting.searchText).toContain('welcome aboard');
    expect(email.searchText).toContain('k_email');
    expect(email.searchText).toContain('your address');
    expect(email.searchText).toContain('we never share it');
  });

  it('carries the lwcId', async () => {
    const { flatten } = await import('../../src/core/structure-model.js');
    expect(flatten({ children: [{ name: 'A', type: 'Text', lwcId: 'lwc-9', propSetMap: {} }] }, null)[0].lwcId).toBe('lwc-9');
  });
});
