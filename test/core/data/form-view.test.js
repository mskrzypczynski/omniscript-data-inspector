'use strict';

/* The Form view of the Data tab: where each row sits in the tree, which element the
 * top-level keys are named after, what a filter lets through. Names are invented. */

import { flatten } from '../../../src/core/shared/structure-model.js';
import { formRows } from '../../../src/core/structure/form-rows.js';
import {
  formScopeKey, rowPlaces, pathResolver, labelHits, formVisible, visibleRows, nearestDrawn
} from '../../../src/core/data/form-view.js';

const stepsOnly = flatten({
  children: [{
    name: 'Step1', type: 'Step', propSetMap: { label: 'Your details' },
    children: [{ eleArray: [
      { name: 'FirstName', type: 'Text', propSetMap: { label: 'First name' } },
      { name: 'Rows', type: 'Edit Block', propSetMap: { label: 'Phone numbers' },
        children: [{ eleArray: [{ name: 'Number', type: 'Text', propSetMap: { label: 'Number' } }] }] }
    ] }]
  }]
}, null);

/* The script itself as the root element, the steps one level below it. */
const underRoot = flatten({
  name: 'Onboarding', type: 'OmniScript', propSetMap: {},
  children: [{ name: 'Step1', type: 'Step', propSetMap: { label: 'Your details' } }]
}, null);

const data = {
  Step1: { FirstName: 'Ada', Rows: [{ Number: '555' }, { Number: '777' }] },
  userId: 'u-1'
};

describe('formScopeKey', () => {
  it('is the top when the steps sit at the top of the definition', () => {
    expect(formScopeKey(stepsOnly, data)).toBe('');
  });

  it('is the root element when the steps sit under the script itself', () => {
    const root = underRoot.find((element) => element.depth === 0);
    expect(formScopeKey(underRoot, data)).toBe(root.key);
  });

  it('is the top without a definition, or for data that is not an object', () => {
    expect(formScopeKey([], data)).toBe('');
    expect(formScopeKey(underRoot, 'text')).toBe('');
    expect(formScopeKey(underRoot, [1, 2])).toBe('');
  });
});

describe('rowPlaces', () => {
  const rows = (open) => formRows({ key: '' }, data, stepsOnly, (id) => open.includes(id)).rows;

  it('gives each row the path the Data tree uses for the same key', () => {
    const placed = rowPlaces(rows(['Step1', 'Step1\u001fRows', 'Step1\u001fRows\u001f0']), data);
    expect(placed.map((row) => row.path)).toEqual([
      'Step1', 'Step1\u0001FirstName', 'Step1\u0001Rows', 'Step1\u0001Rows\u00010', 'Step1\u0001Rows\u00010\u0001Number',
      'Step1\u0001Rows\u00011', 'userId'
    ]);
  });

  it('says which rows are items of a list', () => {
    const placed = rowPlaces(rows(['Step1', 'Step1\u001fRows']), data);
    expect(placed.filter((row) => row.inArray).map((row) => row.key)).toEqual(['0', '1']);
  });

  it('follows a list row known by its Id to its position', () => {
    const withIds = { List: [{ Id: 'a', V: 1 }, { Id: 'b', V: 2 }] };
    const placed = rowPlaces(formRows({ key: '' }, withIds, [], (id) => id === 'List').rows, withIds);
    expect(placed.map((row) => row.path)).toEqual(['List', 'List\u00010', 'List\u00011']);
    expect(placed[2].id).toBe('List\u001f#b');
  });
});

describe('pathResolver', () => {
  it('turns the id of a group into its tree path, Id segments included', () => {
    const withIds = { List: [{ Id: 'a', Inner: { x: 1 } }, { Id: 'b', Inner: { x: 2 } }] };
    const resolve = pathResolver(withIds);
    expect(resolve('List')).toBe('List');
    expect(resolve('List\u001f#b\u001fInner')).toBe('List\u00011\u0001Inner');
    expect(resolve('List\u001f#nope')).toBeNull();
    expect(resolve('Missing\u001fdeeper')).toBeNull();
  });
});

describe('labelHits', () => {
  it('finds the keys whose element label contains the text, at any depth, ignoring case', () => {
    expect(labelHits(data, stepsOnly, '', 'FIRST N')).toEqual(['Step1\u0001FirstName']);
    expect(labelHits(data, stepsOnly, '', 'phone')).toEqual(['Step1\u0001Rows']);
    expect(labelHits(data, stepsOnly, '', 'number')).toEqual(['Step1\u0001Rows', 'Step1\u0001Rows\u00010\u0001Number', 'Step1\u0001Rows\u00011\u0001Number']);
  });

  it('finds nothing without a definition, for an empty text, or for a key with no element', () => {
    expect(labelHits(data, [], '', 'first')).toEqual([]);
    expect(labelHits(data, stepsOnly, '', '  ')).toEqual([]);
    expect(labelHits(data, stepsOnly, '', 'userId')).toEqual([]);
  });

  it('reads the keys under the script root when that is the scope', () => {
    const root = underRoot.find((element) => element.depth === 0);
    expect(labelHits(data, underRoot, root.key, 'details')).toEqual(['Step1']);
    expect(labelHits(data, underRoot, '', 'details')).toEqual([]);
  });

  it('matches the label the form shows for the row', () => {
    const { rows } = formRows({ key: '' }, data, stepsOnly, (id) => id === 'Step1');
    const hit = labelHits(data, stepsOnly, '', 'first name');
    expect(rowPlaces(rows, data).filter((row) => hit.includes(row.path)).map((row) => row.label)).toEqual(['First name']);
  });
});

describe('formVisible', () => {
  const S = '\u0001';

  it('is null while nothing narrows the rows', () => {
    expect(formVisible(data, {})).toBeNull();
    expect(formVisible(data, { query: '  ' })).toBeNull();
  });

  it('lets a text through by key or value, with the way down to it', () => {
    const byValue = formVisible(data, { query: 'ada' });
    expect([...byValue].sort()).toEqual(['', 'Step1', `Step1${S}FirstName`]);
    const byKey = formVisible(data, { query: 'userid' });
    expect(byKey.has('userId')).toBe(true);
    expect(byKey.has('Step1')).toBe(false);
  });

  it('lets a label through, with the way down and everything under it when it is a group', () => {
    const visible = formVisible(data, { query: 'phone numbers', hits: labelHits(data, stepsOnly, '', 'phone numbers') });
    expect(visible.has('Step1')).toBe(true);
    expect(visible.has(`Step1${S}Rows`)).toBe(true);
    expect(visible.has(`Step1${S}Rows${S}1${S}Number`)).toBe(true);
    expect(visible.has(`Step1${S}FirstName`)).toBe(false);
  });

  it('is narrowed by what a path, $ query or Changed only allows', () => {
    const only = new Set(['', 'Step1', `Step1${S}FirstName`]);
    expect(formVisible(data, { only })).toBe(only);
    /* the text matches inside Rows, which `only` does not allow: nothing but the ways down that both allow is left */
    expect([...formVisible(data, { query: '5', only })].sort()).toEqual(['', 'Step1']);
    expect(formVisible(data, { query: 'a', only }).has(`Step1${S}FirstName`)).toBe(true);
  });
});

describe('visibleRows and nearestDrawn', () => {
  const rows = [{ path: 'a' }, { path: `a\u0001b` }, { path: 'c' }];

  it('keeps the rows whose path is visible, or all of them without a filter', () => {
    expect(visibleRows(rows, null)).toBe(rows);
    expect(visibleRows(rows, new Set(['c'])).map((row) => row.path)).toEqual(['c']);
  });

  it('names the nearest drawn row at or above a path', () => {
    expect(nearestDrawn(rows, `a\u0001b`)).toBe(`a\u0001b`);
    expect(nearestDrawn(rows, `a\u0001z\u0001y`)).toBe('a');
    expect(nearestDrawn(rows, 'q')).toBeNull();
  });
});
