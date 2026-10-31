'use strict';

/* What the Structure tab does when the page changes around it: a host coming
 * or going, a selection changed in the middle of a load, data that does not
 * parse. */

import {
  bootStructure, definition, addScript, drain, pickScript, clickRow, rowNames, selectedRowText, tick
} from '../support/structure-page.js';

const mainDef = () => definition({
  steps: [
    { name: 'Intro', elements: [{ name: 'Greeting' }] },
    { name: 'Details', elements: [{ name: 'Amount' }] }
  ],
  asIndex: 0
});

describe('a host appearing or vanishing', () => {
  it('keeps the step picked by hand and the folds when the selected script is unchanged', async () => {
    const { Targets } = await bootStructure({ scripts: [{ id: 'main', def: mainDef() }] });
    expect(selectedRowText()).toContain('Intro'); // Follow current step selected the current step

    clickRow('Details');
    document.getElementById('struct-collapse').click();
    const folded = rowNames().length;

    /* A child element rendered on the next step exposes the same properties. */
    addScript({ id: 'child-1', def: mainDef(), parent: document.getElementById('main') });
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();

    expect(selectedRowText()).toContain('Details');
    expect(rowNames().length).toBe(folded);
  });

  it('starts over when the selected script is a different one', async () => {
    const other = definition({ type: 'other', steps: [{ name: 'Start' }] });
    const { Targets } = await bootStructure({ scripts: [{ id: 'main', def: mainDef() }] });
    clickRow('Details');

    document.getElementById('main').remove();
    addScript({ id: 'second', def: other });
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();

    expect(selectedRowText()).toContain('Start');
    expect(rowNames().join('|')).not.toContain('Details');
  });
});

describe('overlapping loads', () => {
  it('shows the newest selection even when an older load finishes last', async () => {
    const one = definition({ type: 'one', steps: [{ name: 'OneStep' }] });
    const two = definition({ type: 'two', steps: [{ name: 'TwoStep' }] });
    const { page } = await bootStructure({ scripts: [{ id: 'one', def: one }, { id: 'two', def: two }] });
    expect(rowNames().join('|')).toContain('OneStep');

    page.hold = true;
    pickScript(1); // slow load of "two"
    pickScript(0); // newer load of "one"

    /* Answer the newest load completely, then let the older one arrive. */
    page.release([1]);
    page.release([1]);
    page.release([1]);
    page.hold = false;
    page.release();
    drain(page);
    await tick();

    expect(rowNames().join('|')).toContain('OneStep');
    expect(rowNames().join('|')).not.toContain('TwoStep');
  });
});

describe('data that is not valid JSON', () => {
  it('says so in the status bar after a load', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: mainDef(), data: '{not json' }] });
    expect(document.getElementById('status-right').textContent).toContain('could not parse data');
  });
});
