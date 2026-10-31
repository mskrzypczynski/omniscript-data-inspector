'use strict';

import { tagVariant, tagClasses } from '../../../src/core/shared/tag-tone.js';

describe('tagVariant', () => {
  it.each([
    ['good', 'ok'], ['ok', 'ok'], ['bad', 'error'], ['error', 'error'], ['strong', 'error'],
    ['warn', 'warn'], ['estimated', 'warn'], ['info', 'info'], ['neutral', 'neutral']
  ])('%s draws as %s', (tone, variant) => {
    expect(tagVariant(tone)).toBe(variant);
  });

  it('draws an unknown, empty or inherited tone as neutral', () => {
    ['', undefined, null, 'purple', 'constructor', 'toString'].forEach((tone) => expect(tagVariant(tone)).toBe('neutral'));
  });
});

describe('tagClasses', () => {
  it('names the box and the variant', () => {
    expect(tagClasses('good')).toBe('tag tag-ok');
    expect(tagClasses('bad')).toBe('tag tag-error');
    expect(tagClasses('whatever')).toBe('tag tag-neutral');
  });
});

describe('the call types', () => {
  it('draw as one tone each: IP, DR and RA differ, and Apex shares the violet of RA', () => {
    expect(['ip', 'dr', 'ra'].map(tagVariant)).toEqual(['type-ip', 'type-dr', 'type-ra']);
    expect(new Set(['ip', 'dr', 'ra'].map(tagVariant)).size).toBe(3);
    expect(tagVariant('apex')).toBe('type-ra');
    expect(tagClasses('ip')).toBe('tag tag-type-ip');
  });
});
