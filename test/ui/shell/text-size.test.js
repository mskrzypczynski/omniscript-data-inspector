'use strict';

/* Text size: the S / M / L / XL switch in the help's Settings section and the
 * Ctrl/Cmd + = - 0 keys scale the whole panel with a zoom on the root; the size
 * is a setting (listed, reset, remembered only with Remember my settings). */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const root = () => document.documentElement;
const zoom = () => root().style.getPropertyValue('--text-zoom');
const press = (init, target = document.body) => {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sizeButton = (size) => document.querySelector(`#settings-text-size [data-seg="settings-text-size:${size}"]`);

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

async function boot(storage) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  if (storage) stubStorage(storage);
  await import('../../../src/ui/app.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  return { Settings };
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  root().style.removeProperty('--text-zoom');
  delete root().dataset.textSize;
  delete global.chrome;
});

describe('Text size', () => {
  it('starts at M with no zoom', async () => {
    await boot();
    expect(root().dataset.textSize).toBe('M');
    expect(zoom()).toBe('1');
    $('settings').click();
    expect(sizeButton('M').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#settings-text-size .seg').getAttribute('role')).toBe('group');
  });

  it('gives every size and the group a tooltip', async () => {
    await boot();
    $('settings').click();
    expect(document.getElementById('settings-body').textContent).toContain('Text size');
    ['S', 'M', 'L', 'XL'].forEach((size) => expect(sizeButton(size).title).toMatch(/text \(\d+%\)$/));
    expect(sizeButton('S').title).toBe('Small text (90%)');
    expect(document.querySelector('#settings-text-size .seg').title).toContain('Ctrl/Cmd+=');
  });

  it('zooms the whole panel from the switch and keeps the keyboard on the button', async () => {
    await boot();
    $('settings').click();
    sizeButton('L').click();
    expect(zoom()).toBe('1.12');
    expect(sizeButton('L').getAttribute('aria-pressed')).toBe('true');
    expect(sizeButton('M').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(sizeButton('L'));

    sizeButton('S').click();
    expect(zoom()).toBe('0.9');
    sizeButton('XL').click();
    expect(zoom()).toBe('1.25');
  });

  it('lists a size other than M, with Reset', async () => {
    await boot();
    $('settings').click();
    expect(document.querySelector('.settings-list')).toBeNull();
    sizeButton('XL').click();
    const row = document.querySelector('.settings-list tr[data-setting="textSize"]');
    expect(row.textContent).toContain('Text size');
    expect(row.textContent).toContain('XL');
    row.querySelector('button').click();
    expect(zoom()).toBe('1');
    expect(document.querySelector('.settings-list')).toBeNull();
    expect(sizeButton('M').getAttribute('aria-pressed')).toBe('true');
  });

  it('follows Ctrl and Cmd with = - 0, even from a text field, and stops at the ends', async () => {
    await boot();
    const larger = press({ key: '=', ctrlKey: true });
    expect(larger.defaultPrevented).toBe(true);
    expect(zoom()).toBe('1.12');
    press({ key: '+', metaKey: true, shiftKey: true }, $('filter'));
    expect(zoom()).toBe('1.25');
    press({ key: '=', ctrlKey: true });
    expect(zoom()).toBe('1.25');
    press({ key: '-', ctrlKey: true });
    expect(zoom()).toBe('1.12');
    press({ key: '0', ctrlKey: true });
    expect(zoom()).toBe('1');
    press({ key: '-', metaKey: true });
    press({ key: '-', metaKey: true });
    expect(zoom()).toBe('0.9');
  });

  it('leaves the plain keys and other chords alone', async () => {
    await boot();
    const plain = press({ key: '=' });
    expect(plain.defaultPrevented).toBe(false);
    expect(press({ key: 'a', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(zoom()).toBe('1');
  });

  it('shows a key press in the open help without losing the focus', async () => {
    await boot();
    $('settings').click();
    press({ key: '=', ctrlKey: true });
    expect(sizeButton('L').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.settings-list tr[data-setting="textSize"]')).not.toBeNull();
  });

  it('places a context menu where the pointer is, not zoomed away from it', async () => {
    await boot();
    press({ key: '=', ctrlKey: true });
    press({ key: '=', ctrlKey: true });
    const { openContextMenu, closeContextMenu } = await import('../../../src/ui/context-menu.js');
    openContextMenu({ clientX: 200, clientY: 100, preventDefault() {} }, [{ label: 'Item', action() {} }]);
    const menu = document.querySelector('[role="menu"]');
    expect(menu.style.left).toBe('160px');
    expect(menu.style.top).toBe('80px');
    closeContextMenu();
  });

  it('measures the divider drag in screen pixels, so the list follows the pointer when zoomed', async () => {
    document.body.innerHTML = '<div class="split"><div id="a"></div><div id="b"></div></div>';
    const split = document.querySelector('.split');
    Object.defineProperty(split, 'clientWidth', { value: 1000 });
    Object.defineProperty(split, 'offsetWidth', { value: 1000 });
    // at 125% the split is 1250 screen pixels wide
    split.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1250, height: 0 });
    document.getElementById('a').getBoundingClientRect = () => ({ width: 500, height: 0 });
    const { initSplitPane } = await import('../../../src/ui/split.js');
    initSplitPane(split);
    const divider = split.querySelector('.split-divider');

    divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 625, clientY: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(split.style.getPropertyValue('--list-w')).toBe('50.00%');
  });

  it('is put back by Restore default settings', async () => {
    await boot();
    $('settings').click();
    sizeButton('XL').click();
    $('settings-restore').click();
    $('settings-confirm').click();
    expect(zoom()).toBe('1');
    expect(root().dataset.textSize).toBe('M');
    expect(sizeButton('M').getAttribute('aria-pressed')).toBe('true');
  });

  it('is kept by Remember my settings (on by default), and applied at the next boot', async () => {
    const storage = {};
    const { Settings } = await boot(storage);
    press({ key: '=', ctrlKey: true });
    await flush();
    expect(storage.settings.textSize).toBe('L');
    press({ key: '=', ctrlKey: true });
    await flush();
    expect(storage.settings.textSize).toBe('XL');
    expect(Settings.get('textSize')).toBe('XL');

    document.body.innerHTML = '';
    await boot(storage);
    expect(root().dataset.textSize).toBe('XL');
    expect(zoom()).toBe('1.25');
  });

  it('takes an unknown stored size as M', async () => {
    await boot({ settings: { rememberSettings: true, textSize: 'huge' } });
    expect(root().dataset.textSize).toBe('M');
    expect(zoom()).toBe('1');
  });
});
