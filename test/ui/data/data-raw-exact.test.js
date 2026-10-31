'use strict';

/* Copy JSON, Save file and the Raw view show the page's own value: key order
 * and digits a parse would change are kept. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

const RAW = '{"b":1,"10":2,"2":3,"id":9007199254740993}';

let written;

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

/* Copy JSON lives in the Export menu. */
function copyJson() {
  document.getElementById('data-export').click();
  [...document.querySelectorAll('.ctx-menu .ctx-item')].find((item) => item.textContent === 'Copy JSON').click();
}

async function boot() {
  const booted = await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: RAW }] });
  return booted;
}

describe('Copy JSON', () => {
  it('writes the page\'s digits and key order', async () => {
    await boot();
    copyJson();
    await tick();
    expect(written).toEqual(['{\n  "b": 1,\n  "10": 2,\n  "2": 3,\n  "id": 9007199254740993\n}']);
  });

  it('writes placeholders while Mask values is on', async () => {
    const { Mask } = await boot();
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(Mask.on()).toBe(true);
    copyJson();
    await tick();
    expect(written[0]).not.toContain('9007199254740993');
    expect(written[0]).toContain('<number>');
  });
});

describe('Raw view', () => {
  it('shows the exact digits and says so in the status bar', async () => {
    await boot();
    document.getElementById('view-raw').click();
    expect(viewport().textContent).toContain('9007199254740993');
    expect(document.getElementById('status-right').textContent).toContain('data has numbers above 2^53; Raw view is exact');
  });

  it('has the same number of lines as the Tree', async () => {
    await boot();
    const treeLines = [...viewport().querySelectorAll('.row')].map((row) => Number(row.dataset.line));
    document.getElementById('view-raw').click();
    const rawLines = viewport().querySelectorAll('.raw-line').length;
    expect(rawLines).toBe(Math.max(...treeLines));
  });
});

describe('Raw view with integer-like keys among others', () => {
  it('puts each key on the line number the Tree gives it', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: '{"b":{"x":1},"1":2,"a":3}' }] });
    document.getElementById('expand').click();
    const treeLine = (key) => Number([...viewport().querySelectorAll('.row')].find((row) => row.querySelector(':scope > .k')?.textContent === key).dataset.line);
    const lines = {};
    ['b', '1', 'a', 'x'].forEach((key) => { lines[key] = treeLine(key); });
    document.getElementById('view-raw').click();
    const raw = [...viewport().querySelectorAll('.raw-line')].map((line) => line.textContent);
    Object.entries(lines).forEach(([key, line]) => {
      expect(raw[line - 1]).toContain(`"${key}"`);
    });
  });
});
