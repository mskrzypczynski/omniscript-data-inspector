'use strict';

/* CSS-text tests: some of the tests below read panel.css as text, because
 * jsdom lays nothing out and a rule about the cascade can only be checked on
 * the stylesheet. They break on purpose when a selector is renamed. */

/* One tag family across the tabs: every marker is the .tag box with one of the
 * five variants, and the tabs carry no colour or size rules of their own. */

import { jest } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const css = fs.readFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'panel.css'), 'utf8');
const VARIANTS = ['tag-neutral', 'tag-ok', 'tag-warn', 'tag-error', 'tag-info'];
const variantOf = (node) => VARIANTS.filter((name) => node.classList.contains(name));

describe('the stylesheet', () => {
  it('defines the box and the five variants once, in the family', () => {
    expect(css.match(/\n\.tag \{/g)).toHaveLength(1);
    VARIANTS.forEach((name) => expect(css).toContain(`\n.${name} {`));
  });

  it('has no colour or size rule of a tab for a marker the family draws', () => {
    [
      /^\.tag-(hidden|req|cond|act|missing|type) \{/m,
      /^#log-list \.tag \{/m,
      /^#log-list \.tag-(dr|ip|ra|apex) \{ color/m,
      /^\.pill(\.is-\w+)? \{/m,
      /^\.size-chip(\.is-strong)? \{[^}]*(background|border|color)/m,
      /^\.rule-edited \{[^}]*(border|color|padding)/m
    ].forEach((dead) => expect(css).not.toMatch(dead));
  });

  it('draws a tag on a selected row white on the selection colour, whatever its variant', () => {
    const start = css.indexOf('.list-row.is-selected .tag {');
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('var(--sel-chip)');
    expect(rule).toContain('var(--sel-fg)');
  });

  it('gives the variants a light and a dark pair of tokens', () => {
    ['--ok-bg', '--ok-fg', '--warn-bg', '--warn', '--err-bg', '--err-fg', '--info-bg', '--info-fg', '--neutral-bg', '--neutral-fg']
      .forEach((token) => expect(css.match(new RegExp(`${token}:`, 'g')).length).toBeGreaterThanOrEqual(3));
  });
});

describe('Calls', () => {
  let listeners;
  let RemoteActions;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const call = (id, extra = {}) => fire(auraNetworkEntry({
    actionId: String(id), method: 'Order_Place', input: '{"Id":"001"}',
    startedDateTime: new Date(Date.UTC(2024, 0, 1, 10, 42, id)).toISOString(), ...extra
  }));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

  it('draws the call type, the Result and the repeat as tags of the family', () => {
    call(1);
    call(2);
    const [first, second] = rows();
    const type = first.querySelector('.tag-ip, .tag-dr, .tag-ra, .tag-apex');
    expect(variantOf(type)).toEqual([]);
    expect(type.classList.contains('tag-type-ip')).toBe(true); // a call type has a tone of its own
    expect(type.classList.contains('tag')).toBe(true);

    const result = first.querySelector('.pill:not(.is-code)');
    expect(result.classList.contains('tag')).toBe(true);
    expect(variantOf(result)).toEqual(['tag-ok']);
    expect(result.textContent).toBe('Succeeded');

    const repeat = second.querySelector('.tag-repeat');
    expect(repeat.classList.contains('tag')).toBe(true);
    expect(variantOf(repeat)).toEqual(['tag-warn']);
  });

  it('draws a failed call red and a call with no response grey, keeping the word', () => {
    call(1, { content: '<html>Down for maintenance</html>' });
    call(2, { status: 0, content: '' });
    const [failed, silent] = rows().map((row) => row.querySelector('.pill:not(.is-code)'));
    expect(variantOf(failed)).toEqual(['tag-error']);
    expect(failed.textContent).toBe('Failed');
    expect(variantOf(silent)).toEqual(['tag-neutral']);
    expect(silent.textContent).toBe('No response');
    expect(rows()[1].querySelector('.pill.is-code')).toBeNull(); // the HTTP status is in the tooltip
  });

  it('draws the options of a call (chain, cache, queue) as neutral tags', () => {
    call(1, { options: { chainable: true, storable: true } });
    const options = [...rows()[0].querySelectorAll('.tag-opt')];
    expect(options.length).toBeGreaterThan(0);
    options.forEach((node) => expect(variantOf(node)).toEqual(['tag-neutral']));
  });

  it('keeps the header cells of the tag columns in the family, without a variant', () => {
    call(1);
    const head = document.querySelectorAll('#log-list .log-head .tag');
    expect(head).toHaveLength(2);
    head.forEach((node) => expect(variantOf(node)).toEqual([]));
  });
});

describe('Structure', () => {
  const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
    .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));

  async function boot() {
    const def = definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Kind' },
      { name: 'Email', propSetMap: { required: true } },
      { name: 'Company', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Business' }] } } },
      { name: 'Gate', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Person' }] } } },
      { name: 'Qty', type: 'Number' },
      { name: 'Lookup', type: 'Integration Procedure Action', propSetMap: { integrationProcedureKey: 'Acme_Find' } }
    ] }] });
    await bootStructure({ scripts: [{ id: 'main', def, data: { Intro: { Kind: 'Person', Qty: 'abc' } } }] });
    await tick();
  }

  it('draws the required, rule, hidden, action and hint markers as tags of the family', async () => {
    await boot();
    const required = rowOf('Email').querySelector('.tag-req');
    expect(required.classList.contains('tag')).toBe(true);
    expect(variantOf(required)).toEqual(['tag-neutral']);
    expect(required.textContent).toBe('*');

    expect(rowOf('Company').querySelector('.tag-cond')).toBeNull(); // hidden: the closed eye alone
    expect(variantOf(rowOf('Gate').querySelector('.tag-cond'))).toEqual(['tag-neutral']);
    expect(variantOf(rowOf('Company').querySelector('.tag-hidden'))).toEqual(['tag-neutral']);
    expect(variantOf(rowOf('Lookup').querySelector('.tag-act'))).toEqual(['tag-neutral']);
    expect(variantOf(rowOf('Qty').querySelector('.tag-type'))).toEqual(['tag-warn']);
  });

  it('draws rule and hidden as icons with a tooltip and an accessible name', async () => {
    await boot();
    const rule = rowOf('Gate').querySelector('.tag-cond');
    const hidden = rowOf('Company').querySelector('.tag-hidden');
    expect(rule.textContent).toBe('');
    expect(rule.querySelector('svg.ic-diamond')).not.toBeNull();
    expect(rule.title).toContain('Shown when: Intro:Kind');
    expect(rule.getAttribute('aria-label')).toMatch(/^Has a show rule: /);
    expect(hidden.textContent).toBe('');
    expect(hidden.querySelector('svg.ic-eye-off')).not.toBeNull();
    expect(hidden.title).toMatch(/^Hidden by its show rule: /);
    expect(hidden.title).toContain('"Person"');
    expect(hidden.title).toContain('Shown when: Intro:Kind');
    expect(hidden.getAttribute('role')).toBe('img');
  });

  it('lists every mark in the legend of the Marks column', async () => {
    await boot();
    const legend = document.querySelector('#struct-list .el-head .el-marks').title;
    expect(legend).toContain('diamond = has a show rule');
    expect(legend).toContain('closed eye = hidden by its show rule');
    expect(legend).not.toContain('○');
  });
});

describe('the status bar', () => {
  it('keeps Masking in the family as the info variant', () => {
    mountPanelMarkup();
    const chip = document.getElementById('status-mask');
    expect(chip.classList.contains('tag')).toBe(true);
    expect(variantOf(chip)).toEqual(['tag-info']);
  });
});
