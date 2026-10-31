'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { computeVisibility } from '../../../src/core/structure/visibility.js';
import {
  stepStoppers, requiredEmpty, firingErrors, customComponents, isEmptyValue, blocksNext, activeMessages,
  validationRules, STOPPERS_LEDE, CUSTOM_NOTE
} from '../../../src/core/structure/step-validation.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements, propSetMap]) => ({
      name, type: 'Step', propSetMap: propSetMap || {}, children: [{ eleArray: elements }]
    }))
  }, null);
}

function blockers(steps, data, stepName = 'Intro') {
  const elements = build(steps);
  const step = elements.find((element) => element.name === stepName);
  return stepStoppers(elements, step.key, data, computeVisibility(elements, data)).items;
}

const names = (found) => found.map((item) => item.name);

describe('isEmptyValue', () => {
  it.each([[undefined], [null], [''], [[]], [{}]])('%j is empty', (value) => {
    expect(isEmptyValue(value)).toBe(true);
  });
  it.each([['x'], [0], [false], [[0]], [{ a: 1 }], [' ']])('%j is not empty', (value) => {
    expect(isEmptyValue(value)).toBe(false);
  });
});

describe('required and empty', () => {
  const steps = () => [['Intro', [
    el('Email', 'Email', { required: true }),
    el('Phone', 'Text', { required: true }),
    el('Nickname', 'Text')
  ]]];

  it('lists a required element with no value', () => {
    const found = blockers(steps(), { Intro: { Phone: '123' } });
    expect(found).toEqual([{
      elementKey: expect.any(String), name: 'Email', kind: 'required', reason: 'Required and empty'
    }]);
  });

  it.each([[''], [null], [[]], [{}]])('treats %j as empty', (value) => {
    expect(names(blockers(steps(), { Intro: { Email: value, Phone: 'x' } }))).toEqual(['Email']);
  });

  it('does not list an element that holds a value, including 0', () => {
    const found = blockers([['Intro', [
      el('Count', 'Number', { required: true }),
      el('Agree', 'Checkbox', { required: true })
    ]]], { Intro: { Count: 0, Agree: true } });
    expect(found).toEqual([]);
  });

  it('lists a required checkbox that is not ticked', () => {
    const steps = () => [['Intro', [el('Agree', 'Checkbox', { required: true })]]];
    expect(blockers(steps(), { Intro: { Agree: false } })).toEqual([{
      elementKey: expect.any(String), name: 'Agree', kind: 'required', reason: 'Required and not ticked'
    }]);
    expect(names(blockers(steps(), { Intro: {} }))).toEqual(['Agree']);
    expect(blockers(steps(), { Intro: { Agree: true } })).toEqual([]);
  });

  it('does not list required children of an Edit Block: they are enforced when the row is saved', () => {
    const steps = () => [['Intro', [
      el('Rows', 'Edit Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { required: true })] }] }),
      el('Loose', 'Text', { required: true })
    ]]];
    expect(names(blockers(steps(), { Intro: {} }))).toEqual(['Loose']);
  });

  it('still lists required children of a Repeat Block', () => {
    const found = blockers([['Intro', [
      el('Rows', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { required: true })] }] })
    ]]], { Intro: {} });
    expect(names(found)).toEqual(['Inner']);
  });

  describe('a repeating block', () => {
    const repeated = () => {
      const elements = build([['Intro', [
        el('Rows', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { required: true })] }] })
      ]]]);
      elements.find((e) => e.name === 'Inner').jsonPath = 'Intro:Rows|1:Inner';
      return { elements, step: elements.find((e) => e.name === 'Intro') };
    };

    it('judges every row, not one', () => {
      const { elements, step } = repeated();
      const data = { Intro: { Rows: [{ Inner: 'a' }, { Inner: '' }, { Inner: 'c' }, { Inner: null }] } };
      const found = requiredEmpty(elements, step.key, data, computeVisibility(elements, data));
      expect(found.map((item) => item.reason)).toEqual(['Required and empty (row 2)', 'Required and empty (row 4)']);
    });

    it('lists nothing when every row is filled', () => {
      const { elements, step } = repeated();
      const data = { Intro: { Rows: [{ Inner: 'a' }, { Inner: 'b' }] } };
      expect(requiredEmpty(elements, step.key, data, computeVisibility(elements, data))).toEqual([]);
    });

    it('does not name a row when the block holds one', () => {
      const { elements, step } = repeated();
      const data = { Intro: { Rows: [{ Inner: '' }] } };
      const found = requiredEmpty(elements, step.key, data, computeVisibility(elements, data));
      expect(found.map((item) => item.reason)).toEqual(['Required and empty']);
    });

    it('counts each empty row in the badge', () => {
      const { elements, step } = repeated();
      const data = { Intro: { Rows: [{ Inner: '' }, { Inner: '' }] } };
      expect(stepStoppers(elements, step.key, data, computeVisibility(elements, data)).count).toBe(2);
    });
  });

  describe('rows that lack the field, and blocks inside blocks', () => {
    const field = (name, path, ps = {}) => el(name, 'Text', ps, { JSONPath: path });
    const block = (name, path, inner, ps = {}) => el(name, 'Block', { repeat: true, ...ps }, { JSONPath: path, children: [{ eleArray: inner }] });
    const judged = (elements, data) => {
      const step = elements.find((e) => e.name === 'Intro');
      return requiredEmpty(elements, step.key, data, computeVisibility(elements, data)).map((item) => item.reason);
    };

    it('lists a row that has no such key, and a row that is null, without borrowing another row\'s value', () => {
      const elements = build([['Intro', [
        block('Rows', 'Intro:Rows', [field('Inner', 'Intro:Rows:Inner', { required: true })])
      ]]]);
      expect(judged(elements, { Intro: { Rows: [{ Inner: 'filled' }, {}] } })).toEqual(['Required and empty (row 2)']);
      expect(judged(elements, { Intro: { Rows: [{ Inner: 'filled' }, null] } })).toEqual(['Required and empty (row 2)']);
      expect(judged(elements, { Intro: { Rows: [{ Inner: 'a' }, { Inner: 'b' }] } })).toEqual([]);
    });

    it('judges every row of a block inside a block, naming outer row then inner row', () => {
      const elements = build([['Intro', [
        block('Outer', 'Intro:Outer', [
          block('Inner', 'Intro:Outer:Inner', [field('Leaf', 'Intro:Outer:Inner:Leaf', { required: true })])
        ])
      ]]]);
      const data = { Intro: { Outer: [
        { Inner: [{ Leaf: 'a' }, { Leaf: '' }] },
        { Inner: [{ Leaf: 'b' }, { Leaf: 'c' }, {}] }
      ] } };
      expect(judged(elements, data)).toEqual(['Required and empty (row 1.2)', 'Required and empty (row 2.3)']);
    });

    it('judges a block inside a block when the outer one holds a single row', () => {
      const elements = build([['Intro', [
        block('Outer', 'Intro:Outer', [
          block('Inner', 'Intro:Outer:Inner', [field('Leaf', 'Intro:Outer:Inner:Leaf', { required: true })])
        ])
      ]]]);
      expect(judged(elements, { Intro: { Outer: [{ Inner: [{ Leaf: 'a' }, { Leaf: '' }] }] } })).toEqual(['Required and empty (row 2)']);
    });
  });

  describe('a show rule inside a repeating block', () => {
    const rowsBlock = () => build([['Intro', [
      el('Rows', 'Block', { repeat: true }, { JSONPath: 'Intro:Rows', children: [{ eleArray: [
        el('Age', 'Number', {}, { JSONPath: 'Intro:Rows|1:Age' }),
        el('Parent', 'Text', {
          required: true, show: { group: rule('Age', '<', 18) }
        }, { JSONPath: 'Intro:Rows|1:Parent' })
      ] }] })
    ]]]);
    const judged = (elements, data) => {
      const step = elements.find((e) => e.name === 'Intro');
      return stepStoppers(elements, step.key, data, computeVisibility(elements, data));
    };

    it('is read with each row\'s own values, not row 1\'s', () => {
      const elements = rowsBlock();
      const result = judged(elements, { Intro: { Rows: [
        { Age: 40, Parent: '' }, { Age: 9, Parent: '' }, { Age: 12, Parent: 'Sam' }
      ] } });
      expect(result.items.map((item) => item.reason)).toEqual(['Required and empty (row 2)']);
    });

    it('lets a row whose rule holds be judged even when row 1 hides the element', () => {
      const elements = rowsBlock();
      const result = judged(elements, { Intro: { Rows: [{ Age: 30 }, { Age: 5 }] } });
      expect(result.count).toBe(1);
    });

    it('keeps a finding apart as estimated when the row\'s rule cannot be judged', () => {
      const elements = build([['Intro', [
        el('Rows', 'Block', { repeat: true }, { JSONPath: 'Intro:Rows', children: [{ eleArray: [
          el('Parent', 'Text', {
            required: true, show: { group: { operator: 'AND', rules: [{ field: 'Age', condition: 'matches', data: '1' }] } }
          }, { JSONPath: 'Intro:Rows|1:Parent' })
        ] }] })
      ]]]);
      const result = judged(elements, { Intro: { Rows: [{ Age: 3 }, { Age: 4 }] } });
      expect(result.count).toBe(0);
      expect(result.estimated.map((item) => item.name)).toEqual(['Parent', 'Parent']);
    });
  });

  it.each(['Text Block', 'Formula', 'Aggregate', 'Set Values', 'Remote Action', 'Line Break'])(
    'does not judge a required flag on a %s: it takes no input', (type) => {
      expect(blockers([['Intro', [el('Shown', type, { required: true })]]], { Intro: {} })).toEqual([]);
    });

  it('judges a required Disclosure like a Checkbox: it has to be ticked', () => {
    const steps = () => [['Intro', [el('Agree', 'Disclosure', { required: true })]]];
    expect(blockers(steps(), { Intro: { Agree: false } }).map((item) => item.reason)).toEqual(['Required and not ticked']);
    expect(blockers(steps(), { Intro: {} }).map((item) => item.reason)).toEqual(['Required and not ticked']);
    expect(blockers(steps(), { Intro: { Agree: true } })).toEqual([]);
  });

  it('judges a required Geolocation and Name as inputs, an object with nothing in it as empty', () => {
    const steps = () => [['Intro', [
      el('Where', 'Geolocation', { required: true }),
      el('Who', 'Name', { required: true })
    ]]];
    expect(names(blockers(steps(), { Intro: {} }))).toEqual(['Where', 'Who']);
    expect(names(blockers(steps(), { Intro: { Where: {}, Who: { FirstName: '', LastName: null } } }))).toEqual(['Where', 'Who']);
    expect(blockers(steps(), { Intro: { Where: { lat: 1, lng: 2 }, Who: { FirstName: 'Ada', LastName: '' } } })).toEqual([]);
  });

  it('still judges a required Custom LWC, Select and Radio', () => {
    const found = blockers([['Intro', [
      el('Widget', 'Custom Lightning Web Component', { required: true }),
      el('Pick', 'Select', { required: true }),
      el('Choice', 'Radio', { required: true })
    ]]], { Intro: {} });
    expect(names(found)).toEqual(['Widget', 'Pick', 'Choice']);
  });

  it('does not list an element that is not required', () => {
    expect(names(blockers(steps(), { Intro: { Email: 'a', Phone: 'b' } }))).toEqual([]);
  });

  it('lists everything required, in script order', () => {
    expect(names(blockers(steps(), { Intro: {} }))).toEqual(['Email', 'Phone']);
  });

  it('finds elements nested in blocks under the step', () => {
    const found = blockers([['Intro', [
      el('Group', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { required: true })] }] })
    ]]], { Intro: {} });
    expect(names(found)).toEqual(['Inner']);
  });

  it('ignores a container even if it is flagged required', () => {
    const found = blockers([['Intro', [
      el('Group', 'Block', { required: true }, { children: [{ eleArray: [el('Inner', 'Text')] }] })
    ]]], { Intro: {} });
    expect(found).toEqual([]);
  });

  it('only looks inside the step asked about', () => {
    const steps = [
      ['Intro', [el('A', 'Text', { required: true })]],
      ['Other', [el('B', 'Text', { required: true })]]
    ];
    expect(names(blockers(steps, {}, 'Other'))).toEqual(['B']);
    expect(names(blockers(steps, {}, 'Intro'))).toEqual(['A']);
  });

  it('skips an element hidden by its own show rule', () => {
    const found = blockers([['Intro', [
      el('Kind', 'Text'),
      el('Company', 'Text', { required: true, show: rule('Kind', '=', 'Business') })
    ]]], { Intro: { Kind: 'Person' } });
    expect(found).toEqual([]);
  });

  it('lists it once its show rule holds', () => {
    const found = blockers([['Intro', [
      el('Kind', 'Text'),
      el('Company', 'Text', { required: true, show: rule('Kind', '=', 'Business') })
    ]]], { Intro: { Kind: 'Business' } });
    expect(names(found)).toEqual(['Company']);
  });

  it('skips the children of a hidden block', () => {
    const found = blockers([['Intro', [
      el('Kind', 'Text'),
      el('Group', 'Block', { show: rule('Kind', '=', 'Business') }, {
        children: [{ eleArray: [el('Inner', 'Text', { required: true })] }]
      })
    ]]], { Intro: { Kind: 'Person' } });
    expect(found).toEqual([]);
  });

  it('reads the value through the element name when the step is not in the path', () => {
    expect(names(blockers(steps(), { Elsewhere: { Email: 'a', Phone: 'b' } }))).toEqual([]);
  });
});

describe('Set Errors', () => {
  const setErrors = (propSetMap) => el('CheckAge', 'Set Errors', {
    elementErrorMap: { Age: 'Must be an adult' }, ...propSetMap
  });

  it('is listed while its show rule holds', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'), setErrors({ show: rule('Intro:Age', '<', 18) })
    ]]], { Intro: { Age: 12 } });
    expect(found).toEqual([{
      elementKey: expect.any(String),
      name: 'CheckAge',
      kind: 'set-errors',
      reason: 'Set Errors will fire on Age: “Must be an adult”',
      outside: false
    }]);
  });

  it('is not listed once its show rule no longer holds', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'), setErrors({ show: rule('Intro:Age', '<', 18) })
    ]]], { Intro: { Age: 30 } });
    expect(found).toEqual([]);
  });

  it('is not listed when the rule cannot be judged', () => {
    const found = blockers([['Intro', [
      setErrors({ show: rule('Intro:Age', 'IN LIST', '1,2') })
    ]]], { Intro: { Age: 1 } });
    expect(found).toEqual([]);
  });

  it('is not listed when it has no show rule (nothing to judge)', () => {
    expect(blockers([['Intro', [setErrors({})]]], { Intro: {} })).toEqual([]);
  });

  it('says nothing about where without a target or message', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'),
      el('Plain', 'Set Errors', { show: rule('Intro:Age', '<', 18) })
    ]]], { Intro: { Age: 1 } });
    expect(found[0].reason).toBe('Set Errors will fire');
  });

  it('is not listed from another step unless it targets an element of this one', () => {
    const steps = [
      ['Intro', [el('Age', 'Number')]],
      ['Other', [el('Name', 'Text'), setErrors({ show: rule('Intro:Age', '<', 18), elementErrorMap: { Name: 'x' } })]]
    ];
    expect(blockers(steps, { Intro: { Age: 1 } }, 'Intro')).toEqual([]);
    expect(names(blockers(steps, { Intro: { Age: 1 } }, 'Other'))).toEqual(['CheckAge']);
  });

  it('is not listed when a parent hides it', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'),
      el('Group', 'Block', { show: rule('Intro:Age', '>', 100) }, {
        children: [{ eleArray: [setErrors({ show: rule('Intro:Age', '<', 18) })] }]
      })
    ]]], { Intro: { Age: 1 } });
    expect(found).toEqual([]);
  });
});

describe('Messaging and Validation', () => {
  /* Shown with Requirement when the expression is false, Info when it is true. */
  const expression = rule('Intro:Age', '>', 17);
  const messaging = (messages, extra = {}) => el('Notice', 'Messaging', {
    validateExpression: expression, messages, ...extra
  });
  const msgs = [
    { type: 'Requirement', text: 'Adults only', value: false, active: true },
    { type: 'Info', text: 'Welcome', value: true, active: true }
  ];

  it('is listed while the expression selects a Requirement message', () => {
    const found = blockers([['Intro', [el('Age', 'Number'), messaging(msgs)]]], { Intro: { Age: 5 } });
    expect(found).toEqual([{
      elementKey: expect.any(String),
      name: 'Notice',
      kind: 'messaging',
      reason: 'Requirement message is active: “Adults only”',
      outside: false
    }]);
  });

  it('is judged by the expression, not by its own show rule', () => {
    const noShow = blockers([['Intro', [el('Age', 'Number'), messaging(msgs)]]], { Intro: { Age: 5 } });
    expect(names(noShow)).toEqual(['Notice']);
    const ok = blockers([['Intro', [el('Age', 'Number'), messaging(msgs)]]], { Intro: { Age: 40 } });
    expect(ok).toEqual([]);
  });

  it('does not block for an Info or Warning message', () => {
    const informing = [
      { type: 'Warning', text: 'Careful', value: false }, { type: 'Info', text: 'FYI', value: true }
    ];
    expect(blockers([['Intro', [el('Age', 'Number'), messaging(informing)]]], { Intro: { Age: 5 } })).toEqual([]);
  });

  it('blocks for an Error message tied to the true result', () => {
    const found = blockers([['Intro', [el('Age', 'Number'), messaging([
      { type: 'Error', text: 'Too old', value: true }
    ])]]], { Intro: { Age: 50 } });
    expect(names(found)).toEqual(['Notice']);
  });

  it('is left out when the expression is a formula it cannot judge', () => {
    const found = blockers([['Intro', [el('Age', 'Number'), messaging(msgs, { validateExpression: 'Age > 17' })]]],
      { Intro: { Age: 5 } });
    expect(found).toEqual([]);
  });

  it('is not listed when its own show rule hides it', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'), messaging(msgs, { show: rule('Intro:Age', '>', 100) })
    ]]], { Intro: { Age: 5 } });
    expect(found).toEqual([]);
  });

  it('recognises a Validation element by its type', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number'),
      el('Check', 'Validation', { validateExpression: expression, messages: msgs })
    ]]], { Intro: { Age: 5 } });
    expect(names(found)).toEqual(['Check']);
  });
});

describe('validationRules', () => {
  /* Every validation rule of the step, firing or not, each with its verdict now. */
  const msgs = [
    { type: 'Requirement', text: 'Adults only', value: false, active: true },
    { type: 'Comment', text: 'Thanks', value: true, active: true }
  ];
  const steps = () => [
    ['Intro', [
      el('Age', 'Number'),
      el('Adult', 'Messaging', { validateExpression: rule('Intro:Age', '>', 17), messages: msgs }),
      el('Senior', 'Messaging', { validateExpression: rule('Intro:Age', '>', 64), messages: [{ type: 'Info', text: 'Hi', value: true }] }),
      el('Odd', 'Messaging', { validateExpression: 'Age > 17', messages: msgs }),
      el('Gone', 'Messaging', { validateExpression: rule('Intro:Age', '>', 17), messages: msgs, show: rule('Intro:Age', '>', 100) }),
      el('Young', 'Set Errors', { elementErrorMap: { Age: 'Too young' }, show: rule('Intro:Age', '<', 10) }),
      el('Bare', 'Set Errors', { elementErrorMap: { Age: 'x' } }),
      el('Name', 'Text')
    ]],
    ['Other', [el('Elsewhere', 'Set Errors', { show: rule('Intro:Age', '<', 18), elementErrorMap: { Age: 'Not here' } })]]
  ];
  const rulesFor = (data, stepName = 'Intro') => {
    const elements = build(steps());
    const step = elements.find((element) => element.name === stepName);
    return validationRules(elements, step.key, data, computeVisibility(elements, data));
  };
  const verdicts = (found) => found.map((item) => [item.name, item.verdict]);

  it('lists every Messaging and Set Errors rule of the step with its verdict, firing or not', () => {
    expect(verdicts(rulesFor({ Intro: { Age: 5 } }))).toEqual([
      ['Adult', 'fails'], ['Senior', 'passes'], ['Odd', 'unknown'], ['Gone', 'hidden'], ['Young', 'fails'], ['Bare', 'unknown'],
      ['Elsewhere', 'fails']
    ]);
    expect(verdicts(rulesFor({ Intro: { Age: 40 } }))).toEqual([
      ['Adult', 'passes'], ['Senior', 'passes'], ['Odd', 'unknown'], ['Gone', 'hidden'], ['Young', 'passes'], ['Bare', 'unknown'],
      ['Elsewhere', 'passes']
    ]);
  });

  it('marks a Set Errors elsewhere that targets the step as outside, and gives the other step only its own', () => {
    const found = rulesFor({ Intro: { Age: 5 } });
    expect(found.find((item) => item.name === 'Elsewhere')).toMatchObject({ kind: 'set-errors', outside: true });
    expect(found.find((item) => item.name === 'Adult')).toMatchObject({ kind: 'messaging', outside: false, estimated: false });
    expect(verdicts(rulesFor({ Intro: { Age: 5 } }, 'Other'))).toEqual([['Elsewhere', 'fails']]);
  });

  it('agrees with firingErrors: what fails is what may stop Next', () => {
    const elements = build(steps());
    const step = elements.find((element) => element.name === 'Intro');
    const data = { Intro: { Age: 5 } };
    const visibility = computeVisibility(elements, data);
    const failing = validationRules(elements, step.key, data, visibility).filter((item) => item.verdict === 'fails');
    expect(failing.map((item) => item.elementKey)).toEqual(firingErrors(elements, step.key, data, visibility).map((item) => item.elementKey));
  });

  it('gives nothing without data', () => {
    expect(rulesFor(undefined)).toEqual([]);
  });
});

describe('overall', () => {
  it('gives nothing without data', () => {
    const steps = [['Intro', [el('A', 'Text', { required: true })]]];
    expect(blockers(steps, undefined)).toEqual([]);
    expect(blockers(steps, null)).toEqual([]);
  });

  it('puts both kinds together in script order', () => {
    const found = blockers([['Intro', [
      el('Age', 'Number', { required: true }),
      el('CheckAge', 'Set Errors', { show: rule('Intro:Age', '<', 18), elementErrorMap: { Age: 'Too young' } })
    ]]], { Intro: { Age: '' } });
    expect(names(found)).toEqual(['Age']); // an empty age is not "less than 18": that rule is not judged

    const both = blockers([['Intro', [
      el('Age', 'Number', { required: true }),
      el('CheckAge', 'Set Errors', { show: rule('Intro:Age', '=', ''), elementErrorMap: { Age: 'Missing' } })
    ]]], { Intro: { Age: '' } });
    expect(names(both)).toEqual(['Age', 'CheckAge']);

    const young = blockers([['Intro', [
      el('Age', 'Number', { required: true }),
      el('CheckAge', 'Set Errors', { show: rule('Intro:Age', '<', 18), elementErrorMap: { Age: 'Too young' } })
    ]]], { Intro: { Age: 3 } });
    expect(names(young)).toEqual(['CheckAge']);
  });

  it('copes with a missing visibility map', () => {
    const elements = build([['Intro', [el('A', 'Text', { required: true })]]]);
    expect(names(stepStoppers(elements, elements[0].key, {}, undefined).items)).toEqual(['A']);
  });

  it('carries a lede and a note that say it is best effort', () => {
    expect(STOPPERS_LEDE).toBe('Judged against the data right now; best effort.');
    expect(CUSTOM_NOTE).toMatch(/own required controls or Next\/Previous buttons/);
  });
});

function stoppers(steps, data, stepName = 'Intro') {
  const elements = build(steps);
  const step = elements.find((element) => element.name === stepName);
  return stepStoppers(elements, step.key, data, computeVisibility(elements, data));
}

describe('firingErrors', () => {
  const setErrors = (name, target, show, extra = {}) =>
    el(name, 'Set Errors', { elementErrorMap: { [target]: 'Not allowed' }, show, ...extra });

  it('lists a Set Errors inside the step whose condition holds, and not one that does not', () => {
    const steps = () => [['Intro', [
      el('Age', 'Number'),
      setErrors('TooYoung', 'Age', rule('Intro:Age', '<', 18)),
      setErrors('TooOld', 'Age', rule('Intro:Age', '>', 99))
    ]]];
    const elements = build(steps());
    const data = { Intro: { Age: 12 } };
    const found = firingErrors(elements, elements[0].key, data, computeVisibility(elements, data));
    expect(found).toEqual([{
      elementKey: expect.any(String), name: 'TooYoung', kind: 'set-errors',
      reason: 'Set Errors will fire on Age: “Not allowed”', outside: false
    }]);
  });

  it('finds a Set Errors in another step that targets an element of this one', () => {
    const steps = [
      ['Intro', [el('Age', 'Number')]],
      ['Review', [setErrors('Cross', 'Age', rule('Intro:Age', '<', 18))]],
      ['Elsewhere', [el('Other', 'Text'), setErrors('Unrelated', 'Other', rule('Intro:Age', '<', 18))]]
    ];
    const found = stoppers(steps, { Intro: { Age: 5 } }).firing;
    expect(found.map((item) => [item.name, item.outside])).toEqual([['Cross', true]]);
    expect(stoppers(steps, { Intro: { Age: 50 } }).firing).toEqual([]);
  });

  it('counts a Set Errors in a nested block as belonging to the step', () => {
    const found = stoppers([['Intro', [
      el('Age', 'Number'),
      el('Group', 'Block', {}, { children: [{ eleArray: [setErrors('Deep', 'Age', rule('Intro:Age', '<', 18))] }] })
    ]]], { Intro: { Age: 1 } }).firing;
    expect(names(found)).toEqual(['Deep']);
  });

  it('counts a Messaging element only while a Requirement or Error message is active', () => {
    const messaging = (messages) => el('Notice', 'Messaging', { validateExpression: rule('Intro:Age', '>', 17), messages });
    const requirement = [{ type: 'Requirement', text: 'Adults only', value: false }];
    const info = [{ type: 'Info', text: 'Fine', value: false }];
    expect(names(stoppers([['Intro', [el('Age', 'Number'), messaging(requirement)]]], { Intro: { Age: 3 } }).firing))
      .toEqual(['Notice']);
    expect(stoppers([['Intro', [el('Age', 'Number'), messaging(info)]]], { Intro: { Age: 3 } }).firing).toEqual([]);
    expect(stoppers([['Intro', [el('Age', 'Number'), messaging(requirement)]]], { Intro: { Age: 30 } }).firing).toEqual([]);
  });

  it('does not count a Messaging element outside the step, and is empty without data', () => {
    const steps = [
      ['Intro', [el('Age', 'Number')]],
      ['Other', [el('Notice', 'Messaging', {
        validateExpression: rule('Intro:Age', '>', 17), messages: [{ type: 'Error', text: 'No', value: false }]
      })]]
    ];
    expect(stoppers(steps, { Intro: { Age: 3 } }).firing).toEqual([]);
    expect(stoppers(steps, undefined).firing).toEqual([]);
  });
});

describe('customComponents', () => {
  const custom = (name, propSetMap = {}) => el(name, 'Custom Lightning Web Component', propSetMap);

  it('lists every Custom LWC in the step, with the verdict of its show rule when it has one', () => {
    const steps = [['Intro', [
      el('Kind', 'Text'),
      custom('Plain'),
      custom('Gated', { show: rule('Intro:Kind', '=', 'Business') }),
      el('Group', 'Block', {}, { children: [{ eleArray: [custom('Nested')] }] })
    ]], ['Other', [custom('Elsewhere')]]];
    const found = stoppers(steps, { Intro: { Kind: 'Person' } }).custom;
    expect(found.map((item) => [item.name, item.verdict, item.hidden])).toEqual([
      ['Plain', null, false],
      ['Gated', 'Hidden: Intro:Kind is "Person", not "Business"', true],
      ['Nested', null, false]
    ]);
    expect(found[1].tree).toMatchObject({ kind: 'group', ok: false });
  });

  it('says a rule it cannot judge falls back to what the definition shows', () => {
    const steps = [['Intro', [custom('Gated', { show: rule('Intro:Kind', '=', '=FOO(1)') })]]];
    expect(stoppers(steps, {}).custom[0].verdict).toMatch(/^Can't tell if this rule is true/);
  });

  it('works without data', () => {
    const elements = build([['Intro', [custom('Gated', { show: rule('Intro:Kind', '=', 'x') })]]]);
    expect(customComponents(elements, elements[0].key, undefined, {})).toHaveLength(1);
  });
});

describe('a required element whose show rule cannot be judged', () => {
  const unjudged = { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: 'contains', data: 'x' }] };
  const build1 = (extra) => {
    const elements = build([['Intro', [
      el('Kind', 'Text'),
      el('Gated', 'Text', { required: true, show: unjudged }, extra)
    ]]]);
    return elements;
  };

  it.each([[true], [false]])('is listed as estimated, not counted, whatever bShow says (bShow %s)', (shown) => {
    const elements = build1({ bShow: shown });
    const step = elements.find((element) => element.name === 'Intro');
    const data = { Intro: { Kind: 'x' } };
    const result = stepStoppers(elements, step.key, data, computeVisibility(elements, data));
    expect(result.count).toBe(0);
    expect(names(result.estimated)).toEqual(['Gated']);
  });
});

describe('stepStoppers', () => {
  it('counts the required and the firing ones, not the custom components', () => {
    const found = stoppers([['Intro', [
      el('Age', 'Number', { required: true }),
      el('Check', 'Set Errors', { show: rule('Intro:Age', '=', ''), elementErrorMap: { Age: 'x' } }),
      el('Widget', 'Custom Lightning Web Component')
    ]]], { Intro: { Age: '' } });
    expect(found.required).toHaveLength(1);
    expect(found.firing).toHaveLength(1);
    expect(found.custom).toHaveLength(1);
    expect(found.count).toBe(2);
  });
});

describe('message helpers', () => {
  it('knows which message types hold the user back', () => {
    expect(blocksNext({ type: 'Requirement' })).toBe(true);
    expect(blocksNext({ type: 'Error' })).toBe(true);
    expect(blocksNext({ type: 'Info' })).toBe(false);
    expect(blocksNext(null)).toBe(false);
  });

  it('is null when the expression cannot be judged', () => {
    expect(activeMessages({ raw: { validateExpression: 'Age > 1' }, messages: [] }, {})).toBeNull();
  });
});
