'use strict';

import { currentElement, shouldFollow } from '../../../src/core/structure/step-follow.js';

const step = (key) => ({ key, category: { key: 'step' } });
const action = (key) => ({ key, category: { key: 'action' } });

describe('currentElement', () => {
  it('prefers the current step over a current action', () => {
    const elements = [action('a'), step('s')];
    expect(currentElement(elements, { a: 'current', s: 'current' }).key).toBe('s');
  });

  it('falls back to a current action, and to null', () => {
    expect(currentElement([action('a')], { a: 'current' }).key).toBe('a');
    expect(currentElement([step('s')], { s: 'done' })).toBeNull();
    expect(currentElement([], {})).toBeNull();
  });
});

describe('shouldFollow', () => {
  const current = { key: 'two' };

  it('moves to the current step when nothing is selected', () => {
    expect(shouldFollow({ current, selectedKey: null, followedKey: null })).toBe(true);
  });

  it('moves a selection it made itself', () => {
    expect(shouldFollow({ current, selectedKey: 'one', followedKey: 'one' })).toBe(true);
  });

  it('leaves an element picked by hand, unless forced', () => {
    expect(shouldFollow({ current, selectedKey: 'x', followedKey: 'one' })).toBe(false);
    expect(shouldFollow({ current, selectedKey: 'x', followedKey: 'one', force: true })).toBe(true);
  });

  it('treats a hand pick of the followed step as a hand pick once followedKey is cleared', () => {
    expect(shouldFollow({ current, selectedKey: 'one', followedKey: null })).toBe(false);
  });

  it('does nothing when already there or when there is no current step', () => {
    expect(shouldFollow({ current, selectedKey: 'two', followedKey: 'two', force: true })).toBe(false);
    expect(shouldFollow({ current: null, selectedKey: null, followedKey: null })).toBe(false);
  });
});
