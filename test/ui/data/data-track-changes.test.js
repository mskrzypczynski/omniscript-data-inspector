'use strict';

/* The Track changes switch, in the Data toolbar next to Auto-refresh: ticked,
 * the Changes bar and the Changes view are there and marks are kept; unticked,
 * both are hidden and the marks are dropped. The amber flash of a changed
 * value does not depend on it, and neither does Advanced. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

async function change(value) {
  document.getElementById('a').jsonDataStr = JSON.stringify(value);
  document.getElementById('refresh').click();
  await tick();
}

const host = { id: 'a', tag: 'c-os', data: { n: 0 } };

describe('the change mark is not told by colour alone', () => {
  const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

  it('gives a changed Tree row a bold line number and a dot as well as the bar', () => {
    expect(css).toMatch(/\.row\.is-touched\[data-line\]::before\s*\{[^}]*font-weight:\s*700/);
    expect(css).toMatch(/\.row\.is-touched\[data-line\]::after\s*\{[^}]*content:\s*"•"/);
  });

  it('gives a changed Form row the same dot', () => {
    expect(css).toMatch(/\.data-form \.form-row\.is-touched::after\s*\{[^}]*content:\s*"•"/);
  });
});

describe('Track changes', () => {
  it('off: the flash is independent of Advanced too', async () => {
    await bootData({ advanced: true, hosts: [host] });
    await change({ n: 1 });
    expect(viewport().querySelector('.is-changed')).not.toBe(null);
    expect(viewport().querySelector('.is-touched')).toBe(null);
  });
});
