'use strict';

/* The Data status line counts embedded scripts that are scripts. A script of
 * forty elements is forty hosts on the page (every element exposes the
 * properties of its parent), and that is not "forty embedded scripts hidden". */

import { bootData, addHost } from '../support/data-page.js';
import { definition, tick } from '../support/structure-page.js';

const $ = (id) => document.getElementById(id);
const left = () => $('status-left').textContent;
const fullDef = (type, subType) => definition({ type, subType, steps: [{ name: 'Step1', elements: [] }] });

function elementsOf(parent, count) {
  for (let i = 0; i < count; i++) {
    addHost({ id: `el${i}`, parent, data: { i }, def: { type: 'Text', name: `T${i}`, propSetMap: { label: 'x' } } });
  }
}

describe('Data status line and hidden hosts', () => {
  it('says nothing about embedded scripts for element hosts, and keeps their count in the tooltip', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'main', tag: 'c-quote', data: { Step1: {} }, def: fullDef('Sales', 'Quote') }] });
    elementsOf($('main'), 40);
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();

    expect(left()).toMatch(/^Sales\/Quote\/English · [\d.]+ (B|KB)$/);
    expect(left()).not.toContain('embedded script');
    expect($('status-left').title).toContain('40 other components of a listed script hidden');
    expect($('status-left').title).toContain('1 OmniScript listed.');
  });

  it('counts a nested whole script as an embedded script, in the line', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'main', tag: 'c-quote', data: { Step1: {} }, def: fullDef('Sales', 'Quote') }] });
    elementsOf($('main'), 3);
    addHost({ id: 'inner', parent: $('main'), data: { z: 1 }, def: fullDef('Sales', 'Inner') });
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();

    expect(left()).toContain('1 embedded script hidden');
    expect($('status-left').title).toContain('3 other components of a listed script hidden');
  });

  it('says nothing is hidden once Embedded scripts is ticked', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'main', tag: 'c-quote', data: { Step1: {} }, def: fullDef('Sales', 'Quote') }] });
    elementsOf($('main'), 3);
    $('show-nested').click();
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();
    expect(left()).not.toContain('hidden');
    expect($('status-left').title).not.toContain('components of a listed script hidden');
  });
});
