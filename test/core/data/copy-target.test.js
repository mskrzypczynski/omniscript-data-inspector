'use strict';

import { copyTarget } from '../../../src/core/data/copy-target.js';
import { JUMP_FLASH_MS } from '../../../src/core/shared/flash.js';

const NOW = 100000;

describe('copyTarget', () => {
  it('prefers the row with keyboard focus, then the one under the pointer', () => {
    expect(copyTarget({ focused: 'a', hovered: 'b', jumped: 'c', jumpedAt: NOW - 10, now: NOW })).toEqual({ path: 'a', from: 'focus' });
    expect(copyTarget({ hovered: 'b', jumped: 'c', jumpedAt: NOW - 10, now: NOW })).toEqual({ path: 'b', from: 'pointer' });
    expect(copyTarget({ focused: undefined, hovered: null, jumped: 'c', jumpedAt: NOW - 10, now: NOW })).toEqual({ path: 'c', from: 'jump' });
  });

  it('takes the root, whose path is empty, as a row', () => {
    expect(copyTarget({ focused: '', now: NOW })).toEqual({ path: '', from: 'focus' });
    expect(copyTarget({ hovered: '', now: NOW })).toEqual({ path: '', from: 'pointer' });
  });

  it('copies the jumped row only while its flash shows', () => {
    expect(copyTarget({ jumped: 'c', jumpedAt: NOW - (JUMP_FLASH_MS - 1), now: NOW })).toEqual({ path: 'c', from: 'jump' });
    expect(copyTarget({ jumped: 'c', jumpedAt: NOW - JUMP_FLASH_MS, now: NOW })).toBeNull();
    expect(copyTarget({ jumped: 'c', jumpedAt: NOW - 60000, now: NOW })).toBeNull();
  });

  it('has nothing when there is no jump, or the jump was cleared', () => {
    expect(copyTarget({ now: NOW })).toBeNull();
    expect(copyTarget({ jumped: null, jumpedAt: 0, now: NOW })).toBeNull();
    expect(copyTarget({ jumped: 'c', jumpedAt: 0, now: NOW })).toBeNull();
  });
});
