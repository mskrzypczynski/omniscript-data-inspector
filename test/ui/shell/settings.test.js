'use strict';

/* settings.js: an in-memory store. Nothing may reach browser storage. */

import { jest } from '@jest/globals';

describe('Settings', () => {
  let Settings;
  let DEFAULTS;
  // Values live in module state: start each test with a fresh module.
  beforeEach(async () => {
    jest.resetModules();
    ({ Settings, DEFAULTS } = await import('../../../src/ui/settings.js'));
  });

  it('returns the default until something is set', () => {
    expect(Settings.get('dataView')).toBe('tree');
    expect(DEFAULTS.dataLive).toBeUndefined();
    expect(Settings.get('whatever', 7)).toBe(7);
  });

  it('has Remember my settings on by default and no Profile setting any more', () => {
    expect(DEFAULTS.rememberSettings).toBe(true);
    expect(Settings.get('rememberSettings')).toBe(true);
    expect('profile' in DEFAULTS).toBe(false);
  });

  it('keeps Remember my settings on when Restore default settings runs, and puts the rest back', () => {
    Settings.set('dataView', 'raw');
    Settings.reset();
    expect(Settings.get('rememberSettings')).toBe(true);
    expect(Settings.get('dataView')).toBe('tree');
  });

  it('keeps a Remember my settings that was turned off, off, through Restore default settings', () => {
    Settings.set('rememberSettings', false);
    Settings.reset();
    expect(Settings.get('rememberSettings')).toBe(false);
  });

  it('returns what was set', () => {
    Settings.set('dataView', 'raw');
    Settings.set('logSlowMs', 250);
    expect(Settings.get('dataView')).toBe('raw');
    expect(Settings.get('logSlowMs')).toBe(250);
  });

  it('ignores a value of the wrong type', () => {
    Settings.set('dataView', 5);
    expect(Settings.get('dataView')).toBe(DEFAULTS.dataView);
  });

  it('never touches browser storage', () => {
    const touched = jest.fn();
    const trap = { get: touched, configurable: true };
    Object.defineProperty(window, 'localStorage', trap);
    Object.defineProperty(window, 'sessionStorage', trap);
    try {
      Settings.set('advanced', true);
      Settings.get('advanced');
      Settings.reset();
      Settings.resetKey('dataView');
      expect(touched).not.toHaveBeenCalled();
    } finally {
      delete window.localStorage;
      delete window.sessionStorage;
    }
  });

  it('does not define a default for anything it must not hold', () => {
    const names = Object.keys(DEFAULTS).join(' ').toLowerCase();
    // Mask values at start is a flag about where the switch starts; the switch itself is never held.
    expect(names.replace('maskatstart', '')).not.toMatch(/mask|filter|pin|search|tip/);
  });

  describe('reset', () => {
    it('puts everything back but keeps Remember my settings', () => {
      Settings.set('dataView', 'raw');
      Settings.set('rememberSettings', true);
      Settings.reset();
      expect(Settings.get('dataView')).toBe('tree');
      expect(Settings.get('rememberSettings')).toBe(true);
    });

    it('has no Advanced setting any more', () => {
      expect(DEFAULTS).not.toHaveProperty('advanced');
    });

    it('tells listeners after the values are gone, and clears what they write back', () => {
      Settings.set('structHover', true);
      const seen = [];
      Settings.onReset((scope) => {
        seen.push([scope, Settings.get('structHover')]);
        Settings.set('structHover', false); // a control switching itself off
      });
      Settings.reset();
      expect(seen).toEqual([[undefined, false]]);
    });

    it('resets one key with that key as the scope, leaving the others', () => {
      Settings.set('dataView', 'raw');
      Settings.set('dataChanges', true);
      const scopes = [];
      Settings.onReset((scope) => scopes.push(scope));
      Settings.resetKey('dataChanges');
      expect(scopes).toEqual(['dataChanges']);
      expect(Settings.get('dataChanges')).toBe(false);
      expect(Settings.get('dataView')).toBe('raw');
    });

    it('keeps resetting when one listener throws', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const later = jest.fn();
      Settings.onReset(() => { throw new Error('broken'); });
      Settings.onReset(later);
      Settings.reset();
      expect(later).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
