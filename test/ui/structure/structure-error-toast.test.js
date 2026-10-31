'use strict';

/* A toast when Set Errors start to fire on the current step while another tab is on screen. */

import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  { name: 'Intro', elements: [
    { name: 'Age', type: 'Number' },
    { name: 'TooYoung', type: 'Set Errors', propSetMap: {
      elementErrorMap: { Age: 'Too young' },
      show: { group: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: '18' }] } }
    } },
    { name: 'Odd', type: 'Set Errors', propSetMap: {
      elementErrorMap: { Age: 'Odd' },
      show: { group: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: '=10 + 8' }] } }
    } }
  ] }
];

const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
/* Every toast shown so far (a toast leaves again after a few seconds). */
let shown = [];
let observer;
const toasts = () => shown;

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

async function boot(age = 30) {
  const page = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Age: age } } }] });
  return page;
}

beforeEach(() => {
  jest.useFakeTimers();
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  shown = [];
  observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.classList && node.classList.contains('toast')) shown.push(node.textContent);
  })));
  observer.observe(document.body, { childList: true });
});
afterEach(() => { observer.disconnect(); jest.useRealTimers(); });

describe('Set Errors toast', () => {
  it('tells the user when errors start to fire on the current step while Structure is not shown', async () => {
    const { Structure } = await boot();
    Structure.hide();
    await advance(PULSE_MS);
    expect(toasts()).toEqual([]);

    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    expect(toasts()).toEqual(['Set Errors fire on Intro: 1']);
  });

  it('says nothing while the Structure tab is on screen, and does not repeat on its return', async () => {
    const { Structure } = await boot();
    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    expect(toasts()).toEqual([]);

    Structure.hide();
    await advance(PULSE_MS);
    expect(toasts()).toEqual([]);
  });

  it('toasts once per transition: not while the errors go on', async () => {
    const { Structure } = await boot();
    Structure.hide();
    await advance(PULSE_MS);
    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    setData({ Intro: { Age: 6 } });
    await advance(PULSE_MS);
    await advance(PULSE_MS);
    expect(toasts()).toHaveLength(1);
  });

  it('toasts at most once in 30 seconds', async () => {
    const { Structure } = await boot();
    Structure.hide();
    await advance(PULSE_MS);
    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    expect(toasts()).toHaveLength(1);

    setData({ Intro: { Age: 30 } });
    await advance(PULSE_MS);
    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    expect(toasts()).toHaveLength(1); // too soon after the first

    setData({ Intro: { Age: 30 } });
    await advance(30000);
    setData({ Intro: { Age: 5 } });
    await advance(PULSE_MS);
    expect(toasts()).toEqual(['Set Errors fire on Intro: 1', 'Set Errors fire on Intro: 1']);
  });

  it('does not count an error that rests only on a formula estimate', async () => {
    const { Structure } = await boot();
    Structure.hide();
    await advance(PULSE_MS);
    setData({ Intro: { Age: 15 } }); // TooYoung fires for certain; Odd (age < 10 + 8) is an estimate
    await advance(PULSE_MS);
    expect(toasts()).toEqual(['Set Errors fire on Intro: 1']);
  });

  it('starts from what is already firing when it first looks', async () => {
    const { Structure } = await boot(5);
    Structure.hide();
    await advance(3 * PULSE_MS);
    expect(toasts()).toEqual([]);
  });
});
