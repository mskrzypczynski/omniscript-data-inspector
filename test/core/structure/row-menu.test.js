'use strict';

import { elementPathText, branchSections, rowMenuItems } from '../../../src/core/structure/row-menu.js';

const el = (key, parentKey, name, extra = {}) => ({ key, parentKey, name, hasChildren: false, jsonPath: '', ...extra });
const elements = [
  el('s', '', 'Intro', { hasChildren: true }),
  el('b', 's', 'Rows', { hasChildren: true }),
  el('q', 'b', 'Qty', { jsonPath: 'Intro:Rows|1:Qty' }),
  el('n', 'b', 'Note'),
  el('g', 's', 'Group', { hasChildren: true }),
  el('h', 'g', 'Deep'),
  el('t', '', 'Other', { hasChildren: true }),
  el('u', 't', 'Elsewhere')
];
const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));
const byName = (name) => elements.find((element) => element.name === name);

describe('elementPathText', () => {
  it('is the JSONPath the definition gives, with its repeat position', () => {
    expect(elementPathText(byName('Qty'), byKey)).toBe('Intro:Rows|1:Qty');
  });

  it('is the names from the step down when the definition gives none', () => {
    expect(elementPathText(byName('Note'), byKey)).toBe('Intro:Rows:Note');
    expect(elementPathText(byName('Intro'), byKey)).toBe('Intro');
  });
});

describe('branchSections', () => {
  it('lists the section itself and every section inside it, at any depth', () => {
    expect(branchSections(byName('Intro'), elements)).toEqual(['s', 'b', 'g']);
    expect(branchSections(byName('Rows'), elements)).toEqual(['b']);
  });

  it('is empty for an element that holds nothing', () => {
    expect(branchSections(byName('Qty'), elements)).toEqual([]);
  });

  it('leaves out sections that are not inside it', () => {
    expect(branchSections(byName('Group'), elements)).toEqual(['g']);
  });
});

describe('rowMenuItems', () => {
  const ids = (items) => items.filter((item) => item !== '-').map((item) => item.id);

  it('offers copy, show in data and select for a plain element', () => {
    expect(ids(rowMenuItems({ element: byName('Qty'), folded: false, hasPlace: true })))
      .toEqual(['copy-name', 'copy-path', 'show-in-data', 'highlight', 'select']);
  });

  it('offers to collapse an open section and to expand a folded one, never for a plain element', () => {
    expect(ids(rowMenuItems({ element: byName('Rows'), folded: false, hasPlace: true }))).toContain('collapse-branch');
    expect(ids(rowMenuItems({ element: byName('Rows'), folded: true, hasPlace: true }))).toContain('expand-branch');
    const plain = ids(rowMenuItems({ element: byName('Qty'), folded: false, hasPlace: true }));
    expect(plain).not.toContain('collapse-branch');
    expect(plain).not.toContain('expand-branch');
  });

  it('offers Highlight on page for a field, step or block but not for an action or a validation', () => {
    const withCategory = (key) => ({ ...byName('Qty'), category: { key } });
    const has = (key) => ids(rowMenuItems({ element: withCategory(key), folded: false, hasPlace: true })).includes('highlight');
    ['input', 'choice', 'step', 'block', 'display', 'custom'].forEach((key) => expect(has(key)).toBe(true));
    ['action', 'error'].forEach((key) => expect(has(key)).toBe(false));
  });

  it('greys Show in Data when the element has no place in the data', () => {
    const items = rowMenuItems({ element: byName('Qty'), folded: false, hasPlace: false });
    expect(items.find((item) => item.id === 'show-in-data').disabled).toBe(true);
  });

  it('writes the labels in plain words', () => {
    const labels = rowMenuItems({ element: byName('Rows'), folded: false, hasPlace: true })
      .filter((item) => item !== '-').map((item) => item.label);
    expect(labels).toEqual([
      'Copy name', 'Copy OmniScript path', 'Show in Data', 'Highlight on page', 'Collapse this branch', 'Select this row'
    ]);
  });
});
