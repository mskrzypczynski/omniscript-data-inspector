'use strict';

import { detailTabs, defaultTab, usableTab, pickAfterSelection } from '../../../src/core/structure/detail-tabs.js';

const element = (extra = {}) => ({ category: { key: 'input' }, conditional: false, isSetValues: false, validation: null, remote: '', ...extra });
const tabsOf = (extra, args = {}) => detailTabs({ element: element(extra), propsCount: 2, ...args });

describe('the tab an element opens on', () => {
  it('is Current value when the element has a value', () => {
    expect(defaultTab(tabsOf({}, { value: 'x' }))).toBe('value');
    expect(defaultTab(tabsOf({ conditional: true }, { value: 'x' }), { conditional: true })).toBe('value');
  });

  it('is Validation for the step the script is on, before its own value', () => {
    const step = { category: { key: 'step' } };
    const tabs = tabsOf(step, { stopCount: 1 });
    expect(defaultTab(tabs, { isCurrentStep: true })).toBe('validation');
    expect(defaultTab(tabs, { isCurrentStep: false })).toBe('props');
    expect(defaultTab(tabsOf(step, { stopCount: 1 }), { isCurrentStep: true })).toBe('validation');
    expect(defaultTab(tabsOf(step, { stopCount: 1, value: {} }), { isCurrentStep: true })).toBe('validation');
    expect(defaultTab(tabsOf(step, { stopCount: 1, value: {} }), { isCurrentStep: false })).toBe('value');
  });

  it('is Visibility for an element with a rule of its own and no value', () => {
    expect(defaultTab(tabsOf({ conditional: true }), { conditional: true })).toBe('conditions');
  });

  it('is not Visibility for an element that is only used by others', () => {
    const tabs = tabsOf({}, { usedByCount: 2 });
    expect(tabs.map((tab) => tab.id)).toContain('conditions');
    expect(defaultTab(tabs, { conditional: false })).toBe('props');
  });

  it('is Properties otherwise', () => {
    expect(defaultTab(tabsOf({}))).toBe('props');
  });

  it('is never Definition while another tab exists', () => {
    ['value', 'props', 'conditions', 'validation', 'calls'].forEach((without) => {
      const tabs = tabsOf({ conditional: true, remote: 'X', validation: { has: true } }, { value: 1, callsCount: 1 })
        .filter((tab) => tab.id !== without);
      expect(defaultTab(tabs, { conditional: true, isCurrentStep: true })).not.toBe('definition');
    });
  });

  it('is Definition only when it is all there is', () => {
    expect(defaultTab(detailTabs({ element: element() }))).toBe('definition');
  });
});

describe('usableTab', () => {
  it('keeps a tab asked for that exists, Definition included', () => {
    const tabs = tabsOf({}, { value: 'x' });
    expect(usableTab(tabs, 'definition')).toBe('definition');
    expect(usableTab(tabs, 'props')).toBe('props');
  });

  it('falls back to the default when the tab asked for is not there', () => {
    const tabs = tabsOf({ conditional: true });
    expect(usableTab(tabs, 'value', { conditional: true })).toBe('conditions');
    expect(usableTab(tabs, 'calls', { conditional: false })).toBe('props');
  });
});

describe('what a hand pick becomes on a new selection', () => {
  it('stays, except Definition', () => {
    expect(pickAfterSelection('conditions')).toBe('conditions');
    expect(pickAfterSelection('validation')).toBe('validation');
    expect(pickAfterSelection('definition')).toBeNull();
    expect(pickAfterSelection(null)).toBeNull();
    expect(pickAfterSelection(undefined)).toBeNull();
  });

  it('lets an element without the picked tab show its default while the pick is kept', () => {
    const without = tabsOf({}, { value: 'x' });
    expect(usableTab(without, 'conditions', {})).toBe('value');
    const withIt = tabsOf({ conditional: true }, { value: 'x' });
    expect(usableTab(withIt, 'conditions', {})).toBe('conditions');
  });
});
