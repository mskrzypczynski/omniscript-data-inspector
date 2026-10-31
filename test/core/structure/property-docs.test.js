'use strict';

import {
  PROPERTY_DOCS, MAX_DOC_LENGTH, propertyDoc, propertyTooltip
} from '../../../src/core/structure/property-docs.js';
import { knownPropertyKeys, propertyRows, filterPropertyRows } from '../../../src/core/structure/property-rows.js';
import { flatten } from '../../../src/core/shared/structure-model.js';

const element = (propSetMap) => flatten({
  children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: [{ name: 'Field', type: 'Text', propSetMap }] }] }]
}, null).find((e) => e.name === 'Field');

describe('propertyDoc', () => {
  it('has a doc for every key that has a readable name', () => {
    knownPropertyKeys().forEach((key) => expect({ key, doc: propertyDoc(key) !== '' }).toEqual({ key, doc: true }));
  });

  it('covers the keys an admin meets most', () => {
    ['controlWidth', 'repeat', 'repeatClone', 'repeatLimit', 'show', 'hide', 'ssm', 'validateExpression', 'mask',
      'pattern', 'ptrnErrText', 'dataJSONPath', 'optionSource', 'remoteClass', 'integrationProcedureKey',
      'sendJSONPath', 'responseJSONNode', 'enableDefaultAbort', 'chainOnStep', 'allowSave', 'autoAdvance',
      'lwcComponentOverride', 'rpAddLabel', 'accessibleInFutureSteps', 'aggregate', 'index'
    ].forEach((key) => expect({ key, doc: propertyDoc(key) !== '' }).toEqual({ key, doc: true }));
  });

  it('keeps each doc short and not empty', () => {
    PROPERTY_DOCS.forEach((doc, key) => {
      expect({ key, tooLong: doc.length > MAX_DOC_LENGTH }).toEqual({ key, tooLong: false });
      expect({ key, empty: doc.trim() === '' }).toEqual({ key, empty: false });
    });
  });

  it('is empty for a key it does not know, and does not mistake a prototype name for one', () => {
    expect(propertyDoc('somethingNew')).toBe('');
    expect(propertyDoc('constructor')).toBe('');
    expect(propertyDoc('toString')).toBe('');
  });

  it('says so where it is not sure', () => {
    expect(propertyDoc('disOnTplt')).toContain('as far as the panel knows');
  });
});

describe('propertyTooltip', () => {
  it('leads with the key when the panel shows a friendlier name', () => {
    expect(propertyTooltip('controlWidth', 'Width')).toBe(`controlWidth: ${propertyDoc('controlWidth')}`);
  });

  it('is just the doc when the name is the key, and just the key when nothing is known', () => {
    expect(propertyTooltip('pattern', 'pattern')).toBe(propertyDoc('pattern'));
    expect(propertyTooltip('zeta', 'zeta')).toBe('');
    expect(propertyTooltip('zeta', 'Zeta')).toBe('zeta');
  });
});

describe('rows carry their doc, and the filter reads it', () => {
  it('puts the doc on a known row and leaves an unknown one without', () => {
    const { rows } = propertyRows(element({ controlWidth: 6, zeta: 'x' }));
    expect(rows.find((row) => row.key === 'controlWidth').doc).toBe(propertyDoc('controlWidth'));
    expect(rows.find((row) => row.key === 'zeta').doc).toBe('');
  });

  it('finds a row by a word from its doc', () => {
    const { rows } = propertyRows(element({ repeatClone: true, mask: '999', zeta: 'x' }));
    expect(filterPropertyRows(rows, 'phone').map((row) => row.key)).toEqual(['mask']);
    expect(filterPropertyRows(rows, 'previous').map((row) => row.key)).toEqual(['repeatClone']);
  });

  it('reads the docs only when no name or value matches', () => {
    const { rows } = propertyRows(element({ label: 'Customer name', bundle: 'GetCustomer' }));
    // "name" is in the doc of bundle too, but the label matches directly.
    expect(filterPropertyRows(rows, 'name').map((row) => row.key)).toEqual(['label']);
    expect(filterPropertyRows(rows, 'mapper').map((row) => row.key)).toEqual(['bundle']);
  });

  it('still needs every word to match', () => {
    const { rows } = propertyRows(element({ mask: '999', repeatClone: true }));
    expect(filterPropertyRows(rows, 'phone previous')).toEqual([]);
  });

  it('finds controlWidth by typing a word from its doc', () => {
    const { rows } = propertyRows(element({ controlWidth: 6, label: 'Name' }));
    expect(filterPropertyRows(rows, 'columns').map((row) => row.key)).toEqual(['controlWidth']);
    expect(filterPropertyRows(rows, 'width').map((row) => row.key)).toEqual(['controlWidth']);
  });
});

describe('the validationRequired doc', () => {
  it('says when the check runs, as the Validation tab does, not which messages block', () => {
    const doc = propertyDoc('validationRequired');
    expect(doc).toMatch(/when the check runs/i);
    expect(doc).toMatch(/moves between steps/);
    expect(doc).toMatch(/as far as the panel knows/);
  });
});
