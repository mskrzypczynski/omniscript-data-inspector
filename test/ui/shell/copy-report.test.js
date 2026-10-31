'use strict';

/* Copy report: the help's button that puts a short Markdown report on the
 * clipboard. */

import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const steps = () => [
  {
    name: 'Intro',
    elements: [
      { name: 'Email', type: 'Email', propSetMap: { required: true } },
      { name: 'Age', type: 'Number' }
    ]
  },
  { name: 'Details', elements: [{ name: 'Notes' }] }
];

let written;

beforeEach(() => {
  jest.useFakeTimers();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});

afterEach(() => {
  jest.useRealTimers();
  delete navigator.clipboard;
  document.querySelectorAll('.toast').forEach((node) => node.remove());
});

async function boot(data = { Intro: { Email: '', Age: 30 } }) {
  const booted = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  const { copyReport } = await import('../../../src/ui/copy-report.js');
  const { Shared } = booted;
  return { ...booted, copyReport, Shared };
}

async function copy(copyReport) {
  copyReport();
  await tick();
  return written[written.length - 1];
}

describe('Copy report', () => {
  it('lists the failed calls among those the tab captured', async () => {
    const { copyReport, Shared } = await boot();
    const failedCall = {
      id: 1, name: 'Order_Place', time: new Date(2024, 0, 1, 10, 42, 3), failure: 'HTTP 500', httpStatus: 500, state: 'SUCCESS'
    };
    Shared.setCalls(() => [failedCall]);
    const text = await copy(copyReport);
    expect(text).toContain('## Failed calls (last 1)');
    expect(text).toContain('- 10:42:03 `Order_Place` — HTTP 500');
  });

  it('follows All Apex calls: other Apex errors are listed only when the tab shows them', async () => {
    const { copyReport, Shared } = await boot();
    const time = new Date(2024, 0, 1, 10, 42, 3);
    Shared.setCalls(() => [
      { id: 1, name: 'Order_Place', omni: true, time, failure: 'HTTP 500', httpStatus: 500, state: 'SUCCESS' },
      { id: 2, name: 'LayoutController.get', omni: false, time, failure: 'HTTP 500', httpStatus: 500, state: 'SUCCESS' }
    ]);
    const text = await copy(copyReport);
    expect(text).toContain('`Order_Place`');
    expect(text).not.toContain('LayoutController');
    Shared.setOnlyOmni(() => false); // the tab's All Apex calls state
    expect(await copy(copyReport)).toContain('LayoutController.get');
    Shared.setOnlyOmni(() => true);
  });

  it('masks what a failed call quotes while Mask values is on', async () => {
    const { copyReport, Shared } = await boot();
    const { Mask } = await import('../../../src/ui/mask-setting.js');
    const box = document.getElementById('mask-values');
    Mask.mount(box);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    Shared.setCalls(() => [{
      id: 1, name: 'Order_Place', time: new Date(2024, 0, 1, 10, 0, 0), failure: 'x', state: 'SUCCESS', error: 'No plan for Ada Lovelace'
    }]);
    const text = await copy(copyReport);
    expect(text).toContain('Action error — <string>');
    expect(text).not.toContain('Ada Lovelace');
  });

  it('puts a toast up', async () => {
    const { copyReport } = await boot();
    await copy(copyReport);
    expect(document.querySelector('.toast').textContent).toBe('Copied report');
  });
});

