'use strict';

/* A message written as a formula comes to a text that holds org data (a typed
 * name). It is shown in the Validation tab, and it must not leave the panel in
 * Copy report or in the debug bundle's blockers, with Mask values on. Names and
 * values here are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [{
  name: 'Intro',
  elements: [
    { name: 'Age', type: 'Number' },
    { name: 'Name', type: 'Text' },
    {
      name: 'CheckAge',
      type: 'Set Errors',
      propSetMap: {
        elementErrorMap: { Age: '="Sorry " & %Intro:Name% & ", you are too young."' },
        show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] }
      }
    }
  ]
}];

const data = { Intro: { Age: 12, Name: 'Ada Lovelace' } };
let written;

beforeEach(() => {
  jest.useFakeTimers();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
});
afterEach(() => {
  jest.useRealTimers();
  delete navigator.clipboard;
  document.querySelectorAll('.toast').forEach((node) => node.remove());
});

async function boot({ masked }) {
  const page = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  const { Mask } = await import('../../../src/ui/mask-setting.js');
  Mask.mount(document.getElementById('mask-values'));
  const box = document.getElementById('mask-values');
  box.checked = masked;
  box.dispatchEvent(new Event('change'));
  const { copyReport } = await import('../../../src/ui/copy-report.js');
  return { ...page, Mask, copyReport };
}

describe.each([[true], [false]])('a message formula that quotes data (Mask values %s)', (masked) => {
  it('shows the evaluated text in the Validation tab only', async () => {
    await boot({ masked });
    clickRow('Intro');
    [...document.querySelectorAll('#struct-detail .seg-btn')].find((b) => b.textContent.startsWith('Validation')).click();
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('Sorry Ada Lovelace, you are too young.');
  });
});
