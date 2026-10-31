'use strict';

/* The View menu of the Structure toolbar: the switches that used to be four
 * checkboxes, shown as ticked items, with a count on the button while any is on. */

import { bootStructure, definition } from '../support/structure-page.js';
import { openMenu, toggleView } from '../support/structure-menus.js';

const $ = (id) => document.getElementById(id);

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Kind' },
  { name: 'Lookup', type: 'Integration Procedure Action', propSetMap: { integrationProcedureKey: 'Acme_Find' } },
  { name: 'Gated', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Business' }] } } }
] }];

beforeEach(async () => {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Kind: 'Person' } } }] });
});
afterEach(() => document.querySelectorAll('.ctx-menu').forEach((node) => node.remove()));

describe('the View menu', () => {
  it('says it is open while it is, and closed with Esc', () => {
    const button = $('struct-view');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    openMenu();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the menu when an item is chosen, so the list can be read', () => {
    toggleView('Highlight on hover');
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });
});

describe('Follow current step', () => {
  it('stays a visible checkbox in the bar, with a fixed label', () => {
    const box = $('struct-follow');
    expect(box.type).toBe('checkbox');
    expect(box.closest('label').hidden).toBe(false);
    expect(box.closest('label').textContent.trim()).toBe('Follow current step');
  });
});
