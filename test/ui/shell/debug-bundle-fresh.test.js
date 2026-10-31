'use strict';

/* The debug bundle holds what the page holds when the button is pressed, with
 * the time of that read, whatever the Data tab last drew. */

import { jest } from '@jest/globals';
import { bootData } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { buildDebugBundle } from '../../../src/core/shared/debug-bundle.js';

function readBlob(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); document.body.innerHTML = ''; });

describe('Debug bundle payload', () => {
  it('is read from the page at that moment, with readAt', async () => {
    const blobs = [];
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Step: { Name: 'Ada' } } }] });
    const live = document.getElementById('live');
    live.checked = false; // the tab will not pick the change up by itself
    live.dispatchEvent(new Event('change'));
    document.getElementById('a').jsonDataStr = JSON.stringify({ Step: { Name: 'Bea' } });

    const { saveDebugBundle } = await import('../../../src/ui/debug-bundle.js');
    const before = Date.now();
    saveDebugBundle();
    await tick();
    await tick();

    const bundle = JSON.parse(await readBlob(blobs[0]));
    expect(bundle.payload.value).toEqual({ Step: { Name: 'Bea' } });
    expect(new Date(bundle.payload.readAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('Debug bundle definition', () => {
  const def = {
    bpType: 'Demo', bpSubType: 'flow', bpLang: 'English', asIndex: 0,
    children: [{ name: 'Intro', type: 'Step', indexInParent: 0, propSetMap: { label: 'Intro' },
      children: [{ eleArray: [{ name: 'Name', type: 'Text', indexInParent: 0, propSetMap: { label: 'Name', defaultValue: 'Ada', response: 'Ada Example' } }] }] }]
  };

  async function save(masked) {
    const blobs = [];
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await bootData({ hosts: [{ id: 'a', tag: 'c-first', data: { Intro: { Name: 'Ada' } }, def }] });
    const box = document.getElementById('mask-values');
    box.checked = masked;
    box.dispatchEvent(new Event('change'));
    const { saveDebugBundle } = await import('../../../src/ui/debug-bundle.js');
    saveDebugBundle();
    await tick();
    await tick();
    return JSON.parse(await readBlob(blobs[0]));
  }

  it('masks the answers it holds while Mask values is on, and keeps the names and keys', async () => {
    const bundle = await save(true);
    expect(bundle.masked).toBe(true);
    expect(bundle.definition.raw).toContain('"name":"Name"');
    expect(bundle.definition.raw).not.toContain('Ada');
    const field = JSON.parse(bundle.definition.raw).children[0].children[0].eleArray[0];
    expect(field.propSetMap.defaultValue).toBe('<string>');
    expect(field.propSetMap.response).toBe('<string>');
  });

  it('keeps them as the page holds them while Mask values is off', async () => {
    const bundle = await save(false);
    expect(JSON.parse(bundle.definition.raw).children[0].children[0].eleArray[0].propSetMap.response).toBe('Ada Example');
  });
});

describe('buildDebugBundle readAt', () => {
  const payload = { prop: 'jsonDataStr', raw: '{"a":1}', data: { a: 1 } };

  it('writes the read time as ISO text when given', () => {
    const bundle = buildDebugBundle({ payload: { ...payload, readAt: new Date('2030-01-02T03:04:05.000Z') } });
    expect(bundle.payload.readAt).toBe('2030-01-02T03:04:05.000Z');
  });

  it('leaves it out when there is none', () => {
    expect(buildDebugBundle({ payload }).payload).toEqual({ prop: 'jsonDataStr', value: { a: 1 } });
  });
});
