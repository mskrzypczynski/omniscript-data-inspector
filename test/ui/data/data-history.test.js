'use strict';

/* The Data tab feeds the panel-wide payload history on every read, whatever
 * not, and the compare panel and Shared.payload() read from it. */

import { jest } from '@jest/globals';
import { bootData, pickScript } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

async function change(id, value) {
  document.getElementById(id).jsonDataStr = JSON.stringify(value);
  document.getElementById('refresh').click();
  await tick();
}

const history = async () => (await import('../../../src/ui/payload-history.js')).PayloadHistory.list();

describe('shared payload history from the Data tab', () => {
  it('records every distinct read, stamped with the step', async () => {
    const { Shared } = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { n: 0 } }] });
    Shared.setStep(() => ({ key: 's1', name: 'Step1', asIndex: 0, visits: [{ key: 's1', from: 5, to: null }] }));
    await change('a', { n: 1 });
    await change('a', { n: 1 });
    await change('a', { n: 2 });
    const list = await history();
    expect(list.map((s) => s.raw)).toEqual(['{"n":0}', '{"n":1}', '{"n":2}']);
    expect(list[2].step).toEqual({ name: 'Step1', visitFrom: 5 });
    expect(Shared.payload().history).toBe(list);
  });

  it('is emptied when another script is picked, and when the property changes', async () => {
    await bootData({ hosts: [
      { id: 'a', tag: 'c-os', data: { n: 0 } },
      { id: 'b', tag: 'c-os', data: { m: 0 } }
    ] });
    await change('a', { n: 1 });
    expect((await history()).length).toBe(2);
    pickScript(1);
    await tick();
    expect((await history()).map((s) => s.raw)).toEqual(['{"m":0}']);

    const { Settings } = await import('../../../src/ui/settings.js');
    Settings.apply({ dataProp: 'other' }); // what the Reading field in Settings does
    expect(await history()).toEqual([]);
  });

  it('starts again after the page navigated', async () => {
    const { page } = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Page: 'one' } }] });
    document.getElementById('a').jsonDataStr = JSON.stringify({ Page: 'two' });
    page.navigated.forEach((fn) => fn());
    await tick();
    expect((await history()).map((s) => s.raw)).toEqual(['{"Page":"two"}']);
  });
});
