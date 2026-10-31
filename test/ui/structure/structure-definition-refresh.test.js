'use strict';

/* Editing the script in the Designer: the Structure tab picks up the new
 * definition by itself, and only redraws when the structure differs. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, rowNames, selectedRowText, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  { name: 'Intro', elements: [{ name: 'Greeting' }] },
  { name: 'Details', elements: [{ name: 'Amount' }] }
];

const setDefinition = (def) => { document.getElementById('main').jsonDef = JSON.stringify(def); };

async function pulses(count) {
  jest.advanceTimersByTime(PULSE_MS * count);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('definition changes while the tab is open', () => {
  it('shows an added element after about three pulses and keeps the selection', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    clickRow('Details');

    const edited = steps();
    edited[0].elements.unshift({ name: 'Inserted' }); // shifts the keys of everything below
    setDefinition(definition({ steps: edited }));

    await pulses(2);
    expect(rowNames().join('|')).not.toContain('Inserted');
    await pulses(1);
    expect(rowNames().join('|')).toContain('Inserted');
    expect(selectedRowText()).toContain('Details');
  });

  it('keeps a folded section folded', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    document.getElementById('struct-collapse').click();
    expect(rowNames().join('|')).not.toContain('Greeting');

    const edited = steps();
    edited[1].elements.push({ name: 'Extra' });
    setDefinition(definition({ steps: edited }));
    await pulses(3);

    expect(rowNames().join('|')).not.toContain('Greeting');
    expect(rowNames().join('|')).not.toContain('Extra'); // inside a folded step
    document.getElementById('struct-expand').click();
    expect(rowNames().join('|')).toContain('Extra');
  });

  it('does not redraw when only runtime fields changed', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    const row = [...document.querySelectorAll('#struct-list .el-row')].find((r) => r.textContent.includes('Greeting'));

    const running = definition({ steps: steps() });
    running.children[1].children[0].eleArray[0].bShow = false;
    running.children[0].bShow = false;
    setDefinition(running);
    await pulses(3);

    const same = [...document.querySelectorAll('#struct-list .el-row')].find((r) => r.textContent.includes('Greeting'));
    expect(same).toBe(row);
  });

  it('picks up an edit to help text, which no column shows', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    clickRow('Greeting');
    expect(document.querySelector('#struct-detail').textContent).not.toContain('Say hello');

    const edited = steps();
    edited[0].elements[0].propSetMap = { helpText: 'Say hello' };
    setDefinition(definition({ steps: edited }));
    await pulses(3);

    expect(document.querySelector('#struct-detail').textContent).toContain('Say hello'); // its Properties tab now lists the help text
  });

  it('does not redraw when nothing changed', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    const row = document.querySelector('#struct-list .el-row.is-selected');
    await pulses(6);
    expect(document.querySelector('#struct-list .el-row.is-selected')).toBe(row);
  });

  it('keeps what it shows while the definition does not parse', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    document.getElementById('main').jsonDef = '{"children": [';
    await pulses(3);
    expect(rowNames().join('|')).toContain('Greeting');
    expect(document.querySelector('#struct-detail').textContent).not.toContain('not valid JSON');
  });
});
