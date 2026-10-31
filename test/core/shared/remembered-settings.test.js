'use strict';

import { pickRemembered, isRemembering, NOT_REMEMBERED, rememberedToWrite, rememberedToRestore, migrateSettings, needsMigration, maskAtStartToStore, maskAtStartToRestore, REMEMBER_ALLOWED } from '../../../src/core/shared/remembered-settings.js';

const DEFAULTS = {
  advanced: false, rememberSettings: true, tabOrder: 'Data, Structure, Calls',
  dataView: 'tree', logSlowMs: 0, timeFormat: 'ms'
};

describe('pickRemembered', () => {
  it('ignores a Show values kept by an earlier build: the list has no Value column any more', () => {
    expect(pickRemembered({ structShowValues: true, dataView: 'raw' }, DEFAULTS)).toEqual({ dataView: 'raw' });
  });

  it('keeps known settings of the right type', () => {
    expect(pickRemembered({ dataView: 'raw', logSlowMs: 300, advanced: true }, DEFAULTS))
      .toEqual({ dataView: 'raw', logSlowMs: 300, advanced: true });
  });

  it('drops unknown names, wrong types and non-finite numbers', () => {
    expect(pickRemembered({ evil: 'x', dataView: 5, logSlowMs: Infinity, advanced: 'yes', timeFormat: null }, DEFAULTS)).toEqual({});
  });

  it('never keeps the tab order (it has its own entry), Mask values or data', () => {
    const picked = pickRemembered({ tabOrder: 'Calls, Data', mask: true, dataLive: false, pins: ['a'] },
      { ...DEFAULTS, mask: false, dataLive: true });
    expect(picked).toEqual({});
  });

  it('never keeps Allow test calls or its acknowledgement, so sending is a fresh choice at every start', () => {
    const defaults = { ...DEFAULTS, allowTestCalls: false, testCallsAck: false };
    expect(pickRemembered({ allowTestCalls: true, testCallsAck: true, dataView: 'raw' }, defaults)).toEqual({ dataView: 'raw' });
    expect(rememberedToWrite({ rememberSettings: true, allowTestCalls: true, testCallsAck: true }, defaults)).toEqual({ rememberSettings: true });
    expect(rememberedToRestore({ rememberSettings: true, allowTestCalls: true, testCallsAck: true }, defaults)).toEqual({ rememberSettings: true });
  });

  it('does not change its input and copes with junk', () => {
    const input = { dataView: 'raw' };
    pickRemembered(input, DEFAULTS);
    expect(input).toEqual({ dataView: 'raw' });
    expect(pickRemembered(null, DEFAULTS)).toEqual({});
    expect(pickRemembered('text', DEFAULTS)).toEqual({});
  });
});

describe('rememberedToWrite', () => {
  it('writes only the switch, as off, while it is off: nothing else is kept', () => {
    expect(rememberedToWrite({ rememberSettings: false, dataView: 'raw' }, DEFAULTS)).toEqual({ rememberSettings: false });
  });

  it('treats a switch that was never set as the default, which is on', () => {
    expect(isRemembering({}, DEFAULTS)).toBe(true);
    expect(isRemembering(undefined, DEFAULTS)).toBe(true);
    expect(isRemembering({ rememberSettings: false }, DEFAULTS)).toBe(false);
    expect(rememberedToWrite({ dataView: 'raw' }, DEFAULTS)).toEqual({ rememberSettings: true, dataView: 'raw' });
  });

  it('writes the settings and the switch itself while it is on', () => {
    expect(rememberedToWrite({ rememberSettings: true, dataView: 'raw', tabOrder: 'x' }, DEFAULTS))
      .toEqual({ rememberSettings: true, dataView: 'raw' });
  });
});

describe('rememberedToRestore', () => {
  it('puts back what was kept while the switch was on', () => {
    expect(rememberedToRestore({ rememberSettings: true, dataView: 'raw' }, DEFAULTS))
      .toEqual({ rememberSettings: true, dataView: 'raw' });
  });

  it('puts back only the choice when the switch was turned off, whatever else the object holds', () => {
    expect(rememberedToRestore({ rememberSettings: false, dataView: 'raw' }, DEFAULTS)).toEqual({ rememberSettings: false });
  });

  it('puts back nothing from an object that does not say the switch was on', () => {
    expect(rememberedToRestore({ dataView: 'raw' }, DEFAULTS)).toEqual({});
    expect(rememberedToRestore(undefined, DEFAULTS)).toEqual({});
  });
});

describe('values outside a setting\'s choices', () => {
  const defaults = { ...DEFAULTS, textSize: 'M' };

  it('are dropped when the setting has a list of choices', () => {
    const picked = pickRemembered({
      timeFormat: 's', textSize: 'XXL', dataView: 'graph'
    }, defaults, REMEMBER_ALLOWED);
    expect(picked).toEqual({});
  });

  it('are kept when they are one of the choices', () => {
    const values = { timeFormat: 'human', textSize: 'XL', dataView: 'raw' };
    expect(pickRemembered(values, defaults, REMEMBER_ALLOWED)).toEqual(values);
  });

  it('stay a type check only for a setting with no list', () => {
    expect(pickRemembered({ logSlowMs: 300 }, defaults, REMEMBER_ALLOWED)).toEqual({ logSlowMs: 300 });
  });

  it('are dropped when writing and when restoring', () => {
    expect(rememberedToWrite({ rememberSettings: true, textSize: 'huge' }, defaults, REMEMBER_ALLOWED)).toEqual({ rememberSettings: true });
    expect(rememberedToRestore({ rememberSettings: true, textSize: 'huge', timeFormat: 'human' }, defaults, REMEMBER_ALLOWED))
      .toEqual({ rememberSettings: true, timeFormat: 'human' });
  });
});

describe('migrating an earlier version\'s settings', () => {
  const defaults = { rememberSettings: true, clearOnReload: false, logSlowMs: 0 };

  it('turns an old Preserve on reload of false into Clear on reload, and drops the old name', () => {
    expect(migrateSettings({ rememberSettings: true, logPreserve: false, logSlowMs: 300 }))
      .toEqual({ rememberSettings: true, clearOnReload: true, logSlowMs: 300 });
  });

  it('turns an old true into the default, which is not stored as a change', () => {
    expect(migrateSettings({ rememberSettings: true, logPreserve: true })).toEqual({ rememberSettings: true, clearOnReload: false });
  });

  it('lets a new key already stored win, and leaves other stored values alone', () => {
    expect(migrateSettings({ logPreserve: false, clearOnReload: false })).toEqual({ clearOnReload: false });
    expect(migrateSettings({ logSlowMs: 5 })).toEqual({ logSlowMs: 5 });
    expect(migrateSettings(null)).toBeNull();
    expect(migrateSettings({ logPreserve: 'no' })).toEqual({});
  });

  it('does not change what it was given', () => {
    const stored = Object.freeze({ logPreserve: false });
    expect(() => migrateSettings(stored)).not.toThrow();
    expect(stored).toEqual({ logPreserve: false });
  });

  it('is applied when restoring, once', () => {
    const stored = { rememberSettings: true, logPreserve: false };
    expect(rememberedToRestore(stored, defaults)).toEqual({ rememberSettings: true, clearOnReload: true });
    expect(needsMigration(stored)).toBe(true);
    expect(needsMigration(migrateSettings(stored))).toBe(false);
    expect(needsMigration({})).toBe(false);
    expect(needsMigration(undefined)).toBe(false);
  });

  describe('OmniStudio only became All Apex calls', () => {
    const withShowAll = { ...defaults, logShowAll: false };

    it('turns an old OmniStudio only of false into All Apex calls on, and drops the old name', () => {
      expect(migrateSettings({ rememberSettings: true, logOnlyOmni: false, logSlowMs: 300 }))
        .toEqual({ rememberSettings: true, logShowAll: true, logSlowMs: 300 });
    });

    it('turns an old true into the default (All Apex calls off)', () => {
      expect(migrateSettings({ rememberSettings: true, logOnlyOmni: true })).toEqual({ rememberSettings: true, logShowAll: false });
    });

    it('lets All Apex calls already stored win, and drops a value of another type', () => {
      expect(migrateSettings({ logOnlyOmni: false, logShowAll: false })).toEqual({ logShowAll: false });
      expect(migrateSettings({ logOnlyOmni: 'no' })).toEqual({});
    });

    it('migrates both renamed settings in one object, without changing the input', () => {
      const stored = Object.freeze({ logPreserve: false, logOnlyOmni: false });
      expect(migrateSettings(stored)).toEqual({ clearOnReload: true, logShowAll: true });
      expect(stored).toEqual({ logPreserve: false, logOnlyOmni: false });
    });

    it('is applied when restoring, once', () => {
      const stored = { rememberSettings: true, logOnlyOmni: false };
      expect(rememberedToRestore(stored, withShowAll)).toEqual({ rememberSettings: true, logShowAll: true });
      expect(needsMigration(stored)).toBe(true);
      expect(needsMigration(migrateSettings(stored))).toBe(false);
    });
  });
});

describe('Mask values at start is a flag of its own', () => {
  const defaults = { ...DEFAULTS, maskAtStart: false };

  it('is never part of the remembered settings, in either direction', () => {
    expect(pickRemembered({ maskAtStart: true, dataView: 'raw' }, defaults)).toEqual({ dataView: 'raw' });
    expect(rememberedToWrite({ rememberSettings: true, maskAtStart: true }, defaults)).toEqual({ rememberSettings: true });
    expect(rememberedToRestore({ rememberSettings: true, maskAtStart: true }, defaults)).toEqual({ rememberSettings: true });
  });

  it('is stored when ticked and deleted otherwise', () => {
    expect(maskAtStartToStore(true)).toBe(true);
    expect([false, undefined, null, 'true', 1].map(maskAtStartToStore)).toEqual([null, null, null, null, null]);
  });

  it('is restored only from a true', () => {
    expect(maskAtStartToRestore(true)).toBe(true);
    expect([false, undefined, null, 'true', 1, {}].map(maskAtStartToRestore)).toEqual(Array(6).fill(false));
  });
});

describe('settings that start fresh every session', () => {
  const defaults = {
    ...DEFAULTS, logErrorsOnly: false, structVisibleOnly: false, dataProp: 'jsonDataStr', defProp: 'jsonDef', structFollow: true
  };
  const remembered = { logErrorsOnly: true, structVisibleOnly: true, dataProp: 'other', defProp: 'otherDef' };

  it('lists Failed only, Visible only, Data property and Definition property', () => {
    expect(NOT_REMEMBERED).toEqual(expect.arrayContaining(['logErrorsOnly', 'structVisibleOnly', 'dataProp', 'defProp']));
  });

  it('are ignored when a stored value is put back, one by one, while the others still are', () => {
    Object.keys(remembered).forEach((name) => {
      expect(rememberedToRestore({ rememberSettings: true, [name]: remembered[name], structFollow: false }, defaults, REMEMBER_ALLOWED))
        .toEqual({ rememberSettings: true, structFollow: false });
    });
  });

  it('are not written either', () => {
    expect(rememberedToWrite({ rememberSettings: true, ...remembered, structFollow: false }, defaults, REMEMBER_ALLOWED))
      .toEqual({ rememberSettings: true, structFollow: false });
  });
});

describe('a profile stored by an earlier version', () => {
  const defaults = { ...DEFAULTS, structFollow: true, refreshRate: 'normal' };

  it('is ignored: Profiles are gone, so the name is no setting', () => {
    expect(pickRemembered({ profile: 'expert', structFollow: false }, defaults, REMEMBER_ALLOWED)).toEqual({ structFollow: false });
    expect(rememberedToRestore({ rememberSettings: true, profile: 'expert', refreshRate: 'fast' }, defaults, REMEMBER_ALLOWED))
      .toEqual({ rememberSettings: true, refreshRate: 'fast' });
  });

  it('is no longer a reason to migrate or to add a refresh rate', () => {
    const stored = { rememberSettings: true, profile: 'expert', dataChanges: true, logSlowMs: 500 };
    expect(needsMigration(stored)).toBe(false);
    expect(migrateSettings(stored)).toBe(stored);
  });
});
