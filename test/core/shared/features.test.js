'use strict';

import { GATES, createFeatureRegistry, gatesOf, isGate } from '../../../src/core/shared/features.js';

describe('the gates', () => {
  it('have unique names, a tab and a label each', () => {
    const names = GATES.map((gate) => gate.name);
    expect(new Set(names).size).toBe(names.length);
    GATES.forEach((gate) => {
      expect(['common', 'data', 'structure', 'actions']).toContain(gate.tab);
      expect(gate.label.length).toBeGreaterThan(2);
      expect(gate.name.startsWith(gate.tab === 'common' ? 'shell.' : gate.tab === 'actions' ? 'calls.' : `${gate.tab}.`)).toBe(true);
    });
  });

  it('are known by name and listed per tab', () => {
    expect(isGate('calls.test')).toBe(true);
    expect(isGate('calls.teapot')).toBe(false);
    expect(gatesOf('data').map((gate) => gate.name)).toEqual(['data.changes', 'data.compare', 'data.watch', 'data.sizes', 'data.query']);
    expect(gatesOf('common').every((gate) => gate.name.startsWith('shell.'))).toBe(true);
  });

  it('name Formulas nowhere: the Formula card and its help are Free', () => {
    expect(GATES.find((gate) => gate.name === 'structure.references').label).toBe('Depends on / Used by / Written by, Actions only');
  });

  it('cannot be edited', () => {
    expect(() => { GATES[0].name = 'x'; }).toThrow();
    expect(() => { GATES.push({}); }).toThrow();
  });
});

describe('a feature registry', () => {
  it('starts empty: nothing is carried, nothing is on', () => {
    const features = createFeatureRegistry();
    expect(features.has('calls.test')).toBe(false);
    expect(features.on('calls.test')).toBe(false);
    expect(features.registered()).toEqual([]);
    expect(features.mount('data', {})).toBe(0);
    expect(features.help('data')).toEqual([]);
  });

  it('carries what is registered, with or without a module', () => {
    const features = createFeatureRegistry();
    features.register('calls.test');
    features.register('data.sizes', { mount: {} });
    expect(features.has('calls.test')).toBe(true);
    expect(features.on('calls.test')).toBe(true);
    expect(features.has('data.changes')).toBe(false);
    expect(features.registered()).toEqual(['calls.test', 'data.sizes']);
  });

  it('refuses a gate that does not exist and names the gates', () => {
    const features = createFeatureRegistry();
    expect(() => features.register('calls.teapot')).toThrow(/Unknown feature gate "calls.teapot".*calls\.test/);
    expect(features.registered()).toEqual([]);
  });

  it('mounts every module that offers the point, in registration order, with the context', () => {
    const features = createFeatureRegistry();
    const calls = [];
    features.register('calls.test', { mount: { actions: (context) => calls.push(['test', context]) } });
    features.register('calls.debug', { mount: { actions: (context) => calls.push(['debug', context]), data: () => calls.push(['debug-data']) } });
    features.register('data.sizes', { mount: { data: () => calls.push(['sizes']) } });
    const context = { list: 'the list' };
    expect(features.mount('actions', context)).toBe(2);
    expect(calls).toEqual([['test', context], ['debug', context]]);
    expect(features.mount('data', {})).toBe(2);
    expect(calls.slice(2)).toEqual([['debug-data'], ['sizes']]);
    expect(features.mount('structure', {})).toBe(0);
  });

  it('collects the help entries per tab', () => {
    const features = createFeatureRegistry();
    features.register('calls.test', { help: { actions: [['Test calls', 'Run a call…']] } });
    features.register('calls.debug', { help: { actions: [['Debug tab', 'A debug run…']], common: [['Debug bundle', '…']] } });
    expect(features.help('actions').map(([title]) => title)).toEqual(['Test calls', 'Debug tab']);
    expect(features.help('common').map(([title]) => title)).toEqual(['Debug bundle']);
    expect(features.help('data')).toEqual([]);
  });

  it('keeps has() while locked and turns on() off, until unlocked', () => {
    const features = createFeatureRegistry();
    features.register('calls.test');
    features.lock();
    expect(features.locked()).toBe(true);
    expect(features.has('calls.test')).toBe(true);
    expect(features.on('calls.test')).toBe(false);
    features.unlock();
    expect(features.on('calls.test')).toBe(true);
  });
});
