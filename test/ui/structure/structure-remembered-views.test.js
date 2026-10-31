'use strict';

/* The views last chosen on Structure (the Current value view, the detail tab
 * picked by hand and Show internal) are Settings the tab writes when the user
 * chooses and reads when it starts, so Remember my settings keeps them. Names
 * and values are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Field', type: 'Text', propSetMap: { label: 'Your name', _lwcInternal: 'x', lwcName: 'c-field' } },
  { name: 'Other', type: 'Text', propSetMap: { label: 'Other name' } }
] }];

const DATA = { Intro: { Field: 'Ada', Other: 'Bea' } };

const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const activeTab = () => document.querySelector('#struct-detail .seg-btn.is-on').textContent;
const switchOn = () => document.querySelector('#struct-detail .value-views .seg-btn[aria-pressed="true"]').textContent;

let Settings;
async function open(stored = {}) {
  await bootStructure({
    scripts: [{ id: 'main', def: definition({ steps: steps() }), data: DATA }],
    seed: async () => {
      ({ Settings } = await import('../../../src/ui/settings.js'));
      Object.entries(stored).forEach(([name, value]) => Settings.set(name, value));
    }
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the starting values', () => {
  it('are today\'s: Form, no tab picked, internal keys hidden', async () => {
    await open();
    expect(Settings.get('structValueView')).toBe('form');
    expect(Settings.get('structDetailTab')).toBe('');
    expect(Settings.get('structShowInternal')).toBe(false);
    clickRow('Intro');
    expect(switchOn()).toBe('Form');
  });
});

describe('what the tab writes', () => {
  it('the Current value view, when it is picked', async () => {
    await open();
    clickRow('Intro');
    document.querySelector('#struct-detail .value-views [data-view="raw"]').click();
    expect(Settings.get('structValueView')).toBe('raw');
    document.querySelector('#struct-detail .value-views [data-view="tree"]').click();
    expect(Settings.get('structValueView')).toBe('tree');
  });

  it('the tab picked by hand, but nothing for JSON', async () => {
    await open();
    clickRow('Field');
    tabButton('Properties').click();
    expect(Settings.get('structDetailTab')).toBe('props');
    tabButton('JSON').click();
    expect(Settings.get('structDetailTab')).toBe('');
  });

  it('Show internal, both ways', async () => {
    await open();
    clickRow('Field');
    tabButton('Properties').click();
    document.querySelector('.prop-internal-toggle').click();
    expect(Settings.get('structShowInternal')).toBe(true);
    document.querySelector('.prop-internal-toggle').click();
    expect(Settings.get('structShowInternal')).toBe(false);
  });

  it('nothing at all for an element that is only selected', async () => {
    await open();
    clickRow('Field');
    clickRow('Other');
    expect(Settings.get('structDetailTab')).toBe('');
  });
});

describe('what the tab reads at the start', () => {
  it('opens a step on the remembered Current value view', async () => {
    await open({ structValueView: 'raw' });
    clickRow('Intro');
    expect(switchOn()).toBe('Raw');
  });

  it('opens an element on the remembered tab while it has it', async () => {
    await open({ structDetailTab: 'props' });
    clickRow('Field');
    expect(activeTab()).toBe('Properties');
    clickRow('Other');
    expect(activeTab()).toBe('Properties');
  });

  it('shows the internal keys when Show internal was left on', async () => {
    await open({ structDetailTab: 'props', structShowInternal: true });
    clickRow('Field');
    expect(document.querySelector('.prop-internal-toggle').textContent).toMatch(/^Hide internal/);
  });

  it('falls back to the default for a value that is not one of the choices', async () => {
    await open({ structValueView: 'table', structDetailTab: 'nope' });
    clickRow('Intro');
    expect(switchOn()).toBe('Form');
    clickRow('Field');
    expect(activeTab()).toBe('Current value');
  });
});

describe('Restore default settings', () => {
  it('puts the views back and redraws', async () => {
    await open({ structValueView: 'raw', structDetailTab: 'props', structShowInternal: true });
    clickRow('Field');
    expect(activeTab()).toBe('Properties');
    Settings.reset();
    expect(activeTab()).toBe('Current value');
    expect(Settings.get('structValueView')).toBe('form');
    clickRow('Intro');
    expect(switchOn()).toBe('Form');
  });

  it('is listed under Settings that differ while a view differs and settings are remembered', async () => {
    await open({ structValueView: 'raw' });
    const { customSettings, SETTING_SPECS } = await import('../../../src/core/shared/custom-settings.js');
    const rows = customSettings(Settings.current(), Settings.defaults(), SETTING_SPECS, { remembered: true });
    expect(rows.map((row) => row.key)).toContain('structValueView');
    expect(rows.find((row) => row.key === 'structValueView')).toMatchObject({ current: 'Raw', default: 'Form' });
  });
});
