'use strict';

import { expandControls, hasBranches, EXPAND_TITLE, COLLAPSE_TITLE } from '../../../src/core/data/expand-controls.js';

describe('expandControls', () => {
  it('are on in the Tree and the Form, with the plain titles', () => {
    ['tree', 'form'].forEach((view) => {
      expect(hasBranches(view)).toBe(true);
      expect(expandControls(view)).toEqual({ disabled: false, expandTitle: EXPAND_TITLE, collapseTitle: COLLAPSE_TITLE });
    });
  });

  it('are off in the other views, and the titles say why', () => {
    ['raw', 'sizes', 'changes'].forEach((view) => {
      const controls = expandControls(view);
      expect(hasBranches(view)).toBe(false);
      expect(controls.disabled).toBe(true);
      expect(controls.expandTitle).toBe('Expand all: Only in the Tree and the Form');
      expect(controls.collapseTitle).toBe('Collapse all: Only in the Tree and the Form');
    });
  });
});
