'use strict';

import { openedWithMouse } from '../../../src/core/shared/menu-focus.js';

describe('openedWithMouse', () => {
  it('is true for a click with a pointer and a right-click', () => {
    expect(openedWithMouse({ type: 'click', detail: 1 })).toBe(true);
    expect(openedWithMouse({ type: 'click', detail: 2 })).toBe(true);
    expect(openedWithMouse({ type: 'contextmenu', button: 2 })).toBe(true);
    expect(openedWithMouse({ type: 'mousedown' })).toBe(true);
  });

  it('is false for a click from the keyboard, the context-menu key and a bare position', () => {
    expect(openedWithMouse({ type: 'click', detail: 0 })).toBe(false);
    expect(openedWithMouse({ type: 'contextmenu', button: 0 })).toBe(false);
    expect(openedWithMouse({ type: 'keydown', key: 'Enter' })).toBe(false);
    expect(openedWithMouse({ clientX: 1, clientY: 2 })).toBe(false);
    expect(openedWithMouse(undefined)).toBe(false);
    expect(openedWithMouse(null)).toBe(false);
  });
});
