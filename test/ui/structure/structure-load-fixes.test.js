'use strict';

/* A full reload (Refresh) behaves like the definition poll: it keeps the
 * selection on the elements that are still there, and a failed data read does
 * not blank the values. */

import { bootStructure, definition, clickRow, rowNames, selectedRowText, tick } from '../support/structure-page.js';

const steps = () => [
  { name: 'Intro', elements: [{ name: 'Greeting' }] },
  { name: 'Details', elements: [{ name: 'Amount' }] }
];

/* Makes every read of the data property fail. */
function failDataReads() {
  const real = global.chrome.devtools.inspectedWindow.eval;
  global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
    const callback = typeof a === 'function' ? a : b;
    const at = expression.lastIndexOf('("jsonDataStr","jsonDef"');
    const args = at > -1 ? JSON.parse(`[${expression.slice(at + 1, -1)}]`) : [];
    if (args[3] === 'jsonDataStr') callback(undefined, { isException: true, value: 'boom' });
    else real(expression, a, b);
  };
}

describe('Refresh', () => {
  it('keeps the selected element when the definition gained one above it', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    clickRow('Details');

    const edited = steps();
    edited[0].elements.unshift({ name: 'Inserted' });
    document.getElementById('main').jsonDef = JSON.stringify(definition({ steps: edited }));

    document.getElementById('struct-refresh').click();
    await tick();

    expect(rowNames().join('|')).toContain('Inserted');
    expect(selectedRowText()).toContain('Details');
  });

  it('keeps the last good data when the data read fails', async () => {
    await bootStructure({
      scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Greeting: 'hello' } } }]
    });
    // The data shows in the Valid column: with none read, it is blank.
    expect(rowNames().join('|')).toContain('Nothing stops Next on this step');

    failDataReads();
    document.getElementById('struct-refresh').click();
    await tick();

    expect(rowNames().join('|')).toContain('Nothing stops Next on this step');
  });
});
