'use strict';

import { agoText, sinceStepReason } from '../../../src/core/data/compare-text.js';


describe('agoText', () => {
  it('reads like a clock a person would use', () => {
    expect(agoText(0)).toBe('just now');
    expect(agoText(1400)).toBe('just now');
    expect(agoText(12000)).toBe('12 s ago');
    expect(agoText(59000)).toBe('59 s ago');
    expect(agoText(60000)).toBe('1 min ago');
    expect(agoText(5 * 60000 + 20000)).toBe('5 min ago');
    expect(agoText(3600000)).toBe('1 h ago');
    expect(agoText(3 * 3600000 + 600000)).toBe('3 h ago');
  });

  it('never goes negative when a clock is a little off', () => {
    expect(agoText(-5000)).toBe('just now');
  });
});

describe('sinceStepReason', () => {
  it('asks for the step when it is not known', () => {
    expect(sinceStepReason(null)).toMatch(/Step not known yet/);
    expect(sinceStepReason({ name: 'Step2', visitFrom: null })).toMatch(/Step not known yet/);
  });

  it('asks for two reads in the step when it is known', () => {
    expect(sinceStepReason({ name: 'Step2', visitFrom: 1000 })).toBe('Needs two different reads since the script entered Step2');
  });
});
