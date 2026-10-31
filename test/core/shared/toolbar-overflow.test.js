'use strict';

import { NARROW_BELOW, isNarrow, overflowItemLabel } from '../../../src/core/shared/toolbar-overflow.js';

describe('isNarrow', () => {
  it('is narrow under 600 px and not from 600 up', () => {
    expect(NARROW_BELOW).toBe(600);
    expect(isNarrow(599)).toBe(true);
    expect(isNarrow(340)).toBe(true);
    expect(isNarrow(600)).toBe(false);
    expect(isNarrow(1280)).toBe(false);
  });

  it('does not call an unmeasured panel narrow', () => {
    expect(isNarrow(0)).toBe(false);
    expect(isNarrow(-5)).toBe(false);
    expect(isNarrow(undefined)).toBe(false);
    expect(isNarrow(NaN)).toBe(false);
    expect(isNarrow('300')).toBe(false);
  });
});

describe('overflowItemLabel', () => {
  it('is the bare name for a button', () => {
    expect(overflowItemLabel('Copy JSON')).toBe('Copy JSON');
    expect(overflowItemLabel('  Save   file ')).toBe('Save file');
  });

  it('says on or off for a toggle', () => {
    expect(overflowItemLabel('Track changes', true)).toBe('Track changes: on');
    expect(overflowItemLabel('Track changes', false)).toBe('Track changes: off');
  });

  it('copes with a missing name', () => {
    expect(overflowItemLabel(undefined)).toBe('');
  });
});
