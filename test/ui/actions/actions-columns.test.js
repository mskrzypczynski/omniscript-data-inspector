'use strict';

/* The Calls list is a grid: the header and every row (a call, a chain,
 * a hop, a repeat, a failure) have the same seven cells in the same order, so
 * the stylesheet's one column template puts every cell at one x. The widths
 * themselves are in panel.css; the pixels are checked by the screenshots. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

describe('Calls: one column template', () => {
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

  const call = (extra = {}) => {
    seq += 1;
    listeners.onRequestFinished.forEach((listener) => listener(auraNetworkEntry({
      actionId: String(seq), method: 'Order_Place', input: JSON.stringify({ Order: 'one' }),
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, seq * 10)).toISOString(), ...extra
    })));
  };

  it('draws the options in the tags cell with plain words, and a narrow set that keeps to its room', () => {
    call({ options: { queueableChainable: true, ignoreCache: true, useContinuation: true } });
    const cell = document.querySelector('#log-list .log-row:not(.log-head) .log-tags');
    const labels = (selector) => [...cell.querySelectorAll(`${selector} .tag`)].map((tag) => tag.textContent);
    expect(labels('.tags-wide')).toEqual(['queueable chain', 'continuation', '+1']);
    expect(labels('.tags-narrow')).toEqual(['queueable chain', '+2']);
    expect(cell.title).toContain('queueable chain');
    expect(cell.title).toContain('no cache');
    expect(cell.title).toContain('continuation');
    expect(cell.textContent).not.toContain('q-chain');
  });

  it('shows two short tags side by side in the wide set, and a narrow one that holds both', () => {
    call({ options: { chainable: true, ignoreCache: true } });
    const cell = document.querySelector('#log-list .log-row:not(.log-head) .log-tags');
    const labels = (selector) => [...cell.querySelectorAll(`${selector} .tag`)].map((tag) => tag.textContent);
    expect(labels('.tags-wide')).toEqual(['chainable', 'no cache']);
    expect(labels('.tags-narrow')).toEqual(['chainable', 'no cache']);
  });

  it('holds two short tags in the narrow set and a +1 chip when there are three', () => {
    call({ method: 'Three_Tags', extraActions: ['2', '3'], options: { ignoreCache: true, useContinuation: true } });
    const cell = document.querySelector('#log-list .log-row:not(.log-head) .log-tags');
    const labels = (selector) => [...cell.querySelectorAll(`${selector} .tag`)].map((tag) => tag.textContent);
    expect(labels('.tags-narrow')).toEqual(['×3', 'continuation', '+1']);
    expect(cell.querySelector('.tags-narrow .tag-more').title).toContain('Cache bypassed');
  });

  it('keeps the tag that matters when the cell is short of room: stopped early, then the chain, then ×N', () => {
    call({ method: 'Shared_Call', extraActions: ['2', '3'], options: { ignoreCache: true, useFuture: true, useContinuation: true } });
    const cell = document.querySelector('#log-list .log-row:not(.log-head) .log-tags');
    const labels = (selector) => [...cell.querySelectorAll(`${selector} .tag`)].map((tag) => tag.textContent);
    expect(labels('.tags-wide')[0]).toBe('×3');
    expect(labels('.tags-narrow')[0]).toBe('×3');
  });

  it('says a shared request\'s ×N after the time as well, for the list that has no tag column', () => {
    call({ method: 'Shared_Call', extraActions: ['2'] });
    call({ method: 'Alone', actionId: '9' });
    const took = [...document.querySelectorAll('#log-list .log-row:not(.log-head) .log-ms')];
    expect(took[0].dataset.tail).toBe('×2');
    expect(took[0].textContent).not.toContain('×'); // drawn by the stylesheet, not part of the text
    expect(took[took.length - 1].dataset.tail).toBeUndefined();
  });

  it('lets the name take the room the tags do not use, and drops the ×N tail only where the tags show', () => {
    expect(css).toMatch(/grid-template-columns:\s*var\(--log-check, 24px\) 84px 40px minmax\(12ch, 1fr\) auto 96px 36px/);
    expect(css).toMatch(/#log-list \.log-tags \{[^}]*max-width:\s*244px/);
    expect(css).toMatch(/@container loglist \(max-width: 759px\)[^@]*#log-list \.log-tags \{ max-width: 190px; \}/);
    expect(css).toMatch(/@container loglist \(max-width: 619px\)[^@]*auto 68px 36px/);
    expect(css).not.toMatch(/\.tags-narrow \.tag-more \{ display: none/);
    expect(css).toMatch(/@container loglist \(max-width: 559px\)[^@]*\.log-ms\[data-tail\]::after\s*\{\s*content:\s*" " attr\(data-tail\)/);
  });

  it('lists the options in the name\'s tooltip, for the widths where the cell is gone', () => {
    call({ options: { chainable: true } });
    const name = document.querySelector('#log-list .log-row:not(.log-head) .log-name');
    expect(name.title).toContain('Options:');
    expect(name.title).toContain('chainable: Chainable');
  });
});
