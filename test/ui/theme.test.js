'use strict';

import { jest } from '@jest/globals';
import { applyTheme } from '../../src/ui/theme.js';

describe('applyTheme', () => {
  it('forces dark or light to match DevTools', () => {
    const root = document.createElement('html');
    applyTheme(root, { themeName: 'dark' });
    expect(root.dataset.theme).toBe('dark');
    applyTheme(root, { themeName: 'default' });
    expect(root.dataset.theme).toBe('light');
  });

  it('leaves the OS preference alone when the theme is unknown or unavailable', () => {
    const root = document.createElement('html');
    root.dataset.theme = 'dark';
    applyTheme(root, { themeName: 'something-new' });
    expect(root.dataset.theme).toBeUndefined();
    expect(() => applyTheme(root, undefined)).not.toThrow();
  });

  it('follows a later change made in DevTools', () => {
    const root = document.createElement('html');
    let handler;
    applyTheme(root, { themeName: 'default', setThemeChangeHandler: (fn) => { handler = fn; } });
    handler('dark');
    expect(root.dataset.theme).toBe('dark');
  });

  it('works with a DevTools that has no change handler', () => {
    const root = document.createElement('html');
    expect(() => applyTheme(root, { themeName: 'dark', setThemeChangeHandler: jest.fn() })).not.toThrow();
  });
});
