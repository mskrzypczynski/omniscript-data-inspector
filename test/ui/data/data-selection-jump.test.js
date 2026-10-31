'use strict';

/* When the selected script disappears and the top bar falls back to
 * another, the Data tab must start afresh: no payload, marks or history of
 * the old script carried across to the new one. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

describe('Data tab when the selected script is gone', () => {
  it('shows the other script without marking the difference as a change', async () => {
    const { Targets, Shared } = await bootData({
      track: true,
      hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }, { id: 'b', tag: 'c-second', data: { Step: { Name: 'Bea' } } }]
    });
    expect(viewport().textContent).toContain('Ada');

    document.getElementById('a').remove();
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();

    expect(viewport().textContent).toContain('Bea');
    expect(viewport().textContent).not.toContain('Ada');
    expect(viewport().querySelector('.is-changed')).toBe(null);
    expect(viewport().querySelector('.is-touched')).toBe(null);
    expect(Shared.payload().history).toHaveLength(1);
  });

  it('keeps the data when the same script is still there', async () => {
    const { Targets, Shared } = await bootData({
      track: true,
      hosts: [{ id: 'a', tag: 'c-first', data: { n: 1 } }, { id: 'b', tag: 'c-second', data: { n: 2 } }]
    });
    document.getElementById('a').jsonDataStr = JSON.stringify({ n: 5 });
    await new Promise((resolve) => Targets.refresh(resolve));
    document.getElementById('refresh').click();
    await tick();
    expect(Shared.payload().history).toHaveLength(2);
  });
});

describe('Data tab after a navigation', () => {
  it('does not diff the new page against the old one', async () => {
    const { page, Shared } = await bootData({ track: true, hosts: [{ id: 'a', tag: 'c-first', data: { Page: 'one' } }] });
    expect(viewport().textContent).toContain('one');

    document.getElementById('a').jsonDataStr = JSON.stringify({ Page: 'two' });
    page.navigated.forEach((fn) => fn());
    await tick();

    expect(viewport().textContent).toContain('two');
    expect(viewport().querySelector('.is-changed')).toBe(null);
    expect(viewport().querySelector('.is-touched')).toBe(null);
    expect(Shared.payload().history).toHaveLength(1);
  });
});
