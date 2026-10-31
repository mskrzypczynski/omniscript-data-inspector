'use strict';

/* No OmniScript on the page: the Data tab says so in one line (as Structure
 * does), switches the controls that need data off, and keeps the things to try
 * in the help's Data property entry. A search that finds nothing is the shared
 * one-line card with a real Clear filter button. */

import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { noMatchNotice } from '../../../src/ui/empty-notice.js';
import { COMMON_HELP } from '../../../src/ui/help/common.js';

const $ = (id) => document.getElementById(id);
const NEEDS_DATA = ['filter', 'expand', 'collapse', 'data-export'];

afterEach(() => { document.body.innerHTML = ''; });

describe('with no script found', () => {
  it('shows one line with a Rescan button and a More help link, and nothing else', async () => {
    await bootData({ hosts: [] });
    const card = viewport().querySelector('.data-empty');
    expect(card.textContent).toBe('No OmniScript found on this page. Open a page that runs one and let it load, then Rescan.RescanMore help');
    expect(card.classList.contains('is-one-line')).toBe(true);
    expect(card.querySelectorAll('button')).toHaveLength(2);
    expect(viewport().querySelector('ol, ul')).toBeNull();
    expect(card.title).toContain('jsonDataStr');
    expect(card.querySelector('#data-empty-help').title).toContain('what to try when nothing is found');
  });

  it('presses the top bar\'s Rescan from its first control', async () => {
    await bootData({ hosts: [] });
    let rescans = 0;
    $('rescan').addEventListener('click', () => { rescans += 1; });
    $('data-empty-rescan').click();
    expect(rescans).toBe(1);
  });

  it('sends ? from More help, which is how the shell opens the entry the control names', async () => {
    await bootData({ hosts: [] });
    const seen = [];
    document.addEventListener('keydown', (ev) => seen.push([ev.key, ev.target.getAttribute('data-help')]));
    $('data-empty-help').click();
    expect(seen).toEqual([['h', 'No OmniScript found']]);
    expect(COMMON_HELP[1].some(([title]) => title === 'No OmniScript found')).toBe(true);
  });

  it('keeps the three steps first in the No OmniScript found help entry', () => {
    const [, text, extra] = COMMON_HELP[1].find(([title]) => title === 'No OmniScript found');
    ['Rescan', 'finish loading', 'Show the Frame row'].forEach((part) => expect(text).toContain(part));
    expect(text.indexOf('Rescan')).toBeLessThan(text.indexOf('Data property'));
    expect(extra.more).toContain('Frame picker');
  });

  it('switches them on again once a script is there', async () => {
    await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { Step: { Name: 'Ada' } } }] });
    NEEDS_DATA.forEach((id) => expect($(id).disabled).toBe(false));
    expect(viewport().querySelector('.data-empty')).toBeNull();
  });
});

describe('noMatchNotice', () => {
  it('says what matched nothing in typographic quotes, with a real Clear filter button', () => {
    const onClear = jest.fn();
    const box = noMatchNotice({ things: 'rows', query: '  zzz ', onClear });
    expect(box.classList.contains('is-one-line')).toBe(true);
    expect(box.getAttribute('role')).toBe('status');
    expect(box.querySelector('span').textContent).toBe('No rows match “zzz”');
    const button = box.querySelector('button');
    expect(button.tagName).toBe('BUTTON');
    expect(button.title).toBeTruthy();
    button.click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('has no button when it cannot be cleared, and says "to show" for an empty query', () => {
    const box = noMatchNotice({ things: 'changed rows', query: '' });
    expect(box.querySelector('span').textContent).toBe('No changed rows to show');
    expect(box.querySelector('button')).toBeNull();
  });

  it('cuts a long query short', () => {
    const box = noMatchNotice({ things: 'rows', query: 'x'.repeat(60), onClear: () => {} });
    expect(box.querySelector('span').textContent).toBe(`No rows match “${'x'.repeat(40)}…”`);
  });
});
