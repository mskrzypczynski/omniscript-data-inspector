'use strict';

import { DEFAULT_ORDER, formatOrder, parseOrder, moveTab } from '../../../src/core/shared/tab-order.js';

describe('tab order', () => {
  it('formats the order as the tab labels', () => {
    expect(formatOrder(DEFAULT_ORDER)).toBe('Data, Structure, Calls');
  });

  it('parses a saved order, case and spaces aside', () => {
    expect(parseOrder('calls,  data, STRUCTURE')).toEqual(['actions', 'data', 'structure']);
  });

  it('reads an order saved while the tab was called Remote actions', () => {
    expect(parseOrder('remote actions,  data, STRUCTURE')).toEqual(['actions', 'data', 'structure']);
    expect(parseOrder('Data, Structure, Remote actions')).toEqual(DEFAULT_ORDER);
  });

  it('drops unknown and repeated names and adds the tabs it does not name at the end', () => {
    expect(parseOrder('Structure, Nope, Structure, Data')).toEqual(['structure', 'data', 'actions']);
    expect(parseOrder('')).toEqual(DEFAULT_ORDER);
    expect(parseOrder(null)).toEqual(DEFAULT_ORDER);
  });

  it('drops Replay from an order saved while it was a tab', () => {
    expect(parseOrder('Data, Replay, Structure, Calls')).toEqual(['data', 'structure', 'actions']);
  });

  it('moves a tab to a position, clamping it to the ends', () => {
    expect(moveTab(DEFAULT_ORDER, 'actions', 0)).toEqual(['actions', 'data', 'structure']);
    expect(moveTab(DEFAULT_ORDER, 'data', 1)).toEqual(['structure', 'data', 'actions']);
    expect(moveTab(DEFAULT_ORDER, 'data', 99)).toEqual(['structure', 'actions', 'data']);
    expect(moveTab(DEFAULT_ORDER, 'nope', 0)).toEqual(DEFAULT_ORDER);
  });
});
