'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* Repeated calls in the Calls list: a tag on each repeat, the badge
 * tooltip, the repeat: filter; and the shared tag style and Result glyph. */

import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: repeated calls', () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const call = (id, { second = id, method = 'Order_Place', input = '{"Id":"001"}', options = {} } = {}) => {
    const entry = auraNetworkEntry({
      actionId: String(id), method, input, options,
      startedDateTime: new Date(Date.UTC(2024, 0, 1, 10, 42, second)).toISOString()
    });
    listeners.onRequestFinished.forEach((listener) => listener(entry));
  };
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const tags = (row) => [...row.querySelectorAll('.tags-wide .tag-repeat')];

  function filter(text) {
    jest.useFakeTimers();
    const box = document.getElementById('log-filter');
    box.value = text;
    box.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    jest.useRealTimers();
  }

  it('tags a repeat with its place in the run and says which call it repeats', () => {
    call(1, { second: 3 });
    call(2, { second: 4 });
    call(3, { second: 5 });
    expect(tags(rows()[0])).toHaveLength(0);
    expect(tags(rows()[1])[0].textContent).toBe('repeat ×2');
    expect(tags(rows()[2])[0].textContent).toBe('repeat ×3');
    const expected = new Date(Date.UTC(2024, 0, 1, 10, 42, 3)).toLocaleTimeString();
    expect(tags(rows()[1])[0].title).toBe(`Same procedure and input as the call at ${expected}; a double-fired action or a re-render loop usually causes this`);
  });

  it('does not tag calls with other input or too far apart', () => {
    call(1, { second: 1 });
    call(2, { second: 2, input: '{"Id":"002"}' });
    call(3, { second: 30 });
    expect(document.querySelectorAll('.tags-wide .tag-repeat')).toHaveLength(0);
  });

  it('adds the repeated count to the badge tooltip only when there is one', () => {
    call(1, { second: 1 });
    expect(document.getElementById('actions-count').title).toBe('1 call in view');
    call(2, { second: 2 });
    expect(document.getElementById('actions-count').title).toBe('2 calls in view · 1 repeated');
  });

  it('keeps the tag when the list is redrawn by a new call, and finds a repeat that arrives late', () => {
    call(1, { second: 10 });
    call(3, { second: 12, method: 'Other_Call' });
    call(2, { second: 11 }); // answered last, started in between
    expect(rows().map((row) => tags(row).length)).toEqual([0, 1, 0]);
  });

  it('repeat: shows only the repeated calls and the ones they repeat', () => {
    call(1, { second: 1 });
    call(2, { second: 2 });
    call(3, { second: 3, method: 'Solo_Call' });
    filter('repeat:');
    expect(rows()).toHaveLength(2);
    filter('repeats');
    expect(rows()).toHaveLength(2);
    filter('');
    expect(rows()).toHaveLength(3);
  });

  it('does not make repeats of the hops of a chain', () => {
    call(1, { second: 1, options: { chainable: true } });
    call(2, { second: 2, options: { chainable: true } });
    call(3, { second: 3 });
    expect(document.querySelectorAll('.tags-wide .tag-repeat')).toHaveLength(0);
  });
});

describe('Calls: tag style and Result glyph', () => {
  const css = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'panel.css'), 'utf8');

  it('has no colour rule for the type tags: they are the shared tag box (see tag-family.test.js)', () => {
    ['dr', 'ip', 'ra', 'apex'].forEach((type) => {
      expect(css).not.toContain(`#log-list .tag-${type} { color`);
    });
  });

  it('gives every list tag one box', () => {
    /* The shared .tag box; the list adds nothing to it. */
    const body = (selector) => css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    ['padding: 0 6px', 'border-radius: 4px', 'font-size: 11px', 'font-weight: 600', 'height: 18px'].forEach((rule) => {
      expect(body('\n.tag {')).toContain(rule);
    });
    expect(css).not.toContain('#log-list .tag {');
  });

  it('puts the glyph in generated content, so the pill\'s text stays as it was', async () => {
    jest.resetModules();
    const listeners = stubChromeDevtools();
    mountPanelMarkup();
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
    listeners.onRequestFinished.forEach((listener) => listener(auraNetworkEntry()));
    expect(document.querySelector('#log-list .log-row:not(.log-head) .pill').textContent).toBe('Succeeded');
    expect(css).toContain('.pill.is-good:not(.is-code)::before { content: "✓ " / ""; }');
    expect(css).toContain('.pill.is-bad:not(.is-code)::before { content: "✕ " / ""; }');
    expect(css).toContain('.pill.is-neutral:not(.is-code)::before { content: "– " / ""; }');
  });
});
