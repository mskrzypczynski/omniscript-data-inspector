'use strict';

import { stepNavigation, navNote, headNavButton, NAV_TITLE, MAX_HOPS } from '../../../src/core/structure/step-nav.js';

const step = (name, depth = 0, key = name) => ({ key, name, depth, category: { key: 'step' } });
const field = (name) => ({ key: name, name, depth: 1, category: { key: 'input' } });
const elements = [step('A'), field('a1'), step('B'), field('b1'), step('C'), step('D'), step('E')];

const nav = (targetKey, currentKey, progress = {}) => stepNavigation({ elements, progress, currentKey, targetKey });

describe('which rows can send the script back, and how far', () => {
  it('offers Go back on page on the current step, one hop', () => {
    expect(nav('C', 'C')).toEqual({ id: 'previous-step', label: 'Go back on page', hops: 1 });
  });

  it('offers Go to this step on an earlier step, with the hops it takes', () => {
    expect(nav('B', 'C')).toEqual({ id: 'go-to-step', label: 'Go to this step on page', hops: 1 });
    expect(nav('A', 'D')).toEqual({ id: 'go-to-step', label: 'Go to this step on page', hops: 3 });
  });

  it('does not offer a later step, or Go to this step on the current one', () => {
    expect(nav('E', 'C')).toBeNull();
    expect(nav('D', 'C')).toBeNull();
    expect(nav('C', 'C').id).toBe('previous-step');
  });

  it('does not offer anything on the first step, which has nothing before it', () => {
    expect(nav('A', 'A')).toBeNull();
  });

  it('does not offer a row that is not a top-level step', () => {
    expect(nav('b1', 'C')).toBeNull();
    expect(nav('nope', 'C')).toBeNull();
  });

  it('does not offer anything when the script is not on a step', () => {
    expect(nav('A', 'nope')).toBeNull();
    expect(nav('A', 'b1')).toBeNull();
  });

  it('skips the steps the script passed without running: they are no stop on the way back', () => {
    expect(nav('A', 'D', { B: 'skipped' })).toEqual({ id: 'go-to-step', label: 'Go to this step on page', hops: 2 });
    expect(nav('B', 'D', { B: 'skipped' })).toBeNull();
    expect(nav('C', 'C', { A: 'skipped', B: 'skipped' })).toBeNull();
    expect(nav('C', 'C', { B: 'skipped' })).toEqual({ id: 'previous-step', label: 'Go back on page', hops: 1 });
  });

  it('does not offer a trip longer than the cap', () => {
    const many = Array.from({ length: MAX_HOPS + 3 }, (_, i) => step(`S${i}`));
    const last = many[many.length - 1].key;
    expect(stepNavigation({ elements: many, currentKey: last, targetKey: 'S0' })).toBeNull();
    expect(stepNavigation({ elements: many, currentKey: last, targetKey: 'S2' }).hops).toBe(MAX_HOPS);
  });
});

describe('the status bar note', () => {
  it('says what was asked, or that the script refused', () => {
    expect(navNote('button', 1)).toBe('Asked the script to go back 1 step');
    expect(navNote('event', 3)).toBe('Asked the script to go back 3 steps');
    expect(navNote('none', 2)).toBe('Could not go back: the script has no Previous button and ignored the request.');
  });
});

describe('headNavButton', () => {
  const navigation = { id: 'previous-step', label: 'Go back on page', hops: 1 };

  it('offers the menu item as a button with a back arrow', () => {
    expect(headNavButton({ navigation })).toEqual({
      id: 'previous-step', label: 'Go back on page', title: NAV_TITLE, icon: 'external'
    });
  });

  it('is null when the row offers nothing', () => {
    expect(headNavButton({ navigation: null })).toBeNull();
  });

  it('keeps the label of a passed step', () => {
    expect(headNavButton({ navigation: { id: 'go-to-step', label: 'Go to this step on page', hops: 2 } }).label)
      .toBe('Go to this step on page');
  });
});
