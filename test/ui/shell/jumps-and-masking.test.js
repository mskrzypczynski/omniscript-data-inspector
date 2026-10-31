'use strict';

/* Through the real panel markup: the Mask switch and the Nav bus the two
 * jumps between Structure and Data are built on. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

describe('mask switch', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  it('is off by default and toggles the shared setting', async () => {
    const { Mask } = await import('../../../src/ui/mask-setting.js');
    const box = document.getElementById('mask-values');
    expect(Mask.on()).toBe(false);
    expect(Mask.apply({ a: 'x' })).toEqual({ a: 'x' });

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(Mask.on()).toBe(true);
    expect(Mask.apply({ a: 'x', n: 1 })).toEqual({ a: '<string>', n: '<number>' });
    expect(box.closest('label').classList.contains('is-on')).toBe(true);

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(Mask.on()).toBe(false);
  });
});

describe('the Nav bus', () => {
  it('switches the tab first, then hands the request to that tab', async () => {
    const { Nav } = await import('../../../src/ui/nav.js');
    const calls = [];
    Nav.setTabSwitcher((tab) => calls.push(`switch:${tab}`));
    Nav.on('probe', (request) => calls.push(`handle:${request.x}`));
    Nav.go('probe', { x: 1 });
    expect(calls).toEqual(['switch:probe', 'handle:1']);
    Nav.go('nobody', {});
    expect(calls.at(-1)).toBe('switch:nobody');
  });
});

describe('keyboard shortcuts', () => {
  const press = (key, target = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const visible = (id) => !document.getElementById(id).hidden;

  it('1 2 3 switch tabs, and are ignored while typing in a field', () => {
    press('2');
    expect(visible('view-structure')).toBe(true);
    press('3');
    expect(visible('view-actions')).toBe(true);
    press('1');
    expect(visible('view-data')).toBe(true);

    press('2', document.getElementById('filter'));
    expect(visible('view-data')).toBe(true);
  });

  it('keeps working after a checkbox or button was clicked, and stops for text-like inputs', () => {
    const box = document.getElementById('log-errors-only');
    press('1');
    press('3');
    press('1', box);
    expect(visible('view-data')).toBe(true);
    press('3', box);
    expect(visible('view-actions')).toBe(true);
    press('1');

    const number = document.createElement('input');
    number.type = 'number';
    document.body.appendChild(number);
    press('3', number);
    expect(visible('view-data')).toBe(true);
    number.remove();
  });

  it('/ focuses the filter of the current tab and h toggles help', () => {
    document.getElementById('filter').disabled = false; // no script on this page, so the Data filter is off; the shortcut is what is tested
    press('/');
    expect(document.activeElement.id).toBe('filter');
    document.activeElement.blur();

    press('h');
    expect(document.getElementById('help-overlay').hidden).toBe(false);
    press('h');
    expect(document.getElementById('help-overlay').hidden).toBe(true);
  });

  it('documents the row threshold, the list keys and the current wording in the help', () => {
    press('h');
    const text = document.getElementById('help-body').textContent;
    press('h');
    expect(text).toContain('more than 1500 rows');
    expect(text).toContain('PageDown');
    expect(text).toContain('about once a second');
    expect(text).not.toContain('Reveal element');
  });

  it('ignores a shortcut with a modifier held', () => {
    document.getElementById('tab-data').click();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));
    expect(visible('view-data')).toBe(true);
  });
});

describe('No Advanced switch', () => {
  it('has no switch in the top bar and no is-advanced class, so every control is on its tab', () => {
    expect(document.getElementById('advanced')).toBeNull();
    expect(document.body.classList.contains('is-advanced')).toBe(false);
    expect(document.querySelector('.scope-extra')).not.toBeNull();
    expect(document.querySelector('.scope-extra').classList.contains('adv')).toBe(false);
    expect(document.querySelector('[data-help="Advanced"]')).toBeNull();
  });

  it('has Follow current step on by default', () => {
    expect(document.getElementById('struct-follow').checked).toBe(true);
  });

  it('no longer offers a body search or a compare button', () => {
    expect(document.getElementById('log-in-bodies')).toBeNull();
  });
});
