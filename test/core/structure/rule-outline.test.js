'use strict';

import { ruleSummary } from '../../../src/core/structure/rule-outline.js';

describe('ruleSummary', () => {
  it('reads a group on one line', () => {
    const group = { operator: 'AND', rules: [{ field: 'A:B', condition: '>', data: 18 }, { field: 'A:C', condition: '=', data: 'x' }] };
    expect(ruleSummary(group)).toBe('A:B > 18 AND A:C = "x"');
  });

  it('keeps a text expression as it is, on one line', () => {
    expect(ruleSummary('  =Age  >\n 3 ')).toBe('=Age > 3');
  });

  it('is empty for nothing', () => {
    expect(ruleSummary(null)).toBe('');
  });
});
