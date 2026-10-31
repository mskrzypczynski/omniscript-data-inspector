'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { scriptSummary, rootOf } from '../../../src/core/structure/script-summary.js';

const field = (name, type, props = {}, extra = {}) => ({ name, type, propSetMap: props, ...extra });

/* The shape of the demo script: a Data Mapper, steps with fields, a choice, text
 * blocks, a hidden element and an Integration Procedure. Names are invented. */
const DEFINITION = {
  bpType: 'Account',
  bpSubType: 'Onboarding',
  bpLang: 'English',
  asIndex: 3,
  children: [
    field('Load', 'DataRaptor Extract Action', { bundle: 'DRExtract_Account', postTransformBundle: 'DRShape_Account' }),
    field('Contact', 'Step', {}, { eleArray: [
      field('FirstName', 'Text', { required: true }),
      field('Email', 'Email'),
      field('OptIn', 'Checkbox')
    ] }),
    field('Plan', 'Step', {}, { eleArray: [
      field('Choice', 'Radio'),
      field('Note', 'Text Block'),
      field('Extras', 'Block', {}, { eleArray: [field('ExtraName', 'Text')] })
    ] }),
    field('Review', 'Step', {}, { eleArray: [field('Terms', 'Checkbox', { required: true })] }),
    field('Save', 'Integration Procedure Action', { integrationProcedureKey: 'Onboarding_Save' }),
    field('Again', 'Integration Procedure Action', { integrationProcedureKey: 'Onboarding_Save' }),
    field('Legacy', 'Remote Action', { remoteClass: 'LegacySvc', remoteMethod: 'run' })
  ]
};

const elements = (definition = DEFINITION, header = null) => flatten(definition, header);
const byId = (summary) => Object.fromEntries(summary.rows.map((row) => [row.id, row]));
const keyOf = (list, name) => list.find((e) => e.name === name).key;

describe('scriptSummary of a script like the demo', () => {
  const list = elements();
  const summary = scriptSummary(rootOf(DEFINITION), list, { step: { key: keyOf(list, 'Plan') }, problems: [], stoppers: { count: 0 } });
  const rows = byId(summary);

  it('names the script and its Type / SubType / Language', () => {
    expect(summary.title).toBe('Account/Onboarding');
    expect(rows.identity.text).toBe('Account / Onboarding / English');
  });

  it('counts all the elements, as the status bar does, by kind with the steps first, leaving out the kinds there are none of', () => {
    expect(rows.steps).toBeUndefined(); // the steps are counted in Elements, like the status bar's total
    expect(rows.elements.text).toBe('15: 3 steps · 6 fields · 1 text or display · 1 block · 4 actions');
    expect(rows.elements.text).not.toContain('custom');
  });

  it('lists what the script calls, once per name, linked to the first element that calls it', () => {
    expect(rows['calls-dr'].label).toBe('Data Mappers');
    expect(rows['calls-dr'].items.map((item) => item.text)).toEqual(['DRExtract_Account', 'DRShape_Account']);
    expect(rows['calls-ip'].items).toEqual([{ text: 'Onboarding_Save', key: keyOf(list, 'Save'), count: 2 }]);
    expect(rows['calls-remote'].items[0]).toMatchObject({ text: 'LegacySvc.run', key: keyOf(list, 'Legacy') });
  });

  it('says which step the script is on, and leaves out what is zero or unknown', () => {
    expect(rows.step).toMatchObject({ label: 'On step', text: 'Plan', link: { kind: 'element', key: keyOf(list, 'Plan') } });
    expect(rows.problems).toBeUndefined();
    expect(rows.stoppers).toBeUndefined();
    expect(rows.furthest).toBeUndefined();
    expect(rows.labels).toBeUndefined();
    expect(rows.version).toBeUndefined();
  });
});

describe('scriptSummary standing', () => {
  const list = elements();

  it('counts problems, but not notes, and links to the list', () => {
    const problems = [{ severity: 'error' }, { severity: 'warning' }, { severity: 'note' }];
    const rows = byId(scriptSummary({}, list, { problems }));
    expect(rows.problems).toMatchObject({ text: '2', link: { kind: 'problems' } });
    expect(byId(scriptSummary({}, list, { problems: [{ severity: 'note' }] })).problems).toBeUndefined();
  });

  it('shows May stop Next for the current step while it is above zero, linked to its Validation tab', () => {
    const step = { key: keyOf(list, 'Review') };
    const rows = byId(scriptSummary({}, list, { step, stoppers: { count: 2 } }));
    expect(rows.stoppers).toMatchObject({ text: '2', link: { kind: 'element', key: step.key, tab: 'validation' } });
    expect(byId(scriptSummary({}, list, { stoppers: { count: 2 } })).stoppers).toBeUndefined(); // no current step
  });

  it('names the furthest step reached when the script is back on an earlier one', () => {
    const visits = [{ key: keyOf(list, 'Contact') }, { key: keyOf(list, 'Review') }, { key: keyOf(list, 'Contact') }];
    const rows = byId(scriptSummary({}, list, { step: { key: keyOf(list, 'Contact') }, visits }));
    expect(rows.step.text).toBe('Contact');
    expect(rows.furthest).toMatchObject({ text: 'Review', link: { key: keyOf(list, 'Review') } });
  });

  it('does not repeat the current step as the furthest', () => {
    const rows = byId(scriptSummary({}, list, { step: { key: keyOf(list, 'Review') }, visits: [{ key: keyOf(list, 'Contact') }] }));
    expect(rows.furthest).toBeUndefined();
  });

  it('gives the step its label in brackets when it differs from the name', () => {
    const labelled = elements({ children: [{ name: 'S1', type: 'Step', propSetMap: { label: 'Your details' }, children: [] }] });
    const rows = byId(scriptSummary({}, labelled, { step: { key: labelled[0].key } }));
    expect(rows.step.text).toBe('S1 (Your details)');
  });
});

describe('scriptSummary of the root', () => {
  it('reads the version, whether it is active and reusable, from the root or its propSetMap', () => {
    const root = rootOf({
      bpType: 'A', bpSubType: 'B', bpLang: 'English', children: [{ name: 'huge' }],
      versionNumber: 3, isActive: true, omniProcessType: 'OmniScript',
      propSetMap: { isReusable: true, lwcId: 'lwc-demo', elementTypeComponentMapping: { Text: 'c-text', Select: 'c-select' }, persistentComponent: [{ id: 'p' }], junk: 'x' }
    });
    expect(root.children).toBeUndefined();
    expect(root.propSetMap.junk).toBeUndefined();
    const rows = byId(scriptSummary(root, [], {}));
    expect(rows.version.text).toBe('OmniScript 3 · active · reusable');
    expect(rows.component.text).toBe('lwc-demo');
    expect(rows.mapping.text).toBe('2');
    expect(rows.persistent.text).toBe('1');
  });

  it('says not active for an inactive version, and nothing about reusable when it is not', () => {
    const rows = byId(scriptSummary({ isActive: false, isReusable: false, versionNumber: 1 }, [], {}));
    expect(rows.version.text).toBe('1 · not active');
  });

  it('counts custom labels, their languages and the missing ones, which link to the Problems list', () => {
    const list = elements({
      bpLang: 'Multi-Language',
      children: [{ name: 'S', type: 'Step', propSetMap: { label: 'KeyOne' }, children: [{ eleArray: [
        { name: 'T', type: 'Text', propSetMap: { label: 'KeyTwo' } }
      ] }] }]
    }, { bpLang: 'Multi-Language', allCustomLabels: { KeyOne: { en_US: 'One', fr: 'Un' } } });
    const rows = byId(scriptSummary({}, list, { header: { bpLang: 'Multi-Language', allCustomLabels: { KeyOne: { en_US: 'One', fr: 'Un' } } } }));
    expect(rows.labels.text).toBe('2 keys · en_US, fr · 1 missing');
    expect(rows.labels.link).toEqual({ kind: 'problems' });
  });

  it('shows no custom labels row for a script that has none', () => {
    expect(byId(scriptSummary({}, elements(), {})).labels).toBeUndefined();
  });
});

describe('scriptSummary of nothing', () => {
  it('gives no rows for a bare definition', () => {
    expect(scriptSummary({}, [], {})).toEqual({ title: 'this script', rows: [] });
    expect(scriptSummary(undefined, undefined, undefined).rows).toEqual([]);
    expect(scriptSummary(null, [], { problems: [], stoppers: { count: 0 } }).rows).toEqual([]);
  });

  it('survives odd shapes', () => {
    expect(rootOf(null)).toEqual({});
    expect(rootOf([1])).toEqual({});
    expect(() => scriptSummary({ bpType: 5, propSetMap: [] }, [], { visits: [{}], step: {} })).not.toThrow();
  });
});
