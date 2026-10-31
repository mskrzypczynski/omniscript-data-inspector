'use strict';

/* Settings, "Open in Designer": Auto / Builder (core) / Designer (managed),
 * with a namespace field for managed. It is remembered with Remember my
 * settings, and a bad stored value is dropped. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  global.chrome.storage = {
    local: {
      get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, copy(storage[name])])),
      set: async (values) => { Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
}

async function boot(storage = {}) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  stubStorage(storage);
  await import('../../../src/ui/app.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  return { storage, Settings };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const seg = (value) => document.querySelector(`[data-seg="settings-designer:${value}"]`);

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('Settings: Open in Designer', () => {
  it('offers Auto (pressed), Builder (core) and Designer (managed), each with a tooltip, and no namespace yet', async () => {
    await boot();
    $('settings').click();
    expect([...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent)).toContain('Open in Designer');
    ['auto', 'native', 'managed'].forEach((value) => expect(seg(value).title).not.toBe(''));
    expect(seg('auto').getAttribute('aria-pressed')).toBe('true');
    expect(seg('native').textContent).toBe('Builder (core)');
    expect(seg('managed').textContent).toBe('Designer (managed)');
    expect($('settings-designer-ns')).toBeNull();
    expect($('settings-designer').parentElement.textContent).toContain('Auto is a best guess');
  });

  it('shows the namespace field for managed, with the usual namespaces, and stores what is chosen', async () => {
    const { Settings } = await boot();
    $('settings').click();
    seg('managed').click();
    expect(Settings.get('designerMode')).toBe('managed');
    const field = $('settings-designer-ns');
    expect(field.title).toMatch(/namespace/);
    expect([...document.querySelectorAll('#settings-designer-ns-list option')].map((o) => o.value))
      .toEqual(['vlocity_cmt', 'vlocity_ins', 'vlocity_ps', 'omnistudio']);
    field.value = ' VLOCITY_INS ';
    field.dispatchEvent(new Event('change'));
    expect(Settings.get('designerNs')).toBe('vlocity_ins');
    expect(document.querySelector('.custom-count').textContent).toBe('2');
  });

  it('refuses a namespace that cannot be one and keeps the one set', async () => {
    const { Settings } = await boot();
    $('settings').click();
    seg('managed').click();
    $('settings-designer-ns').value = 'x/../y';
    $('settings-designer-ns').dispatchEvent(new Event('change'));
    expect(Settings.get('designerNs')).toBe('');
    expect($('settings-designer-ns').getAttribute('aria-invalid')).toBe('true');
  });

  it('says why under the field when it refuses an entry, and takes the message away once the entry is good', async () => {
    const { Settings } = await boot();
    $('settings').click();
    seg('managed').click();
    const field = $('settings-designer-ns');
    const note = $('settings-designer-ns-note');
    expect(note.hidden).toBe(true);
    expect(field.getAttribute('aria-describedby')).toBe('settings-designer-ns-note');
    field.value = 'two__underscores';
    field.dispatchEvent(new Event('change'));
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Letters, digits and single underscores, up to 15');
    expect(field.nextElementSibling.nextElementSibling).toBe(note); // right under the field (after its datalist)
    field.value = 'vlocity_ins';
    field.dispatchEvent(new Event('change'));
    expect(note.hidden).toBe(true);
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(Settings.get('designerNs')).toBe('vlocity_ins');
  });

  it('keeps the field and its focus when a valid namespace is stored, and updates the list of what differs', async () => {
    await boot();
    $('settings').click();
    seg('managed').click();
    const field = $('settings-designer-ns');
    field.focus();
    field.value = 'omnistudio';
    field.dispatchEvent(new Event('change'));
    expect($('settings-designer-ns')).toBe(field); // the same element, not a rebuilt one
    expect(document.activeElement).toBe(field);
    const row = document.querySelector('tr[data-setting="designerNs"]');
    expect(row.textContent).toContain('Designer namespace');
    expect(row.textContent).toContain('omnistudio');
  });

  it('names the mode as its button does in Settings that differ, and asks for the namespace "from the page"', async () => {
    await boot();
    $('settings').click();
    seg('managed').click();
    expect($('settings-designer-ns').placeholder).toBe('from the page');
    const row = document.querySelector('tr[data-setting="designerMode"]');
    const cells = [...row.children].map((cell) => cell.textContent);
    expect(cells.slice(0, 3)).toEqual(['Open in Designer', 'Designer (managed)', 'Auto']);
    expect(row.querySelector('button').title).toBe('Put Open in Designer back to Auto');
    seg('native').click();
    expect(document.querySelector('tr[data-setting="designerMode"]').children[1].textContent).toBe('Builder (core)');
  });

  it('hides the namespace field again for core, and Reset puts Auto back', async () => {
    const { Settings } = await boot();
    $('settings').click();
    seg('native').click();
    expect($('settings-designer-ns')).toBeNull();
    const row = document.querySelector('tr[data-setting="designerMode"]');
    expect(row.textContent).toContain('Open in Designer');
    row.querySelector('button').click();
    expect(Settings.get('designerMode')).toBe('auto');
    expect(seg('auto').getAttribute('aria-pressed')).toBe('true');
  });

  it('is remembered with Remember my settings, and a stored value that is not a mode is dropped', async () => {
    const first = await boot();
    $('settings').click();
    $('remember-settings').checked = true;
    $('remember-settings').dispatchEvent(new Event('change'));
    seg('managed').click();
    $('settings-designer-ns').value = 'omnistudio';
    $('settings-designer-ns').dispatchEvent(new Event('change'));
    await flush();
    expect(first.storage.settings).toMatchObject({ designerMode: 'managed', designerNs: 'omnistudio' });

    const second = await boot({ settings: { rememberSettings: true, designerMode: 'managed', designerNs: 'omnistudio' } });
    expect(second.Settings.get('designerMode')).toBe('managed');
    expect(second.Settings.get('designerNs')).toBe('omnistudio');

    const third = await boot({ settings: { rememberSettings: true, designerMode: 'sideways' } });
    expect(third.Settings.get('designerMode')).toBe('auto');
  });
});
