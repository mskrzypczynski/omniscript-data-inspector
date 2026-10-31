'use strict';

/* Which script's data the Data tab shows: the host list can shift between a
 * scan and a read, and answers can arrive after the user moved on. */

import { jest } from '@jest/globals';
import { bootData, addHost, viewport, pickScript } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

describe('hostFetch identity check', () => {
  it('answers missing when index N is no longer the host that was scanned', async () => {
    const { hostScan, hostFetch } = await import('../../../src/ui/targets.js');
    const a = addHost({ id: 'a', tag: 'c-first', data: { who: 'A' } });
    addHost({ id: 'b', tag: 'c-second', data: { who: 'B' } });

    const scanned = hostScan('jsonDataStr', 'jsonDef').hosts;
    expect(scanned.map((host) => host.label)).toEqual(['c-first#a', 'c-second#b']);

    // Script A renders a child that exposes the property too: B moves to index 2.
    const child = document.createElement('c-child');
    child.jsonDataStr = JSON.stringify({ who: 'child' });
    a.appendChild(child);

    const result = hostFetch('jsonDataStr', 'jsonDef', 1, 'jsonDataStr', '', null, null, 'c-second#b');
    expect(result.missing).toBe(true);
    expect(result.value).toBe(null);
  });

  it('returns the label of the host it read', async () => {
    const { hostFetch } = await import('../../../src/ui/targets.js');
    addHost({ id: 'a', tag: 'c-first', data: { who: 'A' } });
    const result = hostFetch('jsonDataStr', 'jsonDef', 0, 'jsonDataStr', '', null, null, 'c-first#a');
    expect(result.label).toBe('c-first#a');
    expect(JSON.parse(result.value)).toEqual({ who: 'A' });
  });
});

describe('hostScan and hostFetch name an element alike', () => {
  it('give the same label for an element with an id, a class or neither', async () => {
    const { hostScan, hostFetch } = await import('../../../src/ui/targets.js');
    addHost({ id: 'one', tag: 'c-a', data: { n: 1 } });
    const withClass = addHost({ tag: 'c-b', data: { n: 2 } });
    withClass.className = '  first second ';
    addHost({ tag: 'c-c', data: { n: 3 } });

    const scanned = hostScan('jsonDataStr', 'jsonDef').hosts.map((host) => host.label);
    expect(scanned).toEqual(['c-a#one', 'c-b.first', 'c-c']);
    const fetched = scanned.map((label, index) => hostFetch('jsonDataStr', 'jsonDef', index, 'jsonDataStr', '', null, null, label));
    expect(fetched.map((result) => result.label)).toEqual(scanned);
    expect(fetched.every((result) => !result.missing)).toBe(true);
  });
});

describe('Data tab after the host list shifts under it', () => {
  it('never shows the child element of script A as the data of script B', async () => {
    const { Targets } = await bootData({
      hosts: [{ id: 'a', tag: 'c-first', data: { who: 'A' } }, { id: 'b', tag: 'c-second', data: { who: 'B' } }]
    });
    pickScript(1);
    await tick();
    expect(viewport().textContent).toContain('"B"');

    const child = document.createElement('c-child');
    child.jsonDataStr = JSON.stringify({ who: 'child' });
    document.getElementById('a').appendChild(child);

    // The read goes out with B's old index; it must not come back as the child's value.
    const answers = [];
    await new Promise((resolve) => Targets.fetch('jsonDataStr', (value) => { answers.push(value); resolve(); }));
    await tick();
    expect(answers).toEqual([null]);
    expect(viewport().textContent).not.toContain('child');
  });
});

describe('Data tab drops answers for a script or property it has left', () => {
  it('ignores a held read that returns after another script was picked', async () => {
    const { page } = await bootData({
      hosts: [{ id: 'a', tag: 'c-first', data: { who: 'A' } }, { id: 'b', tag: 'c-second', data: { who: 'B' } }]
    });
    expect(viewport().textContent).toContain('"A"');

    page.hold = true;
    document.getElementById('refresh').click(); // read of A, held
    pickScript(1); // read of B, held
    page.hold = false;
    expect(page.held.length).toBeGreaterThanOrEqual(2);

    // The answer for B arrives first, then the late one for A.
    page.release(page.held.map((_, i) => i).reverse());
    await tick();

    expect(viewport().textContent).toContain('"B"');
    expect(viewport().textContent).not.toContain('"A"');
  });

  it('ignores a held read that returns after the property was changed', async () => {
    const { page } = await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { who: 'A' } }] });
    document.getElementById('a').other = JSON.stringify({ from: 'other' });

    page.hold = true;
    document.getElementById('refresh').click(); // jsonDataStr, held
    const { Settings } = await import('../../../src/ui/settings.js');
    Settings.apply({ dataProp: 'other' }); // what the Reading field in Settings does
    page.hold = false;
    page.release(page.held.map((_, i) => i).reverse());
    await tick();

    expect(viewport().textContent).not.toContain('"A"');
  });
});
