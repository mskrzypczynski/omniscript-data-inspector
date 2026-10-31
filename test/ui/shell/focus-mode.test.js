'use strict';

/* Focus mode: the grip on the split divider and Ctrl/Cmd+\ hide the list of
 * the tab on screen so the detail takes the full width; the grip, the
 * shortcut again, or Esc in the detail bring it back. Per tab, in memory. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const key = (target, init) => {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};
const grip = (tab) => $(`view-${tab}`).querySelector('.split-grip');
const split = (tab) => $(`view-${tab}`).querySelector('.split');

beforeAll(async () => {
  stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
});

afterEach(() => {
  $('tab-data').click();
  ['structure', 'actions'].forEach((tab) => { if (split(tab).classList.contains('is-focus')) grip(tab).click(); });
});

describe('Focus mode', () => {
  it('puts a grip with a tooltip, help entry and aria-expanded on each split divider', () => {
    ['structure', 'actions'].forEach((tab) => {
      const button = grip(tab);
      expect(button.tagName).toBe('BUTTON');
      expect(button.title).toBe('Hide the list (Ctrl+\\)');
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(button.getAttribute('data-help')).toBe('Focus mode');
      expect(button.closest('[role="separator"]')).toBeNull();
    });
  });

  it('hides and shows the list with the grip', () => {
    $('tab-structure').click();
    grip('structure').click();
    expect(split('structure').classList.contains('is-focus')).toBe(true);
    expect(grip('structure').getAttribute('aria-expanded')).toBe('false');
    expect(grip('structure').title).toBe('Show the list (Ctrl+\\)');

    grip('structure').click();
    expect(split('structure').classList.contains('is-focus')).toBe(false);
    expect(grip('structure').getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles the tab on screen with Ctrl+\\ and Cmd+\\, and only that tab', () => {
    $('tab-actions').click();
    const first = key(document.body, { key: '\\', ctrlKey: true });
    expect(first.defaultPrevented).toBe(true);
    expect(split('actions').classList.contains('is-focus')).toBe(true);
    expect(split('structure').classList.contains('is-focus')).toBe(false);

    key(document.body, { key: '\\', metaKey: true });
    expect(split('actions').classList.contains('is-focus')).toBe(false);
  });

  it('keeps each tab\'s own state when switching tabs', () => {
    $('tab-structure').click();
    key(document.body, { key: '\\', ctrlKey: true });
    $('tab-actions').click();
    expect(split('actions').classList.contains('is-focus')).toBe(false);
    $('tab-structure').click();
    expect(split('structure').classList.contains('is-focus')).toBe(true);
  });

  it('does nothing on the Data tab, which has no list and detail', () => {
    $('tab-data').click();
    const ev = key(document.body, { key: '\\', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('brings the list back with Esc from the detail pane, and keeps the width it had', () => {
    $('tab-actions').click();
    split('actions').style.setProperty('--list-w', '33.00%');
    key(document.body, { key: '\\', ctrlKey: true });
    expect(split('actions').classList.contains('is-focus')).toBe(true);

    key($('log-detail'), { key: 'Escape' });
    expect(split('actions').classList.contains('is-focus')).toBe(false);
    expect(split('actions').style.getPropertyValue('--list-w')).toBe('33.00%');
  });

  it('leaves Esc alone when the list is shown, or the key was already used', () => {
    $('tab-actions').click();
    const shown = key($('log-detail'), { key: 'Escape' });
    expect(shown.defaultPrevented).toBe(false);
    expect(split('actions').classList.contains('is-focus')).toBe(false);

    key(document.body, { key: '\\', ctrlKey: true });
    $('log-detail').addEventListener('keydown', (ev) => ev.preventDefault(), { once: true, capture: true });
    key($('log-detail'), { key: 'Escape' });
    expect(split('actions').classList.contains('is-focus')).toBe(true);
  });

  it('moves the keyboard to the grip when it was in the list, and back when the list returns', () => {
    $('tab-structure').click();
    const list = $('struct-list');
    const row = document.createElement('button');
    list.appendChild(row);
    row.focus();
    key(row, { key: '\\', ctrlKey: true });
    expect(document.activeElement).toBe(grip('structure'));

    key(grip('structure'), { key: '\\', ctrlKey: true });
    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it('does not resize while the list is hidden, and a double-click on the divider brings it back', () => {
    $('tab-structure').click();
    key(document.body, { key: '\\', ctrlKey: true });
    const divider = split('structure').querySelector('.split-divider');
    expect(divider.getAttribute('aria-valuenow')).toBe('0');
    const arrow = key(divider, { key: 'ArrowRight' });
    expect(arrow.defaultPrevented).toBe(true);
    expect(split('structure').style.getPropertyValue('--list-w')).toBe('');

    divider.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(split('structure').classList.contains('is-focus')).toBe(false);
  });

  it('leaves the shortcut to the help dialog while it is open', () => {
    $('tab-structure').click();
    $('help').click();
    const ev = key(document.body, { key: '\\', ctrlKey: true });
    expect(ev.defaultPrevented).toBe(false);
    expect(split('structure').classList.contains('is-focus')).toBe(false);
    $('help-close').click();
  });

  it('is listed in the shortcuts and has a help entry', () => {
    $('help').click();
    const text = $('help-body').textContent;
    expect(text).toContain('Focus mode');
    expect($('help-body').querySelector('table.keys').textContent).toContain('hide or show the list');
    $('help-close').click();
  });
});
