'use strict';

/* Chained Integration Procedures in the Calls list: one row for the
 * chain, hops under it on request, a detail pane that joins the first hop's
 * input to the last hop's output, ticks that cover the hops, and an export
 * that names the chain. The grouping rules are in test/core/actions-chains. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: chained calls', () => {
  let RemoteActions;
  let listeners;
  let seq;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
    seq = 0;
  });

  /* A hop of the procedure Order_Place, one second after the last. */
  function hop({ at, method = 'Order_Place', options = { chainable: true }, output, errorInAction, time = 400, input } = {}) {
    seq += 1;
    // Silent hops are tied by a token each answer hands to the next call.
    const sent = input || { Hop: seq, resume: `handle-${seq}` };
    const answer = { ...(output || { ok: true }), handle: `handle-${seq + 1}` };
    const entry = auraNetworkEntry({
      actionId: String(seq), method, options, output: answer, errorInAction, time, input: JSON.stringify(sent),
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, at === undefined ? seq : at)).toISOString()
    });
    listeners.onRequestFinished.forEach((listener) => listener(entry));
  }

  const list = () => document.getElementById('log-list');
  const rows = () => [...list().querySelectorAll('.log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const tab = (name) => [...detail().querySelectorAll('.seg-btn')].find((button) => button.textContent === name);
  const threeHops = () => {
    hop({ time: 700 });
    hop({ time: 600 });
    hop({ options: {}, time: 800 });
  };

  it('shows the calls of a chain as one row with the chain tag and the added-up time', () => {
    threeHops();
    expect(rows()).toHaveLength(1);
    const row = rows()[0];
    expect(row.classList.contains('log-chain')).toBe(true);
    expect(row.textContent).toContain('⛓');
    expect(row.textContent).toContain('Order_Place');
    expect(row.textContent).not.toMatch(/hops?\b/i);
    const chain = row.querySelector('.tag-chain');
    expect(chain.textContent).toBe('chain · 3 calls');
    expect(chain.title).toBe('One chainable procedure that ran as 3 calls; the time is the sum');
    expect(row.textContent).toContain('2,100 ms');
    expect(row.querySelector('.tag-ip').textContent).toBe('IP');
    expect(row.querySelector('.pill').textContent).toBe('Succeeded');
  });

  it('leaves other calls as they are', () => {
    hop({ method: 'Account_Fetch', options: {} });
    threeHops();
    expect(rows().map((row) => row.classList.contains('log-chain'))).toEqual([false, true]);
  });

  it('opens the calls under the chain with the chevron and closes them again, labelled call 1 of 3 and without the chain tag', () => {
    threeHops();
    const toggle = () => rows()[0].querySelector('.chain-toggle');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    toggle().click();
    expect(rows()).toHaveLength(4);
    expect(rows().slice(1).every((row) => row.classList.contains('is-hop'))).toBe(true);
    expect(rows()[1].textContent).toContain('call 1 of 3');
    expect(rows()[3].textContent).toContain('call 3 of 3');
    rows().slice(1).forEach((row) => {
      expect(row.querySelector('.tag-chain')).toBeNull();
      expect([...row.querySelectorAll('.tag-opt')].some((tag) => tag.textContent === 'chainable')).toBe(false);
    });
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    expect(rows()).toHaveLength(1);
  });

  it('names a call of a chain by its place and its time, not by the chain\'s name again', () => {
    threeHops();
    rows()[0].querySelector('.chain-toggle').click();
    const second = rows()[2].querySelector('.log-name');
    expect(second.textContent).toContain('call 2 of 3');
    expect(second.textContent).not.toContain('Order_Place');
    expect(second.querySelector('.hop-clock').textContent).toBe(new Date(Date.UTC(2024, 0, 1, 0, 0, 2)).toLocaleTimeString());
    expect(second.title).toContain('Order_Place'); // the tooltip keeps the name
    expect(rows()[0].querySelector('.log-name').textContent).toContain('Order_Place'); // the chain's own row has it
  });

  it('shows a call that only asks to be chainable as "chainable", and keeps "chain" for the group', () => {
    hop({ method: 'Account_Fetch', options: { chainable: true }, at: 0 });
    const tags = [...rows()[0].querySelectorAll('.tags-wide .tag')].map((tag) => tag.textContent);
    expect(tags).toEqual(['chainable']);
    expect(rows()[0].classList.contains('log-chain')).toBe(false);
  });

  it('says in the detail head which call of a chain a call is, as a link that selects the chain', () => {
    threeHops();
    rows()[0].querySelector('.chain-toggle').click();
    rows()[2].click();
    const link = detail().querySelector('.detail-meta .chain-place');
    expect(link.textContent).toBe('call 2 of 3 in a chain');
    expect(link.tagName).toBe('BUTTON');
    expect(detail().querySelector('.detail-title').textContent).toBe('Order_Place');
    link.click();
    expect(detail().querySelector('.detail-title').textContent).toBe('⛓ Order_Place');
    expect(detail().querySelector('.chain-place')).toBeNull(); // the chain itself is not a call of one
  });

  it('says nothing of a chain for a call that is not in one', () => {
    hop({ method: 'Account_Fetch', options: {}, at: 0 });
    rows()[0].click();
    expect(detail().querySelector('.chain-place')).toBeNull();
  });

  it('opens and closes with the arrow keys, and keeps the choice when a call arrives', () => {
    threeHops();
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(rows()).toHaveLength(4);
    hop({ method: 'Account_Fetch', options: {}, at: 30 });
    expect(rows()).toHaveLength(5);
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(rows()).toHaveLength(2);
  });

  it('says the server answered \'continue\' only for a chain whose answers did', () => {
    const going = { vlcStatus: 'InProgress' };
    hop({ output: going });
    hop({ output: going });
    hop({ output: { vlcStatus: 'Complete' } });
    rows()[0].click();
    tab('Calls').click();
    expect(detail().textContent).toContain('This procedure ran as 3 calls in a chain; the server answered \'continue\' after each but the last.');
  });

  it('shows the first call\'s input and the last call\'s output when the chain is selected', () => {
    hop({ output: { stage: 'alpha' } });
    hop({ output: { stage: 'beta' } });
    hop({ options: {}, output: { stage: 'omega' } });
    rows()[0].click();
    expect(rows()[0].classList.contains('is-selected')).toBe(true);
    expect(detail().querySelector('.detail-title').textContent).toBe('⛓ Order_Place');
    expect(detail().querySelector('.detail-meta').textContent).toContain('3 calls');
    expect(detail().textContent).toContain('Hop: 1');
    expect(detail().textContent).not.toContain('Hop: 3');
    tab('Output').click();
    expect(detail().textContent).toContain('omega');
    expect(detail().textContent).not.toContain('alpha');
    expect(detail().textContent).toContain('Output of the last call (call 3 of 3)');
  });

  it('lists each call on a Calls tab, saying what a chain is, and a click opens that call', () => {
    threeHops();
    rows()[0].click();
    tab('Calls').click();
    expect(tab('Hops')).toBeUndefined();
    // These calls are tied by the chainable option and a token, no answer said 'continue'.
    expect(detail().textContent).toContain('This procedure ran as 3 calls in a chain; they were joined by the chainable option and a shared input or token, not by an answer saying \'continue\'.');
    expect(detail().textContent).not.toContain('the server answered');
    const buttons = [...detail().querySelectorAll('.hop-btn')];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain('call 1 of 3');
    expect(buttons[0].textContent).toContain('700 ms');
    expect(buttons[0].textContent).toContain('Succeeded');
    buttons[1].click();
    // The chain opened so that the call has a row, and that row is the open one.
    expect(rows()).toHaveLength(4);
    expect(rows()[2].classList.contains('is-selected')).toBe(true);
    expect(detail().querySelector('.detail-title').textContent).toBe('Order_Place');
    expect(detail().textContent).toContain('Hop: 2');
    expect(tab('Calls')).toBeUndefined();
  });

  it('is red when any hop failed, and says which', () => {
    hop();
    hop({ errorInAction: 'boom' });
    hop({ options: {} });
    const row = rows()[0];
    expect(row.classList.contains('is-failed')).toBe(true);
    expect(row.querySelector('.pill').textContent).toBe('Failed');
    row.click();
    expect(detail().querySelector('.detail-error').textContent).toContain('Call 2 of 3');
    expect(detail().querySelector('.detail-meta').textContent).toContain('1 call failed');
    expect(document.getElementById('actions-count').classList.contains('is-bad')).toBe(true);
  });

  it('says a chain stopped early when its last hop goes on and a later call shows 30 s passed', () => {
    hop({ output: { vlcStatus: 'InProgress' } });
    hop({ output: { vlcStatus: 'InProgress' } });
    hop({ method: 'Later_Call', options: {}, at: 120 });
    expect(rows()[0].textContent).toContain('stopped early');
    rows()[0].click();
    expect(detail().querySelector('.detail-meta').textContent).toContain('stopped early');
  });

  it('says a chain stopped early on its own once 30 s pass with nothing arriving', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2024, 0, 1, 0, 0, 10)));
    hop({ at: 1, output: { vlcStatus: 'InProgress' } });
    hop({ at: 2, output: { vlcStatus: 'InProgress' } });
    expect(rows()[0].textContent).not.toContain('stopped early');
    jest.advanceTimersByTime(20000);
    expect(rows()[0].textContent).not.toContain('stopped early');
    jest.advanceTimersByTime(20000);
    expect(rows()[0].textContent).toContain('stopped early');
    jest.useRealTimers();
  });

  it('books no redraw while the tab is hidden, and books it again when shown', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2024, 0, 1, 0, 0, 10)));
    hop({ at: 1, output: { vlcStatus: 'InProgress' } });
    hop({ at: 2, output: { vlcStatus: 'InProgress' } });
    expect(jest.getTimerCount()).toBe(1);
    RemoteActions.hide();
    expect(jest.getTimerCount()).toBe(0);
    RemoteActions.show();
    expect(jest.getTimerCount()).toBe(1);
    RemoteActions.hide();
    jest.useRealTimers();
  });

  it('does not book a redraw for a chain that is done', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.UTC(2024, 0, 1, 0, 0, 10)));
    threeHops();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('applies the filters to the hops: the chain shows while any hop matches', () => {
    jest.useFakeTimers();
    hop({ output: { stage: 'alpha' } });
    hop({ output: { stage: 'second' } });
    hop({ options: {}, output: { stage: 'third' } });
    const filter = document.getElementById('log-filter');
    filter.value = 'in:second';
    filter.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].classList.contains('log-chain')).toBe(true);
    rows()[0].querySelector('.chain-toggle').click();
    expect(rows()).toHaveLength(2);
    filter.value = 'nothing-matches-this';
    jest.useFakeTimers();
    filter.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
    expect(rows()).toHaveLength(0);
  });

  describe('Export', () => {
    let written;
    beforeEach(() => {
      written = [];
      URL.createObjectURL = jest.fn((blob) => { written.push(blob); return 'blob:test'; });
      URL.revokeObjectURL = jest.fn();
      HTMLAnchorElement.prototype.click = jest.fn();
    });

    const readBlob = (blob) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(JSON.parse(reader.result));
      reader.readAsText(blob);
    });

    it('writes the hops with the chain they belong to', async () => {
      hop({ method: 'Account_Fetch', options: {}, at: 0 });
      hop({ at: 1 });
      hop({ at: 2 });
      hop({ options: {}, at: 3 });
      document.getElementById('log-export').click();
      const out = await readBlob(written[0]);
      expect(out.map((row) => row.chainId)).toEqual([undefined, 'chain-2', 'chain-2', 'chain-2']);
    });
  });
});
