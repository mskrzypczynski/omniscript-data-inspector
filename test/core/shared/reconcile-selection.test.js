'use strict';

import { reconcileSelection } from '../../../src/core/shared/targets-model.js';

const host = (label, key, extra = {}) => ({ label, key, frame: '', top: true, dataLen: 1, defLen: 1, ...extra });

describe('reconcileSelection', () => {
  it('keeps the same host selected where it moved to, without a loss', () => {
    const before = [host('c-a', 'A/x/E'), host('c-b', 'B/x/E')];
    const after = [host('c-new', 'N/x/E'), host('c-a', 'A/x/E'), host('c-b', 'B/x/E')];
    expect(reconcileSelection(before, 1, after)).toEqual({ index: 2, lost: false });
  });

  it('reports a loss when the selected script is gone and another is picked', () => {
    const before = [host('c-a', 'A/x/E'), host('c-b', 'B/x/E')];
    const after = [host('c-b', 'B/x/E')];
    expect(reconcileSelection(before, 0, after)).toEqual({ index: 0, lost: true });
  });

  it('is not a loss when nothing was selected before or nothing is listed now', () => {
    expect(reconcileSelection([], 0, [host('c-a', 'A/x/E')])).toEqual({ index: 0, lost: false });
    expect(reconcileSelection([host('c-a', 'A/x/E')], 0, [])).toEqual({ index: 0, lost: false });
  });

  it('moves to the listed host of the same script when embedded scripts are hidden, without a loss', () => {
    const before = [host('c-main', 'A/x/E', { dataLen: 5 }), host('c-dup', 'A/x/E', { dataLen: 1 })];
    const after = [host('c-dup', 'A/x/E', { dataLen: 9 }), host('c-main', 'A/x/E', { dataLen: 5 })];
    const picked = reconcileSelection(before, 1, after, { showNested: false });
    expect(picked.lost).toBe(false);
    expect(after[picked.index].key).toBe('A/x/E');
  });

  it('keeps one of two scripts that share an element name', () => {
    const scan = [host('c-os', 'Quote/New/English'), host('c-os', 'Case/Edit/English')];
    expect(reconcileSelection(scan, 1, scan.slice())).toEqual({ index: 1, lost: false });
  });

  it('never selects a hidden nested host while embedded scripts are off', () => {
    const before = [host('c-a', 'A/x/E'), host('c-n', '', { top: false })];
    const after = [host('c-n', '', { top: false }), host('c-b', 'B/x/E')];
    const picked = reconcileSelection(before, 0, after, { showNested: false });
    expect(after[picked.index].label).toBe('c-b');
    expect(picked.lost).toBe(true);
  });
});
