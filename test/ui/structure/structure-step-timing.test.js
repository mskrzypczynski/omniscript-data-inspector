'use strict';

/* Time on a step and the calls made during it, in the Structure detail pane. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  { name: 'Intro', elements: [{ name: 'Greeting' }] },
  { name: 'Details', elements: [{ name: 'Amount' }] }
];

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('step timing', () => {
  it('shows no timing for an ordinary field', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    clickRow('Greeting');
    expect(document.querySelector('.detail-timing')).toBeNull();
  });

  it('exposes the position to the other tabs', async () => {
    const { Shared } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    expect(Shared.step()).toMatchObject({ name: 'Intro', asIndex: 0 });
    expect(Shared.step().visits).toHaveLength(1);
  });

  it('starts over for another script', async () => {
    const other = definition({ type: 'other', steps: [{ name: 'Start' }] });
    const { Shared } = await bootStructure({
      scripts: [{ id: 'main', def: definition({ steps: steps() }) }, { id: 'second', def: other }]
    });
    await advance(5 * PULSE_MS);
    const select = document.getElementById('target');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await tick();
    expect(Shared.step().visits.map((visit) => visit.name)).toEqual(['Start']);
  });
});
