'use strict';

/* Set Values resolution, live validation, repeat rows and the
 * detail tab rules: the pure decisions behind the Structure detail pane. */

import { flatten } from '../../../src/core/shared/structure-model.js';
import { createReferences } from '../../../src/core/shared/references.js';
import { resolveAssignments } from '../../../src/core/structure/set-values.js';
import { stepStoppers } from '../../../src/core/structure/step-validation.js';
import { liveMessaging, describeActive, liveSetErrors } from '../../../src/core/structure/live-validation.js';
import { computeVisibility } from '../../../src/core/structure/visibility.js';
import { repeatBlockOf, rowCount, rowsByName, clampRow } from '../../../src/core/structure/repeat-rows.js';
import { detailTabs, validationLabel, usableTab, shortTabLabel, tabTitle, SHORT_TAB_NAMES } from '../../../src/core/structure/detail-tabs.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

function build(steps) {
  return flatten({
    children: steps.map(([name, elements, propSetMap]) => ({
      name, type: 'Step', propSetMap: propSetMap || {}, children: [{ eleArray: elements }]
    }))
  }, null);
}
const named = (elements, name) => elements.find((element) => element.name === name);

describe('resolveAssignments', () => {
  const elements = () => build([['Intro', [
    el('First', 'Text'), el('Last', 'Text'), el('Full', 'Text'), el('Age', 'Number'),
    el('Fill', 'Set Values', { elementValueMap: {
      Full: '%First% %Last%', Age: '%Years%', Tag: 'fixed', Calc: '=%First% & "x"', Broken: '=FOO(%First%)', Gap: '%Nothing%'
    } })
  ]]]);

  const resolve = (data, rows) => {
    const list = elements();
    return resolveAssignments(named(list, 'Fill'), data, createReferences(list), rows);
  };
  const byTarget = (items, target) => items.find((item) => item.target === target);

  it('fills the merge fields in from the live data', () => {
    const items = resolve({ Intro: { First: 'Ada', Last: 'Lovelace', Full: 'Ada Lovelace', Years: 36 } });
    expect(byTarget(items, 'Full')).toMatchObject({ text: 'Ada Lovelace', resolved: 'Ada Lovelace', current: 'Ada Lovelace', differs: false });
  });

  it('keeps the type of a single merge field', () => {
    const items = resolve({ Intro: { Years: 36, Age: 36 } });
    expect(byTarget(items, 'Age')).toMatchObject({ resolved: 36, current: 36, differs: false });
  });

  it('marks an assignment whose result differs from what the target holds', () => {
    const items = resolve({ Intro: { First: 'Ada', Last: 'Byron', Full: 'Ada Lovelace' } });
    expect(byTarget(items, 'Full')).toMatchObject({ text: 'Ada Byron', differs: true });
    expect(byTarget(items, 'Tag')).toMatchObject({ resolved: 'fixed', current: undefined, differs: true });
  });

  it('estimates a formula, and compares the estimate with what the target holds', () => {
    const items = resolve({ Intro: { First: 'Ada', Last: 'L', Calc: 'Adax' } });
    expect(byTarget(items, 'Calc')).toMatchObject({
      isFormula: true, text: '=Ada & "x"', resolved: 'Adax', estimated: true, formulaReason: '', differs: false
    });
    const other = resolve({ Intro: { First: 'Ada', Last: 'L', Calc: 'old' } });
    expect(byTarget(other, 'Calc')).toMatchObject({ resolved: 'Adax', estimated: true, differs: true });
  });

  it('does not judge a formula it cannot evaluate, or a field with no value', () => {
    const items = resolve({ Intro: { First: 'Ada', Last: 'L' } });
    expect(byTarget(items, 'Broken')).toMatchObject({
      isFormula: true, resolved: undefined, estimated: false, formulaReason: 'Unknown function FOO', differs: null
    });
    expect(byTarget(items, 'Gap')).toMatchObject({ missing: ['Nothing'], differs: null });
    expect(byTarget(items, 'Calc').formulaReason).toBe('');
  });

  it('names the field a formula is waiting for', () => {
    const items = resolve({ Intro: { Last: 'L' } });
    expect(byTarget(items, 'Calc')).toMatchObject({ resolved: undefined, estimated: false, formulaReason: 'No value for %First%' });
  });

  it('reads nothing without data', () => {
    const items = resolve(undefined);
    expect(byTarget(items, 'Full')).toMatchObject({ differs: null, missing: ['First', 'Last'] });
  });

  it('follows the chosen repeat row', () => {
    const list = build([['Intro', [
      el('Rows', 'Block', { repeat: true }, { children: [{ eleArray: [el('Qty', 'Number'), el('Copy', 'Number')] }] }),
      el('Fill', 'Set Values', { elementValueMap: { 'Intro:Rows|1:Copy': '%Qty%' } })
    ]]]);
    list.find((e) => e.name === 'Qty').jsonPath = 'Intro:Rows|1:Qty';
    list.find((e) => e.name === 'Copy').jsonPath = 'Intro:Rows|1:Copy';
    const data = { Intro: { Rows: [{ Qty: 1, Copy: 1 }, { Qty: 5, Copy: 1 }] } };
    const refs = createReferences(list);
    const fill = named(list, 'Fill');
    expect(resolveAssignments(fill, data, refs, { Rows: 1 })[0].differs).toBe(false);
    expect(resolveAssignments(fill, data, refs, { Rows: 2 })[0]).toMatchObject({ resolved: 5, current: 1, differs: true });
  });
});

describe('liveMessaging / liveSetErrors', () => {
  const validation = (extra = {}) => {
    const list = build([['Intro', [el('Age', 'Number'), el('Notice', 'Messaging', {
      validateExpression: rule('Intro:Age', '>', 17),
      messages: [
        { type: 'Requirement', text: 'Adults only', value: false, active: true },
        { type: 'Info', text: 'Welcome', value: true, active: true }
      ],
      ...extra
    })]]]);
    return named(list, 'Notice').validation;
  };

  it('says the expression is false, keeps the per-rule lines, and that the Requirement blocks', () => {
    const live = liveMessaging(validation(), { Intro: { Age: 5 } });
    expect(live.state).toBe('false');
    expect(live.headline).toBe('Expression is false');
    expect(live.lines[0]).toMatchObject({ ok: false, field: 'Intro:Age' });
    expect(live.blocks).toBe(true);
    expect(describeActive(live)).toBe('Requirement: “Adults only” — blocks Next');
  });

  it('selects the Info message when the expression is true', () => {
    const live = liveMessaging(validation(), { Intro: { Age: 30 } });
    expect(live.headline).toBe('Expression is true');
    expect(live.blocks).toBe(false);
    expect(describeActive(live)).toBe('Info: “Welcome” — does not block Next');
  });

  it('says no message is active when none matches', () => {
    const only = validation({ messages: [{ type: 'Error', text: 'Never', value: true }] });
    expect(describeActive(liveMessaging(only, { Intro: { Age: 5 } }))).toBe('No message is active now');
  });

  it('gives up on a formula, and on elements that are not Messaging', () => {
    const formula = liveMessaging(validation({ validateExpression: 'Age > 17' }), { Intro: { Age: 5 } });
    expect(formula.state).toBe('unknown');
    expect(formula.headline).toMatch(/formula/);
    expect(liveMessaging(null, {})).toBeNull();
  });

  it('judges a Set Errors condition', () => {
    const list = build([['Intro', [el('Age', 'Number'), el('Check', 'Set Errors', {
      elementErrorMap: { Age: 'Low' }, show: rule('Intro:Age', '<', 18)
    })]]]);
    const check = named(list, 'Check');
    const state = (data) => liveSetErrors(check.validation, computeVisibility(list, data)[check.key]).state;
    expect(state({ Intro: { Age: 3 } })).toBe('true');
    expect(state({ Intro: { Age: 30 } })).toBe('false');
    expect(liveSetErrors(null, null)).toBeNull();
  });
});

describe('a Set Errors with no condition', () => {
  const list = () => build([['Intro', [el('Age', 'Number'), el('Check', 'Set Errors', { elementErrorMap: { Age: 'Low' } })]]]);

  it('is said to be unjudgeable, the same as the count says (it does not claim to block Next)', () => {
    const elements = list();
    const check = named(elements, 'Check');
    const data = { Intro: { Age: 3 } };
    const visibility = computeVisibility(elements, data);
    const live = liveSetErrors(check.validation, visibility[check.key]);
    expect(live).toMatchObject({ state: 'unknown', blocks: false });
    expect(live.headline).not.toMatch(/blocks Next/);
    const step = elements.find((element) => element.name === 'Intro');
    expect(stepStoppers(elements, step.key, data, visibility).count).toBe(0);
  });
});

describe('repeat rows', () => {
  const list = () => {
    const elements = build([['Intro', [
      el('Rows', 'Edit Block', {}, { children: [{ eleArray: [el('Qty', 'Number')] }] }),
      el('Plain', 'Block', {}, { children: [{ eleArray: [el('Solo', 'Text')] }] })
    ]]]);
    named(elements, 'Qty').jsonPath = 'Intro:Rows|1:Qty';
    named(elements, 'Rows').jsonPath = 'Intro:Rows';
    return elements;
  };
  const byKey = (elements) => Object.fromEntries(elements.map((e) => [e.key, e]));
  const data = { Intro: { Rows: [{ Qty: 1 }, { Qty: 2 }, { Qty: 3 }], Plain: { Solo: 'x' } } };

  it('counts the rows the data holds', () => {
    const elements = list();
    expect(rowCount(named(elements, 'Rows'), data)).toBe(3);
    expect(rowCount(named(elements, 'Plain'), data)).toBe(0);
    expect(rowCount(named(elements, 'Rows'), undefined)).toBe(0);
  });

  it('finds the repeating block above an element, and none for a plain block', () => {
    const elements = list();
    expect(repeatBlockOf(named(elements, 'Qty'), byKey(elements), data)).toMatchObject({ count: 3 });
    expect(repeatBlockOf(named(elements, 'Qty'), byKey(elements), data).block.name).toBe('Rows');
    expect(repeatBlockOf(named(elements, 'Solo'), byKey(elements), data)).toBeNull();
  });

  it('knows a declared repeat block before it has rows', () => {
    const elements = list();
    expect(repeatBlockOf(named(elements, 'Qty'), byKey(elements), {})).toMatchObject({ count: 0 });
  });

  it('turns the chosen rows into { blockName: row }, kept inside the rows that exist', () => {
    const elements = list();
    const rows = rowsByName({ [named(elements, 'Rows').key]: 9, nope: 2 }, byKey(elements), data);
    expect(rows).toEqual({ Rows: 3 });
    expect(clampRow(0, 3)).toBe(1);
    expect(clampRow(2.7, 3)).toBe(2);
  });
});

describe('shortTabLabel', () => {
  it('gives each tab one short word, and keeps the count the full label carries', () => {
    expect(['value', 'props', 'conditions', 'validation', 'calls', 'definition']
      .map((id) => shortTabLabel({ id, label: 'x' }))).toEqual(['Value', 'Props', 'Visib.', 'Valid.', 'Calls', 'JSON']);
    expect(shortTabLabel({ id: 'validation', label: 'Validation (3)' })).toBe('Valid. (3)');
    expect(shortTabLabel({ id: 'calls', label: 'Calls (2)' })).toBe('Calls (2)');
    expect(shortTabLabel({ id: 'other', label: 'Something' })).toBe('Something');
  });
});

describe('the short names and the tooltip of a tab', () => {
  it('is a cut-short form of the full name, from one table', () => {
    const full = { value: 'Current value', props: 'Properties', conditions: 'Visibility', validation: 'Validation', calls: 'Calls', definition: 'JSON' };
    Object.entries(full).forEach(([id, name]) => {
      const short = SHORT_TAB_NAMES[id].replace(/\.$/, '');
      expect(name[0].toLowerCase() === short[0].toLowerCase() || name.toLowerCase().includes(short.toLowerCase())).toBe(true);
    });
  });

  it('names the tab in full in its tooltip, then what it holds', () => {
    expect(tabTitle({ id: 'props', label: 'Properties' })).toBe('Properties');
    expect(tabTitle({ id: 'validation', label: 'Validation (2)', hint: 'What may stop Next' })).toBe('Validation (2)\nWhat may stop Next');
  });
});

describe('detailTabs', () => {
  const ids = (tabs) => tabs.map((tab) => tab.id);
  const step = () => build([['Intro', [el('Age', 'Number'), el('Call', 'DataRaptor Extract Action', { bundle: 'B' })]]]);

  it('offers only the tabs that apply, with JSON last', () => {
    const list = step();
    expect(ids(detailTabs({ element: named(list, 'Intro'), propsCount: 1, value: {} }))).toEqual(['value', 'props', 'definition']);
    expect(ids(detailTabs({ element: named(list, 'Age'), value: 1 }))).toEqual(['value', 'definition']);
  });

  it('keeps the order stable: Value, Properties, Visibility, Validation, Calls, JSON', () => {
    const list = build([['Intro', [el('Check', 'Set Errors', { elementErrorMap: { Intro: 'x' } }, {}),
      el('Call', 'DataRaptor Extract Action', { bundle: 'B' })]]]);
    const call = named(list, 'Call');
    expect(ids(detailTabs({ element: call, callsCount: 1, value: 1 }))).toEqual(['value', 'calls', 'definition']);
    expect(ids(detailTabs({ element: named(list, 'Check'), value: 1 }))).toEqual(['value', 'validation', 'definition']);
    const everything = detailTabs({
      element: { ...named(list, 'Intro'), validation: { has: true }, remote: 'x', conditional: true },
      propsCount: 2, stopCount: 1, value: 1, wired: true
    });
    expect(ids(everything)).toEqual(['value', 'props', 'conditions', 'validation', 'calls', 'definition']);
  });

  it('leaves out Properties without properties and Visibility without a rule that anything uses', () => {
    const age = named(step(), 'Age');
    expect(ids(detailTabs({ element: age }))).not.toContain('props');
    expect(ids(detailTabs({ element: age }))).not.toContain('conditions');
    expect(ids(detailTabs({ element: age, propsCount: 2 }))).toContain('props');
    expect(ids(detailTabs({ element: age, usedByCount: 1 }))).toContain('conditions');
    expect(ids(detailTabs({ element: { ...age, conditional: true } }))).toContain('conditions');
  });

  it('gives each tab an icon', () => {
    const age = named(step(), 'Age');
    const tabs = detailTabs({ element: age, propsCount: 2, usedByCount: 1, value: 1 });
    expect(tabs.map((tab) => tab.icon)).toEqual(['value', 'props', 'rules', 'definition']);
  });

  it('leaves Current value out while the element holds none, and shows it once it does', () => {
    const age = named(step(), 'Age');
    expect(ids(detailTabs({ element: age }))).toEqual(['definition']);
    expect(ids(detailTabs({ element: age, value: 3 }))).toEqual(['value', 'definition']);
    expect(ids(detailTabs({ element: age, value: 0 }))).toContain('value'); // 0 is a value
  });

  it('never returns a tab it cannot use: nothing is greyed out', () => {
    const list = step();
    const everything = detailTabs({
      element: { ...named(list, 'Intro'), validation: { has: true }, remote: 'x', conditional: true },
      propsCount: 2, stopCount: 1, callsCount: 0, wired: true
    });
    expect(everything.every((tab) => tab.enabled === true)).toBe(true);
    expect(everything.some((tab) => 'reason' in tab)).toBe(false);
  });

  it('leaves out Calls for an action with nothing captured and nothing wired', () => {
    const call = named(step(), 'Call');
    expect(ids(detailTabs({ element: call }))).not.toContain('calls');
    expect(ids(detailTabs({ element: call, wired: true }))).toContain('calls');
    expect(ids(detailTabs({ element: call, callsCount: 2 }))).toContain('calls');
  });

  it('offers Visibility for the links it lists even when the element has no rule', () => {
    const age = named(step(), 'Age');
    expect(ids(detailTabs({ element: age }))).not.toContain('conditions');
    expect(ids(detailTabs({ element: age, linkCount: 2 }))).toContain('conditions');
  });

  it('leaves out Set Values for a Set Values element with no assignments', () => {
    const set = { ...named(step(), 'Age'), isSetValues: true, setValues: null };
    expect(ids(detailTabs({ element: set }))).toEqual(['definition']);
    expect(ids(detailTabs({ element: { ...set, setValues: { a: 1 } } }))).toEqual(['value', 'definition']);
  });

  it('gives a step a Validation tab only while something may stop Next or it holds a custom component', () => {
    const intro = named(step(), 'Intro');
    expect(ids(detailTabs({ element: intro }))).not.toContain('validation');
    expect(ids(detailTabs({ element: intro, customCount: 1 }))).toContain('validation');
    const tab = detailTabs({ element: intro, stopCount: 2 }).find((t) => t.id === 'validation');
    expect(tab.label).toBe('Validation (2)');
    expect(validationLabel(0)).toBe('Validation');
    expect(validationLabel(2)).toBe('Validation (2)');
  });

  it('shows Calls only for an element that calls something, and falls back to JSON', () => {
    const call = named(step(), 'Call');
    const tabs = detailTabs({ element: call, callsCount: 0 });
    expect(tabs.find((tab) => tab.id === 'calls')).toBeUndefined();
    expect(usableTab(tabs, 'calls')).toBe('definition');
    expect(detailTabs({ element: call, callsCount: 2 }).find((tab) => tab.id === 'calls').label).toBe('Calls (2)');
  });

  it('offers Calls without a captured call when the action says what it sends and where it lands', () => {
    const call = named(step(), 'Call');
    expect(detailTabs({ element: call, callsCount: 0, wired: true }).find((tab) => tab.id === 'calls').enabled).toBe(true);
  });

  it('falls back to the first tab that is available, not always JSON', () => {
    const call = named(step(), 'Call');
    const tabs = detailTabs({ element: call, propsCount: 3 });
    expect(usableTab(tabs, 'calls')).toBe('props');
    expect(usableTab(tabs, 'definition')).toBe('definition');
    expect(usableTab(detailTabs({ element: call, value: 1, propsCount: 3 }), 'validation')).toBe('value');
  });
});
