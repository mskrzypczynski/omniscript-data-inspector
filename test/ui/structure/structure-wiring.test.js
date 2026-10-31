'use strict';

/* The Calls tab says what an action sends and where the answer lands. */

import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Customer' },
  { name: 'Lookup', type: 'Integration Procedure Action', propSetMap: {
    integrationProcedureKey: 'Acme_Find',
    sendJSONPath: 'Intro:Customer',
    sendJSONNode: 'Payload',
    extraPayload: { Mode: 'full' },
    responseJSONNode: 'Intro:Found',
    responseJSONPath: 'data',
    failureNextStep: 'Retry'
  } },
  { name: 'Bare', type: 'DataRaptor Extract Action', propSetMap: { bundle: 'Acme_Bundle' } },
  { name: 'Far', type: 'Integration Procedure Action', propSetMap: {
    integrationProcedureKey: 'Acme_Far', sendJSONPath: 'Intro:Nope', responseJSONNode: 'Intro:Later'
  } }
] }];

const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const lines = () => [...document.querySelectorAll('#struct-detail .wiring-line')].map((n) => n.textContent);

async function open(name, data = { Intro: { Customer: { Id: 1 }, Found: { Rows: 2 } } }) {
  const page = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  const jumps = [];
  page.Nav.on('data', (request) => jumps.push(request));
  clickRow(name);
  return { ...page, jumps };
}

describe('Calls tab wiring', () => {
  it('is available before any call was captured, and says what it sends and where the answer lands', async () => {
    await open('Lookup');
    const calls = tabButton('Calls');
    expect(calls.disabled).toBe(false);
    calls.click();
    expect(lines()).toEqual([
      'Sends: Intro:Customer as Payload, plus extra payload: Mode',
      'Response node: Intro:Found (from data of the response)',
      'On failure goes to: Retry'
    ]);
    expect(document.querySelector('.wiring-remote').textContent).toBe('Calls Acme_Find');
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('No captured call matches this element yet.');
  });

  it('opens the place in the Data tab when the data holds it', async () => {
    const { jumps } = await open('Lookup');
    tabButton('Calls').click();
    const buttons = [...document.querySelectorAll('.wiring-line .jump-link')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Intro:Customer', 'Intro:Found']);
    buttons[1].click();
    expect(jumps).toEqual([{ segments: ['Intro', 'Found'] }]);
  });

  it('shows a place the data does not hold as text, saying so', async () => {
    const { jumps } = await open('Far');
    tabButton('Calls').click();
    expect(document.querySelectorAll('.wiring-line .jump-link')).toHaveLength(0);
    expect(lines()).toEqual([
      'Sends: Intro:Nope  (not in the data now)',
      'Response node: Intro:Later  (not in the data now)'
    ]);
    expect(jumps).toEqual([]);
  });

  it('says the whole data is sent and no response node is set for a bare action', async () => {
    await open('Bare');
    tabButton('Calls').click();
    expect(lines()).toEqual(['Sends: the whole data', 'Response node: none set · the answer lands in the data root']);
    expect(document.querySelectorAll('.wiring-line .jump-link')).toHaveLength(0);
    expect([...document.querySelectorAll('.wiring-line')].every((line) => !line.title || line.title.length > 20)).toBe(true);
    expect(document.querySelectorAll('.wiring-line')[1].title).toContain('data root');
  });

  it('does not make a Calls tab for an element that calls nothing', async () => {
    await open('Customer');
    expect(tabButton('Calls')).toBeUndefined();
  });
});
