'use strict';

/* Help from any control: right-click a toolbar or top-bar control, or press
 * h while it has focus, and the help opens at that control's entry. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);
const overlay = () => $('help-overlay');
const terms = () => Array.from(document.querySelectorAll('#help-body dt')).map((dt) => dt.textContent);
const menuItems = () => Array.from(document.querySelectorAll('.ctx-menu .ctx-item'));

function rightClick(node) {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  node.dispatchEvent(ev);
  return ev;
}

function closeHelp() {
  if (!overlay().hidden) $('help-close').click();
  document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
}

describe('help from a control', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  afterEach(closeHelp);

  it('offers one item, Help: <name>, on right-click', () => {
    const ev = rightClick($('rescan'));
    expect(ev.defaultPrevented).toBe(true);
    expect(menuItems().map((item) => item.textContent)).toEqual(['Help: Rescan']);
  });

  it('opens the help showing only that entry, named in the filter box', () => {
    rightClick($('refresh'));
    menuItems()[0].click();
    expect(overlay().hidden).toBe(false);
    expect(terms()).toEqual(['Refresh']);
    expect($('help-search').value).toBe('Refresh');
    expect(document.querySelector('#help-body .help-start')).toBeNull();
  });

  it('works from a switch label too, and a text field keeps the browser\'s menu', () => {
    rightClick($('live').closest('label').querySelector('span'));
    menuItems()[0].click();
    expect(terms()).toEqual(['Auto-refresh']);
    closeHelp();

    rightClick($('filter'));
    expect(menuItems()).toHaveLength(0);
  });

  it('brings the rest back when the box is edited or cleared', () => {
    rightClick($('rescan'));
    menuItems()[0].click();
    const search = $('help-search');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(terms().length).toBeGreaterThan(5);
    expect(document.querySelector('#help-body .help-start')).not.toBeNull();
  });

  it('opens the plain help again next time', () => {
    rightClick($('rescan'));
    menuItems()[0].click();
    closeHelp();
    $('help').click();
    expect($('help-search').value).toBe('');
    expect(terms().length).toBeGreaterThan(5);
  });

  it('leaves the rest of the panel with its own right-click, and does nothing while the help is open', () => {
    const ev = rightClick(document.body);
    expect(ev.defaultPrevented).toBe(false);
    $('help').click();
    expect(rightClick($('rescan')).defaultPrevented).toBe(false);
  });

  it('opens the same entry with h while the control has focus', () => {
    $('refresh').focus();
    const ev = new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true });
    $('refresh').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(overlay().hidden).toBe(false);
    expect(terms()).toEqual(['Refresh']);
  });

  it('leaves ? to DevTools: it neither opens nor closes the help', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }));
    expect(overlay().hidden).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    expect(overlay().hidden).toBe(false);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }));
    expect(overlay().hidden).toBe(false);
  });

  it('toggles the whole help with h when no such control has focus, and closes it with h', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    expect(overlay().hidden).toBe(false);
    expect(terms().length).toBeGreaterThan(5);
    $('refresh').dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
    expect(overlay().hidden).toBe(true);
  });

  it('has an entry for every control that names one', () => {
    const named = Array.from(document.querySelectorAll('[data-help]'));
    expect(named.length).toBeGreaterThan(15);
    named.forEach((node) => {
      rightClick(node);
      /* A text field keeps the browser's own menu; its entry is checked by release:check. */
      if (node.matches('input[type="search"], input[type="text"], input[type="number"]')) {
        expect(menuItems()).toHaveLength(0);
        return;
      }
      menuItems()[0].click();
      expect(terms().length).toBeGreaterThan(0);
      expect(document.querySelector('#help-body .help-empty')).toBeNull();
      closeHelp();
    });
  });
});
