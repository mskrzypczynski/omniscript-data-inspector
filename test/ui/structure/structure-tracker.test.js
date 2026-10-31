'use strict';

/* Step timing must not depend on which tab is open: the tracker polls while
 * the panel is on screen. */

import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  { name: 'Intro', elements: [{ name: 'Greeting' }] },
  { name: 'Details', elements: [{ name: 'Amount' }] }
];

const moveTo = (asIndex) => {
  document.getElementById('main').jsonDef = JSON.stringify(definition({ steps: steps(), asIndex }));
};

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('step tracker', () => {
  it('dates a step change when it happens, while another tab is open', async () => {
    const { Shared, Structure } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    Structure.hide(); // the user switched to the Data tab
    const start = Date.now();

    await advance(5 * PULSE_MS);
    moveTo(1);
    await advance(PULSE_MS);

    const { visits, name } = Shared.step();
    expect(name).toBe('Details');
    expect(visits.map((visit) => visit.name)).toEqual(['Intro', 'Details']);
    /* Intro ended within one tick of the move, not when the tab came back. */
    expect(visits[0].to - start).toBeLessThanOrEqual(6 * PULSE_MS);
    expect(visits[1].from).toBe(visits[0].to);
  });

  it('records every payload it reads in the shared history, stamped with the step, from any tab', async () => {
    const { Structure } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    const { PayloadHistory } = await import('../../../src/ui/payload-history.js');
    Structure.hide(); // the user is on another tab
    PayloadHistory.clear();

    document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Greeting: 'a' } });
    await advance(PULSE_MS);
    moveTo(1);
    document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Greeting: 'a' }, Details: { Amount: 1 } });
    await advance(PULSE_MS);

    const list = PayloadHistory.list();
    expect(list.map((snapshot) => snapshot.step.name)).toEqual(['Intro', 'Details']);
    expect(JSON.parse(list[1].raw).Details.Amount).toBe(1);
    expect(Number.isFinite(list[1].step.visitFrom)).toBe(true);
  });

  it('does not look while the panel is hidden, and looks at once when it is shown again', async () => {
    const { Shared, Structure } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    Structure.hide();
    Structure.setVisible(false);
    moveTo(1);
    await advance(10 * PULSE_MS);
    expect(Shared.step().name).toBe('Intro');

    Structure.setVisible(true);
    await tick();
    expect(Shared.step().name).toBe('Details');
  });

  it('loads the elements by itself when the Structure tab was never opened', async () => {
    const { Shared } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }) }] });
    expect(Shared.elements().length).toBeGreaterThan(0);
  });
});
