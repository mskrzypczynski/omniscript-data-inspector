'use strict';

/* A loaded session in the Calls tab: a debug bundle's calls take the
 * list's place, nothing is captured meanwhile, and going back to live brings
 * the live calls back as they were. The bundle is built the way the tab writes
 * one (core actionsDump inside buildDebugBundle). */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import { buildActionRecord } from '../../../src/core/shared/actions-model.js';
import { actionsDump } from '../../../src/core/actions/actions-dump.js';
import { buildDebugBundle } from '../../../src/core/shared/debug-bundle.js';

const T0 = Date.UTC(2023, 5, 1, 9, 0, 0);

function call(id, { method = 'Quote_Create', at = id * 1000, ms = 300, options = {}, input = { Ref: `r${id}` }, output = { total: id }, errorInAction } = {}) {
  const action = {
    remoteClass: 'omnistudiocore.IPService', remoteMethod: method, apexClass: '', apexMethod: '', descriptor: '', input, options
  };
  const body = { actions: [{ id: String(id), state: 'SUCCESS', returnValue: { returnValue: output }, ...(errorInAction ? { error: [{ message: errorInAction }] } : {}) }] };
  return buildActionRecord(id, 'aura', { ...action, wireId: String(id) }, 0, body, {
    url: 'https://x.example/aura', startedAt: new Date(T0 + at), durationMs: ms, httpStatus: 200,
    bodySize: 10, requestId: id, batchSize: 1
  });
}

const bundleOf = (entries) => buildDebugBundle({
  now: new Date(T0), calls: entries, tabs: { actions: actionsDump({ entries, marked: [], recording: true, clearOnReload: false }) }
});

describe('Calls: a loaded session', () => {
  let RemoteActions;
  let Session;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    ({ Session } = await import('../../../src/ui/session.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const status = () => document.getElementById('status-left').textContent;
  const live = (id, method = 'Live_Call') => fire(auraNetworkEntry({
    actionId: String(id), method, startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, id)).toISOString()
  }));

  it('shows the bundle\'s calls instead of the live ones, and says so in the status bar', () => {
    live(1);
    expect(rows()[0].textContent).toContain('Live_Call');
    Session.load(bundleOf([call(1), call(2, { method: 'Quote_Send' })]), 'bug-report.json');
    expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['Quote_Create', 'Quote_Send']);
    expect(status()).toContain('Bundle: bug-report.json');
    expect(status()).toContain('2 calls');
    expect(document.getElementById('status-right').textContent).toContain('Not capturing');
    expect(document.getElementById('actions-count').textContent).toBe('2');
  });

  it('opens a call of the bundle with its input and output', () => {
    Session.load(bundleOf([call(1, { input: { Ref: 'abc' }, output: { total: 42 } })]), 'f.json');
    rows()[0].click();
    expect(detail().textContent).toContain('Ref: "abc"');
    [...detail().querySelectorAll('.seg-btn')].find((button) => button.textContent === 'Output').click();
    expect(detail().textContent).toContain('total: 42');
  });

  it('shows a failed call as failed, with its reason', () => {
    Session.load(bundleOf([call(1, { errorInAction: 'Quote is locked' })]), 'f.json');
    expect(rows()[0].classList.contains('is-failed')).toBe(true);
    expect(rows()[0].querySelector('.pill').textContent).toBe('Failed');
    rows()[0].click();
    expect(detail().querySelector('.detail-error').textContent).toContain('Quote is locked');
    expect(document.getElementById('actions-count').classList.contains('is-bad')).toBe(true);
  });

  it('pauses recording, ignores the page\'s calls and disables Clear', () => {
    Session.load(bundleOf([call(1)]), 'f.json');
    const record = document.getElementById('log-record');
    expect(record.textContent).toContain('Paused');
    expect(record.getAttribute('aria-pressed')).toBe('false');
    expect(record.disabled).toBe(true);
    expect(document.getElementById('log-clear').disabled).toBe(true);
    live(5);
    expect(rows()).toHaveLength(1);
    document.getElementById('log-clear').click();
    expect(rows()).toHaveLength(1);
  });

  it('drops an answer that arrives after the bundle was opened', () => {
    let finish;
    const slow = auraNetworkEntry({ method: 'Slow_Call' });
    slow.getContent = (callback) => { finish = () => callback('while(1);{"actions":[]}'); };
    fire(slow);
    Session.load(bundleOf([call(1)]), 'f.json');
    finish();
    expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['Quote_Create']);
    Session.clear();
    expect(rows()).toHaveLength(0);
  });

  it('does not show the live call\'s detail for a bundle call with the same id', () => {
    live(1, 'Live_Call');
    rows()[0].click();
    expect(detail().querySelector('.detail-title').textContent).toBe('Live_Call');
    Session.load(bundleOf([call(1)]), 'f.json');
    rows()[0].click();
    expect(detail().querySelector('.detail-title').textContent).toBe('Quote_Create');
  });

  it('says so when the file holds no calls', () => {
    Session.load(buildDebugBundle({ now: new Date(T0), calls: [] }), 'empty.json');
    expect(rows()).toHaveLength(0);
    const notes = document.getElementById('log-notes');
    expect(notes.textContent).toContain('Bundle: empty.json');
    expect(notes.textContent).toContain('This file holds no calls');
    expect(notes.querySelector('#log-reload')).toBeNull();
  });

  it('reads an older bundle that only has calls', () => {
    const entries = [call(1)];
    Session.load(buildDebugBundle({ now: new Date(T0), calls: entries }), 'old.json');
    expect(rows()).toHaveLength(1);
  });

  it('groups the chains in the file again', () => {
    const hops = [
      call(1, { at: 0, method: 'Order_Place', input: { Ref: 'same' }, options: { chainable: true } }),
      call(2, { at: 800, method: 'Order_Place', input: { Ref: 'same' }, options: { chainable: true } }),
      call(3, { at: 1600, method: 'Order_Place', input: { Ref: 'same' }, options: {} })
    ];
    Session.load(bundleOf(hops), 'chain.json');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('chain · 3 calls');
    expect(status()).toContain('1 chain');
  });

  it('judges a chain of the file by the file\'s own last call, not by today\'s date', () => {
    const hops = [
      call(1, { at: 0, output: { vlcStatus: 'InProgress' } }),
      call(2, { at: 800, output: { vlcStatus: 'InProgress' } })
    ];
    Session.load(bundleOf(hops), 'old-chain.json');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).not.toContain('stopped early');
    Session.load(bundleOf([...hops, call(3, { at: 90000, method: 'Later_Call' })]), 'old-chain.json');
    expect(rows()[0].textContent).toContain('stopped early');
  });

  describe('the step each call was made on', () => {
    const stepBundle = (visits) => ({ ...bundleOf([call(1, { at: 1000 }), call(2, { at: 5000, method: 'Quote_Send' })]), step: { key: 's2', name: 'Review', asIndex: 1, visits } });
    const visits = [
      { key: 's1', name: 'Account Info', from: T0, to: T0 + 3000 },
      { key: 's2', name: 'Review', from: T0 + 3000, to: null }
    ];
    const filterBox = () => document.getElementById('log-filter');
    const type = (text) => {
      jest.useFakeTimers();
      filterBox().value = text;
      filterBox().dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);
      jest.useRealTimers();
    };

    it('comes from the file, not from the script on the page', async () => {
      const { Shared } = await import('../../../src/ui/shared.js');
      // The page's script is on a step of its own, and has been all along.
      Shared.setStep(() => ({ key: 'live', name: 'Live Step', asIndex: 0, visits: [{ key: 'live', name: 'Live Step', from: 0, to: null }] }));
      Session.load(stepBundle(visits), 'steps.json');
      expect(rows()[0].querySelector('.log-name').title).toContain('Step: Account Info');
      expect(rows()[1].querySelector('.log-name').title).toContain('Step: Review');
      expect(rows()[0].querySelector('.log-name').title).not.toContain('Live Step');
      rows()[1].click();
      expect(detail().querySelector('.detail-meta').textContent).toContain('step Review');
      type('step:review');
      expect(rows().map((row) => row.querySelector('.log-name').textContent)).toEqual(['Quote_Send']);
      type('step:live');
      expect(rows()).toHaveLength(0);
    });

    it('names no step for a file saved without visits, rather than borrowing the live one', async () => {
      const { Shared } = await import('../../../src/ui/shared.js');
      Shared.setStep(() => ({ key: 'live', name: 'Live Step', asIndex: 0, visits: [{ key: 'live', name: 'Live Step', from: 0, to: null }] }));
      Session.load(bundleOf([call(1)]), 'no-steps.json');
      expect(rows()[0].querySelector('.log-name').title).not.toContain('Step:');
    });

    it('follows the top bar to another script: a new selection redraws the step each call names', async () => {
      const { Shared } = await import('../../../src/ui/shared.js');
      const { Targets } = await import('../../../src/ui/targets.js');
      const at = Date.UTC(2024, 0, 1, 0, 0, 1);
      const stepOf = (name) => () => ({ key: name, name, asIndex: 0, visits: [{ key: name, name, from: at - 1000, to: null }] });
      Shared.setStep(stepOf('First Script Step'));
      live(1);
      expect(rows()[0].querySelector('.log-name').title).toContain('Step: First Script Step');
      Shared.setStep(stepOf('Second Script Step'));
      Targets.enterSession({}, 'x'); // any new selection
      expect(rows()[0].querySelector('.log-name').title).toContain('Step: Second Script Step');
    });

    it('goes back to the live script\'s steps when the file is closed', async () => {
      const { Shared } = await import('../../../src/ui/shared.js');
      Shared.setStep(() => ({ key: 'live', name: 'Live Step', asIndex: 0, visits: [{ key: 'live', name: 'Live Step', from: 0, to: null }] }));
      live(1);
      Session.load(stepBundle(visits), 'steps.json');
      Session.clear();
      expect(rows()[0].querySelector('.log-name').title).toContain('Step: Live Step');
    });
  });

  it('takes a second bundle in place of the first and still returns to the live calls', () => {
    live(1, 'Live_Call');
    Session.load(bundleOf([call(1)]), 'one.json');
    Session.load(bundleOf([call(2, { method: 'Other_Call' })]), 'two.json');
    expect(rows()[0].textContent).toContain('Other_Call');
    expect(status()).toContain('two.json');
    Session.clear();
    expect(rows()[0].textContent).toContain('Live_Call');
  });

  it('loads a session that was already open when the tab mounted', async () => {
    jest.resetModules();
    stubChromeDevtools();
    mountPanelMarkup();
    ({ Session } = await import('../../../src/ui/session.js'));
    Session.load(bundleOf([call(1)]), 'early.json');
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
    expect(rows()).toHaveLength(1);
    expect(status()).toContain('early.json');
  });

  it('exports the calls of the session', async () => {
    const written = [];
    URL.createObjectURL = jest.fn((blob) => { written.push(blob); return 'blob:test'; });
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
    Session.load(bundleOf([call(1), call(2)]), 'f.json');
    document.getElementById('log-export').click();
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(written[0]);
    });
    expect(JSON.parse(text).map((row) => row.action)).toEqual(['Quote_Create', 'Quote_Create']);
  });
});
