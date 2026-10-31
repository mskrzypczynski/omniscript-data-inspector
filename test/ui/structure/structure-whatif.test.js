'use strict';

/* What if: trying another value in the Is now cell of the conditions of a
 * Visibility or Validation card. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Kind' },
  { name: 'Age', type: 'Number' },
  { name: 'Company', propSetMap: { show: { group: { operator: 'AND', rules: [
    { field: 'Intro:Age', condition: '>', data: '18' },
    { group: { operator: 'OR', rules: [
      { field: 'Intro:Kind', condition: '=', data: 'Business' },
      { field: 'Intro:Kind', condition: '=', data: 'Trust' }
    ] } }
  ] } } } },
  { name: 'Other', propSetMap: { show: { group: { operator: 'AND', rules: [
    { field: 'Intro:Kind', condition: '=', data: 'Person' }
  ] } } } },
  { name: 'Warn', type: 'Set Errors', propSetMap: {
    elementErrorMap: { Age: 'Too young' },
    show: { group: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: '18' }] } }
  } }
] }];

const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const cells = () => [...document.querySelectorAll('.fc-cond .whatif-cell')];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('What if', () => {
  it('stays off when the data cannot be read', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: 'not json' }] });
    clickRow('Company');
    tabButton('Visibility').click();
    expect(cells()).toHaveLength(0);
  });
});
