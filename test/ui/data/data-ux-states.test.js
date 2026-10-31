'use strict';

/* What the Data tab says in its empty and stale states, how the root row is
 * named, which views show the Changes bar, and the Compare data panel's
 * controls. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { readFileSync } from 'node:fs';
import { tick } from '../support/structure-page.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

const $ = (id) => document.getElementById(id);

describe('a payload whose script is gone', () => {
  it('is dimmed, and the banner offers Rescan', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    expect(viewport().classList.contains('is-stale')).toBe(false);

    $('a').remove();
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();
    expect(viewport().classList.contains('is-stale')).toBe(true);
    expect(viewport().textContent).toContain('Ada');

    const rescan = viewport().querySelector('.notice .stale-rescan');
    expect(rescan.title).not.toBe('');
    expect(rescan.getAttribute('data-help')).toBe('Rescan');
    const pressed = jest.fn();
    $('rescan').addEventListener('click', pressed);
    rescan.click();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('is shown at full strength again when a script is found', async () => {
    const { Targets } = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    const host = $('a');
    host.remove();
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();
    expect(viewport().classList.contains('is-stale')).toBe(true);

    document.body.appendChild(host);
    await new Promise((resolve) => Targets.refresh(resolve));
    await tick();
    expect(viewport().classList.contains('is-stale')).toBe(false);
  });
});

describe('a search that finds nothing', () => {
  async function search(text) {
    jest.useFakeTimers();
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    $('filter').value = text;
    $('filter').dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
  }

  it('says so in one line with a way out, and Clear filter empties the box', async () => {
    await search('zzz');
    const line = viewport().querySelector('.no-match-card');
    expect(line.textContent).toBe('No rows match \u201Czzz\u201DClear filter'); // typographic quotes, as on the other tabs
    expect(line.classList.contains('is-one-line')).toBe(true);
    expect(line.querySelector('button').textContent).toBe('Clear filter');

    line.querySelector('button').click();
    expect($('filter').value).toBe('');
    expect(viewport().querySelector('.no-match-card')).toBe(null);
    expect(viewport().textContent).toContain('Ada');
  });
});

describe('the root row', () => {
  it('is called Data, and the property it was read from is in its tooltip', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: 1 } }] });
    const root = viewport().querySelector('.row .k');
    expect(root.textContent).toBe('Data');
    expect(root.title).toBe('jsonDataStr');
    expect($('status-left').title).toContain('property jsonDataStr'); // the tooltip, not the line
    expect($('status-left').textContent).not.toContain('jsonDataStr');
  });
});

describe('the Data toolbar at a narrow width', () => {
  it('marks the deeper-dive buttons for the overflow menu and keeps their ids', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: 1 } }] });
    ['expand', 'collapse', 'data-export'].forEach((id) => {
      expect($(id).hasAttribute('data-overflow')).toBe(true);
      expect($(id).title).not.toBe('');
    });
  });
});

/* CSS-text tests: jsdom lays nothing out, so these read panel.css and match its
 * rules. They break on purpose when a selector is renamed; update the pattern
 * together with the rule. */
describe('the stylesheet of the Data states', () => {
  const css = readFileSync('panel.css', 'utf8');
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('gives the Sizes table the pane width with fixed columns, so they stay put when drilling', () => {
    /* the path takes what is left; the others have one width each, whatever the rows hold */
    expect(rule('.sizes-list')).toMatch(/grid-template-columns:\s*2\.4em minmax\(0, 1fr\) minmax\(120px, 26%\) 7em 5em/);
    expect(rule('.sizes-list')).not.toMatch(/fit-content|justify-content/);
    expect(css).toMatch(/@media \(max-width: 480px\) \{\s*\.sizes-list \{ grid-template-columns:\s*2em minmax\(0, 1fr\) 48px/);
    expect(rule('.size-head, .size-row')).toMatch(/grid-template-columns:\s*subgrid/);
  });

  it('caps the change log path so the values sit beside it, with was and now sharing one cap and the tree button in a column after the path', () => {
    // caret | time | path | tree button | was | arrow | now
    expect(rule('.changelog-list')).toMatch(/grid-template-columns:\s*1em max-content fit-content\(40%\) auto fit-content\(min\(28ch, 16%\)\) auto minmax\(0, min\(28ch, 20%\)\);/);
    expect(rule('.log-item, .log-bar, .log-entry')).toMatch(/grid-template-columns:\s*subgrid/);
    expect(rule('.log-tree')).toMatch(/grid-column:\s*4/);
    expect(rule('.log-where')).toMatch(/grid-column:\s*3/);
    expect(rule('.log-old')).toMatch(/grid-column:\s*5/);
    expect(rule('.log-new')).toMatch(/grid-column:\s*7/);
  });

  it('pushes the Compare close button to the right edge, and dims a stale tree', () => {
    expect(rule('.compare-close')).toMatch(/margin-left:\s*auto/);
    expect(css).toMatch(/\.viewport\.is-stale > :not\(\.notice\)\s*\{\s*opacity:\s*\.6/);
  });
});
