'use strict';

/* Budget: the Calls tab holds the 500 calls it keeps (captured while
 * another tab was on screen, as they usually are), draws the whole list when it
 * is shown, takes one more call into a full list, and answers a click on a row
 * and a filter, each in the time allowed. Every new call redraws the list, so
 * what a person waits for is one of those redraws at 500 calls, not the 500
 * together. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../ui/support/panel-fixture.js';
import { auraNetworkEntry } from '../ui/support/aura-entry.js';
import { BUDGET_MS, timed } from './budget.js';

const CALLS = 500;

const callNumber = (i) => auraNetworkEntry({
  actionId: String(i), method: `Method_${i % 25}`, input: JSON.stringify({ AccountId: `001${i}`, Page: i }),
  startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, 0, i * 10)).toISOString()
});

describe(`Calls tab with ${CALLS} calls`, () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../src/ui/actions-tab.js'));
    RemoteActions.mount();
  });

  afterEach(() => { document.body.innerHTML = ''; });

  const rows = () => document.querySelectorAll('#log-list .log-row:not(.log-head)');
  const capture = (i) => listeners.onRequestFinished.forEach((listener) => listener(callNumber(i)));

  it('draws the list, takes one more call, selects one and filters within the budget', async () => {
    for (let i = 1; i < CALLS; i++) capture(i); // the tab is hidden: only the badge follows
    expect(rows()).toHaveLength(0);

    const show = await timed(async () => RemoteActions.show());
    expect(rows()).toHaveLength(CALLS - 1);
    expect(show).toBeLessThan(BUDGET_MS);

    const oneMore = await timed(async () => capture(CALLS));
    expect(rows()).toHaveLength(CALLS);
    expect(oneMore).toBeLessThan(BUDGET_MS);

    const select = await timed(async () => { rows()[CALLS - 1].click(); });
    expect(rows()[CALLS - 1].classList.contains('is-selected')).toBe(true);
    expect(select).toBeLessThan(BUDGET_MS);

    const filter = await timed(async () => {
      const box = document.getElementById('log-filter');
      box.value = 'Method_7';
      box.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 200)); // the box waits a moment before it filters
    });
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThan(CALLS);
    expect(filter).toBeLessThan(BUDGET_MS);
    process.stderr.write(`Calls, ${CALLS} calls: show ${Math.round(show)} ms, one more call ${Math.round(oneMore)} ms, ` +
      `select ${Math.round(select)} ms, filter ${Math.round(filter)} ms\n`);
  });
});
