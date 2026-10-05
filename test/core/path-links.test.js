'use strict';

import { SEP } from '../../src/core/json-tree-model.js';
import { elementSegments, dataSegments, treePathFor, ownerOf, ownerIndex } from '../../src/core/path-links.js';

const p = (...parts) => parts.join(SEP);
const data = {
  StepA: { Name: 'Ada', Rows: [{ Code: 'a' }, { Code: 'b' }] },
  StepB: { Other: 1 }
};

describe('elementSegments', () => {
  it('reads keys from the JSONPath and drops repeat-block indices', () => {
    expect(elementSegments({ jsonPath: 'StepA:Rows|2:Code', name: 'Code' }, data)).toEqual(['StepA', 'Rows', 'Code']);
  });

  it('falls back to finding the name in the data, skipping array indices', () => {
    expect(elementSegments({ jsonPath: '', name: 'Code' }, data)).toEqual(['StepA', 'Rows', 'Code']);
    expect(elementSegments({ jsonPath: '', name: 'Other' }, data)).toEqual(['StepB', 'Other']);
  });

  it('is null when the name is nowhere in the data', () => {
    expect(elementSegments({ jsonPath: '', name: 'Nope' }, data)).toBeNull();
  });
});

describe('dataSegments', () => {
  it('drops the index segments of arrays only', () => {
    expect(dataSegments(data, p('StepA', 'Rows', '1', 'Code'))).toEqual(['StepA', 'Rows', 'Code']);
    expect(dataSegments(data, '')).toEqual([]);
  });
});

describe('treePathFor', () => {
  it('finds the path, entering the first repeat of a block', () => {
    expect(treePathFor(data, ['StepA', 'Rows', 'Code'])).toEqual({
      path: p('StepA', 'Rows', '0', 'Code'), exact: true, found: true
    });
  });

  it('stops at the deepest place that exists', () => {
    expect(treePathFor(data, ['StepA', 'Missing', 'Deeper'])).toEqual({
      path: 'StepA', exact: false, found: true
    });
  });

  it('reports nothing found when even the first key is absent', () => {
    expect(treePathFor(data, ['Nope'])).toEqual({ path: '', exact: false, found: false });
  });
});

describe('ownerOf', () => {
  const elements = [
    { name: 'StepA', jsonPath: 'StepA' },
    { name: 'Rows', jsonPath: 'StepA:Rows' },
    { name: 'Code', jsonPath: 'StepA:Rows|1:Code' }
  ];

  it('finds the element for an exact path in any repeat', () => {
    expect(ownerOf(elements, data, p('StepA', 'Rows', '1', 'Code')).name).toBe('Code');
  });

  it('falls back to the nearest ancestor element', () => {
    expect(ownerOf(elements, data, p('StepA', 'Name')).name).toBe('StepA');
    expect(ownerOf(elements, data, p('StepA', 'Rows', '0')).name).toBe('Rows');
  });

  it('is null when no element owns the path', () => {
    expect(ownerOf(elements, data, p('StepB', 'Other'))).toBeNull();
    expect(ownerOf(elements, data, '')).toBeNull();
  });
});

describe('ownerIndex', () => {
  const elements = [
    { name: 'StepA', jsonPath: 'StepA' },
    { name: 'Name', jsonPath: 'StepA:Name' }
  ];
  const lookup = ownerIndex(elements, data);

  it('says whether the element is the exact owner or only the nearest one above', () => {
    expect(lookup(['StepA', 'Name'])).toEqual({ element: elements[1], exact: true });
    expect(lookup(['StepA', 'Rows', 'Code'])).toEqual({ element: elements[0], exact: false });
  });

  it('is null for keys no element covers, such as bookkeeping at the top level', () => {
    expect(lookup(['ContextId'])).toBeNull();
    expect(lookup([])).toBeNull();
  });
});
