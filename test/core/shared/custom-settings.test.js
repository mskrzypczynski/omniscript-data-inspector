'use strict';

import { isCustomProperty, customSettings, formatSettingValue, SETTING_SPECS } from '../../../src/core/shared/custom-settings.js';

describe('isCustomProperty', () => {
  it('is false for the default, blank text and padding around the default', () => {
    expect(isCustomProperty('jsonDef', 'jsonDef')).toBe(false);
    expect(isCustomProperty('  jsonDef ', 'jsonDef')).toBe(false);
    expect(isCustomProperty('', 'jsonDef')).toBe(false);
    expect(isCustomProperty('   ', 'jsonDef')).toBe(false);
  });

  it('is true for any other name, and is case sensitive', () => {
    expect(isCustomProperty('myDef', 'jsonDef')).toBe(true);
    expect(isCustomProperty('jsondef', 'jsonDef')).toBe(true);
  });

  it('is false for a non-string', () => {
    expect(isCustomProperty(undefined, 'jsonDef')).toBe(false);
  });
});

describe('formatSettingValue', () => {
  it('writes booleans as on / off and everything else as text', () => {
    expect(formatSettingValue(true)).toBe('on');
    expect(formatSettingValue(false)).toBe('off');
    expect(formatSettingValue(300)).toBe('300');
    expect(formatSettingValue('raw')).toBe('raw');
  });
});

describe('formatSettingValue with the words a control uses', () => {
  it('prints the control\'s word for a stored value, and the value itself when there is none', () => {
    const words = { managed: 'Designer (managed)' };
    expect(formatSettingValue('managed', words)).toBe('Designer (managed)');
    expect(formatSettingValue('other', words)).toBe('other');
    expect(formatSettingValue('', words)).toBe('(default)');
  });
});

describe('customSettings', () => {
  const defaults = { structFollow: true, defProp: 'jsonDef', logSlowMs: 0, mask: false, dataLive: true };

  it('is empty when everything is at its default', () => {
    expect(customSettings({ ...defaults, defProp: ' jsonDef ' }, defaults)).toEqual([]);
  });

  it('lists only what differs, with label, values and the session flag', () => {
    const rows = customSettings({ ...defaults, structFollow: false, defProp: 'myDef', logSlowMs: 250, mask: true, dataLive: false }, defaults);
    expect(rows).toEqual([
      { key: 'mask', label: 'Mask values', current: 'on', default: 'off' },
      { key: 'dataLive', label: 'Auto-refresh', current: 'off', default: 'on' },
      { key: 'defProp', label: 'Definition property', current: 'myDef', default: 'jsonDef' },
      { key: 'structFollow', label: 'Follow current step', current: 'off', default: 'on' },
      { key: 'logSlowMs', label: 'Slow call threshold (ms)', current: '250', default: '0' }
    ]);
  });

  it('lists the Reading settings by their names, and Show the Frame row when it is on', () => {
    const base = { ...defaults, dataProp: 'jsonDataStr', showFrameRow: false };
    expect(customSettings(base, base)).toEqual([]);
    expect(customSettings({ ...base, dataProp: 'myData', showFrameRow: true }, base)).toEqual([
      { key: 'showFrameRow', label: 'Show the Frame row', current: 'on', default: 'off' },
      { key: 'dataProp', label: 'Data property', current: 'myData', default: 'jsonDataStr' }
    ]);
  });

  it('names Open in Designer\'s modes as the buttons do, not by their stored value', () => {
    const base = { ...defaults, designerMode: 'auto' };
    expect(customSettings({ ...base, designerMode: 'managed' }, base)).toEqual([
      { key: 'designerMode', label: 'Open in Designer', current: 'Designer (managed)', default: 'Auto' }
    ]);
    expect(customSettings({ ...base, designerMode: 'native' }, base)[0].current).toBe('Builder (core)');
  });

  it('lists the Time format when it is not milliseconds', () => {
    expect(customSettings({ ...defaults, timeFormat: 'human' }, { ...defaults, timeFormat: 'ms' })).toEqual([
      { key: 'timeFormat', label: 'Time format', current: 'human', default: 'ms' }
    ]);
    expect(customSettings({ ...defaults, timeFormat: 'ms' }, { ...defaults, timeFormat: 'ms' })).toEqual([]);
  });

  it('never lists an old stored `advanced`: there is no such setting any more', () => {
    expect(customSettings({ ...defaults, advanced: true }, defaults)).toEqual([]);
    expect(SETTING_SPECS.some((spec) => spec.key === 'advanced')).toBe(false);
  });

  it('treats a blank property as the default and skips unknown settings', () => {
    expect(customSettings({ defProp: '' }, defaults)).toEqual([]);
    expect(customSettings({}, defaults)).toEqual([]);
  });

  it('never lists Track changes: it is a way of looking, so it does not count on the gear', () => {
    expect(customSettings({ ...defaults, dataChanges: true }, { ...defaults, dataChanges: false })).toEqual([]);
    expect(SETTING_SPECS.some((spec) => spec.key === 'dataChanges')).toBe(false);
  });

  it('has a unique key and a label for every spec', () => {
    const keys = SETTING_SPECS.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
    SETTING_SPECS.forEach((spec) => expect(spec.label).toBeTruthy());
  });
});

describe('a view choice is not a setting that differs, unless Remember my settings keeps it', () => {
  const defaults = {
    dataView: 'tree', dataProp: 'jsonDataStr', structValueView: 'form', structDetailTab: '', structShowInternal: false, logDetailTab: ''
  };

  it('does not list a view while nothing is remembered, whatever view is open', () => {
    ['raw', 'sizes', 'changes'].forEach((view) => {
      expect(customSettings({ dataView: view }, defaults)).toEqual([]);
    });
    expect(customSettings({ structValueView: 'raw', structDetailTab: 'props', structShowInternal: true, logDetailTab: 'output' }, defaults))
      .toEqual([]);
  });

  it('still lists the settings that do differ beside a view choice', () => {
    expect(customSettings({ dataView: 'sizes', dataProp: 'myData' }, defaults).map((row) => row.key)).toEqual(['dataProp']);
  });

  it('lists the views that are kept, with labels and values, while remembering is on', () => {
    const rows = customSettings({
      dataView: 'raw', structValueView: 'tree', structDetailTab: 'props', structShowInternal: true, logDetailTab: 'output'
    }, defaults, SETTING_SPECS, { remembered: true });
    expect(rows).toEqual([
      { key: 'dataView', label: 'Data view', current: 'Raw', default: 'Tree' },
      { key: 'structValueView', label: 'Current value view', current: 'Tree', default: 'Form' },
      { key: 'structDetailTab', label: 'Structure detail tab', current: 'Properties', default: '(default)' },
      { key: 'structShowInternal', label: 'Show internal properties', current: 'on', default: 'off' },
      { key: 'logDetailTab', label: 'Call detail tab', current: 'Output', default: '(default)' }
    ]);
  });

  it('lists nothing for a view at its default, even while remembering', () => {
    expect(customSettings({ ...defaults }, defaults, SETTING_SPECS, { remembered: true })).toEqual([]);
  });
});

describe('the settings added in round 9', () => {
  it('lists Mask values at start and Refresh rate (with its own words)', () => {
    const rows = customSettings({ maskAtStart: true, refreshRate: 'gentle' }, { maskAtStart: false, refreshRate: 'normal' });
    expect(rows).toEqual([
      { key: 'maskAtStart', label: 'Mask values at start', current: 'on', default: 'off' },
      { key: 'refreshRate', label: 'Refresh rate', current: 'Gentle', default: 'Normal' }
    ]);
  });
});

describe('the kept views are printed with the names on the tabs, not the stored ids', () => {
  const defaults = { structDetailTab: '', structValueView: 'form', dataView: 'tree', logDetailTab: '' };
  const printed = (key, value) => customSettings({ [key]: value }, defaults, SETTING_SPECS, { remembered: true })[0].current;

  it('names each Structure detail tab as its button does', () => {
    expect(['value', 'options', 'props', 'conditions', 'validation', 'calls'].map((tab) => printed('structDetailTab', tab)))
      .toEqual(['Current value', 'Options', 'Properties', 'Visibility', 'Validation', 'Calls']);
  });

  it('names the Data view, the Current value view and the call detail tab', () => {
    expect(['form', 'raw'].map((view) => printed('dataView', view))).toEqual(['Form', 'Raw']);
    expect(['tree', 'raw'].map((view) => printed('structValueView', view))).toEqual(['Tree', 'Raw']);
    expect(['input', 'output', 'options'].map((tab) => printed('logDetailTab', tab))).toEqual(['Input', 'Output', 'Options']);
  });
});

describe('Mask values and Mask values at start are one choice', () => {
  const defaults = { mask: false, maskAtStart: false };

  it('lists only Mask values at start while Mask values equals it', () => {
    expect(customSettings({ mask: true, maskAtStart: true }, defaults).map((row) => row.key)).toEqual(['maskAtStart']);
  });

  it('lists Mask values at start alone when the switch was turned off for the session', () => {
    expect(customSettings({ mask: false, maskAtStart: true }, defaults).map((row) => row.key)).toEqual(['maskAtStart']);
  });

  it('lists Mask values when it is on without Mask values at start', () => {
    expect(customSettings({ mask: true, maskAtStart: false }, defaults).map((row) => row.key)).toEqual(['mask']);
  });

  it('lists Mask values when Mask values at start is not known', () => {
    expect(customSettings({ mask: true }, defaults).map((row) => row.key)).toEqual(['mask']);
  });
});
