'use strict';

import { statusLeft, statusTitle, stepPosition } from '../../../src/core/structure/status-text.js';

const step = (key, name, label = '') => ({ key, name, label, category: { key: 'step' } });
const field = (key, name) => ({ key, name, label: '', category: { key: 'input' } });

describe('stepPosition', () => {
  const elements = [step('a', 'Intro'), field('f', 'Name'), step('b', 'PlanSelection', 'Plan Selection'), step('c', 'Review')];

  it('numbers the current step among the steps only, and prefers its label', () => {
    expect(stepPosition(elements, elements[2])).toEqual({ name: 'Plan Selection', number: 2, of: 3 });
    expect(stepPosition(elements, elements[0])).toEqual({ name: 'Intro', number: 1, of: 3 });
  });

  it('is null when no step is current', () => {
    expect(stepPosition(elements, null)).toBeNull();
    expect(stepPosition(elements, field('z', 'Other'))).toBeNull();
  });
});

describe('statusLeft', () => {
  it('reads as plain words, with the step first', () => {
    expect(statusLeft({ total: 22, shown: 22, hidden: 2, step: { name: 'Plan Selection', number: 4, of: 5 } }))
      .toBe('Plan Selection (step 4 of 5) · 22 elements · 2 hidden');
  });

  it('leaves out what is zero or unknown', () => {
    expect(statusLeft({ total: 22, shown: 22, hidden: 0, step: null })).toBe('22 elements');
    expect(statusLeft({ total: 1, shown: 1, hidden: 0, step: null })).toBe('1 element');
  });

  it('says how many a filter lets through', () => {
    expect(statusLeft({ total: 22, shown: 5, hidden: 0, step: null })).toBe('5 of 22 elements');
  });

  it('says so when there is no definition, and never names a property', () => {
    expect(statusLeft({ total: 0, shown: 0, hidden: 0, step: null })).toBe('No definition loaded');
    const line = statusLeft({ total: 3, shown: 3, hidden: 1, step: { name: 'A', number: 1, of: 1 } });
    expect(line).not.toMatch(/jsonDef|asIndex|by rules/);
  });
});

describe('statusTitle', () => {
  it('keeps the property names for the tooltip', () => {
    const text = statusTitle({ defProp: 'jsonDef', activeIndex: 3, hidden: 2 });
    expect(text).toContain('jsonDef');
    expect(text).toContain('asIndex (3)');
    expect(text).toContain('Hidden:');
  });

  it('says when the definition did not name the step', () => {
    expect(statusTitle({ defProp: 'jsonDef', activeIndex: null, hidden: 0 })).toContain('did not say which step');
  });
});
