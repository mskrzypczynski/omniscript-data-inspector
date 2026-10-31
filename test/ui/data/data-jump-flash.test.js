'use strict';

/* A jump to a row (Show in Data, a watched value, Prev / Next change) scrolls to
 * it and flashes it; once the flash is over nothing marks the row, so a row
 * arrived at from another tab looks like any other. */

import fs from 'fs';
import { jest } from '@jest/globals';
import { JUMP_FLASH_MS } from '../../../src/core/shared/flash.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

describe('arriving at a row from a jump', () => {
  it('has no outline or fill for the row beyond the flash itself', () => {
    const css = fs.readFileSync('panel.css', 'utf8');
    expect(css).not.toMatch(/\.row\.is-focus\s*\{/);
    expect(css).toMatch(/\.row\.is-jumped\s*\{\s*animation:\s*flash\s+1\.8s/);
    expect(JUMP_FLASH_MS).toBe(1800);
  });
});
