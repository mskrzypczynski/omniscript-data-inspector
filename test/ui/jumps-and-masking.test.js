'use strict';

/* Through the real panel markup: the Mask switch and the Nav bus the two
 * jumps between Structure and Data are built on. */

import { stubChromeDevtools, mountPanelMarkup } from './support/panel-fixture.js';

describe('mask switch', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../src/ui/app.js');
  });

  it('is off by default and toggles the shared setting', async () => {
    const { Mask } = await import('../../src/ui/mask-setting.js');
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
    const { Nav } = await import('../../src/ui/nav.js');
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

  it('/ focuses the filter of the current tab and ? toggles help', () => {
    press('/');
    expect(document.activeElement.id).toBe('filter');
    document.activeElement.blur();

    press('?');
    expect(document.getElementById('help-overlay').hidden).toBe(false);
    press('?');
    expect(document.getElementById('help-overlay').hidden).toBe(true);
  });

  it('has no tip banner', () => {
    expect(document.getElementById('tip')).toBeNull();
  });

  it('ignores a shortcut with a modifier held', () => {
    document.getElementById('tab-data').click();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }));
    expect(visible('view-data')).toBe(true);
  });
});

describe('Advanced switch', () => {
  it('hides the advanced controls until it is on, and resets their filters when it goes off', () => {
    const box = document.getElementById('advanced');
    expect(document.body.classList.contains('is-advanced')).toBe(false);
    expect(document.querySelector('#view-data .bar.adv')).not.toBeNull();
    expect(document.getElementById('show-nested').closest('.adv') !== null).toBe(true);
    expect(document.getElementById('frame').closest('.adv') !== null).toBe(true);
    expect(document.getElementById('select').classList.contains('adv')).toBe(true);
    ['struct-follow', 'struct-autocollapse', 'struct-hover', 'struct-visible-only']
      .forEach((id) => expect(document.getElementById(id).closest('label').classList.contains('adv')).toBe(true));

    box.click();
    expect(document.body.classList.contains('is-advanced')).toBe(true);
    expect(box.getAttribute('aria-checked')).toBe('true');

    const errors = document.getElementById('log-errors-only');
    errors.checked = true;
    errors.dispatchEvent(new Event('change'));
    const changedOnly = document.getElementById('changed-only');
    changedOnly.checked = true;
    changedOnly.dispatchEvent(new Event('change'));

    const nested = document.getElementById('show-nested');
    nested.checked = true;

    box.click();
    expect(document.body.classList.contains('is-advanced')).toBe(false);
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(nested.checked).toBe(false);
    expect(errors.checked).toBe(false);
    expect(changedOnly.checked).toBe(false);
    expect(document.getElementById('log-only-omni').checked).toBe(true);
  });

  it('keeps Prev and Next disabled while nothing is marked', () => {
    expect(document.getElementById('prev-change').disabled).toBe(true);
    expect(document.getElementById('next-change').disabled).toBe(true);
    expect(document.getElementById('prev-change').textContent).toBe('◀ Prev');
  });

  it('no longer offers a body search or a compare button', () => {
    expect(document.getElementById('log-in-bodies')).toBeNull();
  });
});
