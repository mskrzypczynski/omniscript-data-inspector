'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { computeVisibility } from '../../../src/core/structure/visibility.js';
import { executionStatus } from '../../../src/core/shared/structure-model.js';
import { rowVerdicts, verdictHeaderTitle } from '../../../src/core/structure/row-verdict.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements, propSetMap], at) => ({
      name, type: 'Step', propSetMap: propSetMap || {}, indexInParent: at, children: [{ eleArray: elements }]
    }))
  }, null);
}

/* The verdicts of a script on step `active` (an index), by element name. */
function verdicts(steps, data, active = 0) {
  const elements = build(steps);
  const visibility = computeVisibility(elements, data);
  const progress = executionStatus(elements, data, active, visibility);
  const found = rowVerdicts({ elements, data, visibility, progress });
  return Object.fromEntries(elements.map((element) => [element.name, found[element.key]]));
}

const step = (extra) => [['Intro', extra]];

describe('a required input', () => {
  const inputs = () => step([
    el('Email', 'Email', { required: true }),
    el('Nickname', 'Text')
  ]);

  it('is blank when it holds a value: a tick on every valid element would drown the failures', () => {
    expect(verdicts(inputs(), { Intro: { Email: 'a@b.c' } }).Email).toBeUndefined();
  });

  it('is bad when it is empty and shown', () => {
    expect(verdicts(inputs(), { Intro: { Email: '' } }).Email)
      .toEqual({ tone: 'bad', text: 'Required and empty: would stop Next' });
  });

  it('says a required checkbox is not ticked', () => {
    const found = verdicts(step([el('Agree', 'Checkbox', { required: true })]), { Intro: { Agree: false } });
    expect(found.Agree).toEqual({ tone: 'bad', text: 'Required and not ticked: would stop Next' });
  });

  it('is blank while its show rule hides it, empty or not', () => {
    const hidden = step([
      el('Kind', 'Text'),
      el('Email', 'Email', { required: true, show: rule('Intro:Kind', '=', 'x') })
    ]);
    expect(verdicts(hidden, { Intro: { Kind: 'y' } }).Email).toBeUndefined();
    expect(verdicts(hidden, { Intro: { Kind: 'x' } }).Email.tone).toBe('bad');
  });

  it('is blank for an input that is not required, and for a required element that takes no input', () => {
    const found = verdicts(step([el('Nickname', 'Text'), el('Note', 'Text Block', { required: true })]), { Intro: {} });
    expect(found.Nickname).toBeUndefined();
    expect(found.Note).toBeUndefined();
  });

  it('is blank inside an Edit Block, which is enforced when the row is saved', () => {
    const found = verdicts(step([
      el('Rows', 'Edit Block', {}, { children: [{ eleArray: [el('Inner', 'Text', { required: true })] }] })
    ]), { Intro: {} });
    expect(found.Inner).toBeUndefined();
  });

  it('says which row is empty in a repeat block, and counts the others', () => {
    const elements = build(step([
      el('Rows', 'Block', { repeat: true }, { JSONPath: 'Intro:Rows', children: [{ eleArray: [
        el('Inner', 'Text', { required: true }, { JSONPath: 'Intro:Rows|1:Inner' })
      ] }] })
    ]));
    const data = { Intro: { Rows: [{ Inner: '' }, { Inner: 'x' }, { Inner: '' }] } };
    const visibility = computeVisibility(elements, data);
    const progress = executionStatus(elements, data, 0, visibility);
    const found = rowVerdicts({ elements, data, visibility, progress });
    const inner = elements.find((element) => element.name === 'Inner');
    expect(found[inner.key]).toEqual({ tone: 'bad', text: 'Required and empty (row 1) (and 1 more row): would stop Next' });
  });

  it('is a dash when the finding rests on a formula\'s estimate', () => {
    const found = verdicts(step([
      el('Kind', 'Text'),
      el('Gated', 'Text', { required: true, show: { group: { operator: 'AND', rules: [{ field: 'Kind', condition: 'matches', data: '1' }] } } })
    ]), { Intro: { Kind: 'x' } });
    expect(found.Gated.tone).toBe('neutral');
    expect(found.Gated.text).toMatch(/^Can't tell/);
  });
});

describe('a Messaging or Validation element', () => {
  const messaging = (messages, extra = {}) => el('Notice', 'Messaging', {
    validateExpression: rule('Intro:Age', '>', 17), messages, ...extra
  });
  const requirement = [{ type: 'Requirement', text: 'Adults only', value: false, active: true }];
  const warning = [{ type: 'Warning', text: 'Check your age', value: false, active: true }];
  const run = (messages, age, extra) => verdicts(step([el('Age', 'Number'), messaging(messages, extra)]), { Intro: { Age: age } }).Notice;

  it('is bad, with the message, while a Requirement is active', () => {
    expect(run(requirement, 5)).toEqual({ tone: 'bad', text: 'Validation fires and stops Next: “Adults only”' });
  });

  it('is blank when the expression is true and selects nothing', () => {
    expect(run(requirement, 30)).toBeUndefined();
  });

  it('is blank when it fires a warning that stops no one', () => {
    expect(run(warning, 5)).toBeUndefined();
  });

  it('is a dash when the expression cannot be judged', () => {
    const found = run(requirement, 5, { validateExpression: 'Age > 17' });
    expect(found.tone).toBe('neutral');
    expect(found.text).toMatch(/^Can't tell: the expression is a formula/);
  });

  it('is blank while its show rule hides it', () => {
    expect(run(requirement, 5, { show: rule('Intro:Age', '>', 100) })).toBeUndefined();
  });

  it('names what a message written as a formula comes to, not the formula', () => {
    const found = run([{ type: 'Error', text: "=IF(1=1,'Fix it','Never')", value: false, active: true }], 5);
    expect(found.tone).toBe('bad');
    expect(found.text).toBe('Validation fires and stops Next: estimated “Fix it”');
  });
});

describe('a Set Errors element', () => {
  const setErrors = (extra) => el('CheckAge', 'Set Errors', { elementErrorMap: { Age: 'Must be an adult' }, ...extra });
  const run = (age, extra) => verdicts(step([el('Age', 'Number'), setErrors({ show: rule('Intro:Age', '<', 18), ...extra })]), { Intro: { Age: age } }).CheckAge;

  it('is bad, with the text, while its condition holds', () => {
    expect(run(12)).toEqual({ tone: 'bad', text: 'Set Errors fires: “Must be an adult”' });
  });

  it('is blank when it does not fire', () => {
    expect(run(30)).toBeUndefined();
  });

  it('is a dash when its condition cannot be judged, or there is none', () => {
    expect(run(1, { show: rule('Intro:Age', 'IN LIST', '1,2') }).tone).toBe('neutral');
    const none = verdicts(step([setErrors({})]), { Intro: {} }).CheckAge;
    expect(none.tone).toBe('neutral');
    expect(none.text).toMatch(/^Can't tell: No condition is set/);
  });

  it('is judged on its own row, not on the step it targets', () => {
    const steps = [
      ['Intro', [el('Age', 'Number')]],
      ['Other', [setErrors({ show: rule('Intro:Age', '<', 18) })]]
    ];
    const found = verdicts(steps, { Intro: { Age: 3 }, Other: {} }, 1);
    expect(found.CheckAge.tone).toBe('bad');
    expect(found.Intro.tone).toBe('bad'); // the passed step is judged against the data now: this Set Errors targets it
  });
});

describe('a custom component', () => {
  it('is a dash that says what cannot be read', () => {
    const found = verdicts(step([el('Widget', 'Custom Lightning Web Component')]), { Intro: {} });
    expect(found.Widget.tone).toBe('neutral');
    expect(found.Widget.text).toMatch(/^Can't tell: a custom component may carry its own required controls/);
  });

  it('stays a dash when it is required and filled, and is bad when required and empty', () => {
    const widget = () => step([el('Widget', 'Custom Lightning Web Component', { required: true })]);
    expect(verdicts(widget(), { Intro: { Widget: 'x' } }).Widget.tone).toBe('neutral');
    expect(verdicts(widget(), { Intro: {} }).Widget.tone).toBe('bad');
  });
});

describe('what has nothing to judge', () => {
  it('leaves display text, a block and an action blank', () => {
    const found = verdicts(step([
      el('Note', 'Text Block', { text: 'Hi' }),
      el('Group', 'Block'),
      el('Load', 'DataRaptor Extract Action', { bundle: 'Demo_Load' })
    ]), { Intro: {} });
    expect(found.Note).toBeUndefined();
    expect(found.Group).toBeUndefined();
    expect(found.Load).toBeUndefined();
  });
});

describe('steps', () => {
  const steps = () => [
    ['Past', [el('Old', 'Text', { required: true })]],
    ['Now', [el('Email', 'Email', { required: true }), el('Phone', 'Text', { required: true })]],
    ['Later', [el('Valid', 'Text', { required: true })]],
    ['Clean', [el('Fine', 'Text')]]
  ];
  const run = (data, active = 1) => verdicts(steps(), data, active);

  it('sums its elements on the current step, with the count of the red badge', () => {
    expect(run({ Past: { Old: 'x' }, Now: {} }).Now).toEqual({ tone: 'bad', text: '2 things may stop Next' });
    expect(run({ Past: { Old: 'x' }, Now: { Email: 'a' } }).Now).toEqual({ tone: 'bad', text: '1 thing may stop Next' });
  });

  it('is good when it was judged and nothing fires', () => {
    expect(run({ Past: { Old: 'x' }, Now: { Email: 'a', Phone: 'b' } }).Now)
      .toEqual({ tone: 'good', text: 'Nothing stops Next on this step' });
  });

  it('judges a passed step against the data now, so one gone bad shows a cross', () => {
    const found = run({ Past: { Old: '' }, Now: { Email: 'a', Phone: 'b' } });
    expect(found.Past.tone).toBe('bad');
    expect(found.Old).toEqual({ tone: 'bad', text: 'Required and empty: would stop Next' });
  });

  it('leaves a step ahead and everything in it blank', () => {
    const found = run({ Now: {}, Later: {} });
    expect(found.Later).toBeUndefined();
    expect(found.Next).toBeUndefined();
  });

  it('is a dash, "Passed without running", for a skipped step, and blank inside it', () => {
    const skipped = [
      ['Gate', [el('Kind', 'Text')]],
      ['Maybe', [el('Inner', 'Text', { required: true })], { show: rule('Gate:Kind', '=', 'x') }],
      ['Here', [el('Field', 'Text')]]
    ];
    const found = verdicts(skipped, { Gate: { Kind: 'y' } }, 2);
    expect(found.Maybe).toEqual({ tone: 'neutral', text: 'Passed without running' });
    expect(found.Inner).toBeUndefined();
  });

  it('is a dash rather than a tick when a finding rests on an estimate', () => {
    const found = verdicts(step([
      el('Kind', 'Text'),
      el('Gated', 'Text', { required: true, show: { group: { operator: 'AND', rules: [{ field: 'Kind', condition: 'matches', data: '1' }] } } })
    ]), { Intro: { Kind: 'x' } });
    expect(found.Intro.tone).toBe('neutral');
    expect(found.Intro.text).toMatch(/^Can't tell: a finding rests on a formula's estimate/);
  });

  it('shares the stoppers a caller keeps for the badge', () => {
    const elements = build(steps());
    const data = { Past: { Old: 'x' }, Now: {} };
    const visibility = computeVisibility(elements, data);
    const progress = executionStatus(elements, data, 1, visibility);
    const asked = [];
    const stoppers = (stepElement) => {
      asked.push(stepElement.name);
      return { required: [], firing: [], custom: [], estimated: [], items: [], count: 7 };
    };
    const found = rowVerdicts({ elements, data, visibility, progress, stoppers });
    expect(found[elements.find((e) => e.name === 'Now').key].text).toBe('7 things may stop Next');
    expect([...new Set(asked)].sort()).toEqual(['Now', 'Past']); // asked, once per judged step
    expect(asked).toHaveLength(2);
  });
});

describe('with no data', () => {
  it('is blank throughout', () => {
    const elements = build(step([el('Email', 'Email', { required: true })]));
    const progress = executionStatus(elements, undefined, 0, {});
    expect(rowVerdicts({ elements, data: undefined, visibility: {}, progress })).toEqual({});
  });

  it('says in the header tooltip that none has been read', () => {
    expect(verdictHeaderTitle(true)).toBe('Whether the element is valid now: ✕ would stop Next, – the panel cannot tell; a step shows ✓ when nothing stops Next on it. Blank is valid or nothing to judge. Judged against the data right now; best effort.');
    expect(verdictHeaderTitle(false)).toBe(`${verdictHeaderTitle(true)} No data has been read yet.`);
  });
});
