'use strict';

/* The Structure toolbar: one row of controls in reading order (Refresh, Current
 * step, Follow current step, the filter, View, Expand all / Collapse all, More),
 * no Advanced switch to reach any of them, and every control naming its help
 * entry. */

import { readFileSync } from 'node:fs';
import { bootStructure, definition } from '../support/structure-page.js';
import { STRUCTURE_HELP, TOUR } from '../../../src/ui/help/structure.js';

const $ = (id) => document.getElementById(id);
const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

beforeEach(async () => {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: [{ name: 'Intro', elements: [{ name: 'Kind' }] }] }), data: {} }] });
});

describe('the Structure toolbar', () => {
  it('has no control that waits for the Advanced switch', () => {
    expect(document.querySelectorAll('#view-structure .toolbar .adv')).toHaveLength(0);
  });

  it('gives Current step a visible word, not just an icon', () => {
    expect($('struct-current').classList.contains('keep-label')).toBe(true);
    expect($('struct-current').classList.contains('icon-only')).toBe(false);
    expect($('struct-current').textContent).toBe('Current step');
  });

  it('keeps Expand all and Collapse all as an icon pair with names and tooltips', () => {
    ['struct-expand', 'struct-collapse'].forEach((id) => {
      expect($(id).classList.contains('icon-only')).toBe(true);
      expect($(id).title.length).toBeGreaterThan(10);
    });
    expect($('struct-expand').textContent).toBe('Expand all');
    expect($('struct-collapse').textContent).toBe('Collapse all');
    expect($('struct-expand').nextElementSibling).toBe($('struct-collapse'));
  });

  it('keeps a short placeholder that reads at the filter\'s 140 px minimum, and the checkboxes are gone', () => {
    const rule = [...css.matchAll(/#struct-filter\s*\{([^}]*)\}/g)].pop()[1];
    expect(rule).toMatch(/min-width:\s*140px/);
    expect($('struct-filter').placeholder).toBe('Filter elements');
    ['struct-actions-only', 'struct-autocollapse', 'struct-hover', 'struct-visible-only', 'struct-timeline', 'struct-export']
      .forEach((id) => expect($(id)).toBeNull());
  });

  it('says exactly what Refresh re-reads, apart from Data\'s Refresh', () => {
    expect($('struct-refresh').title).toMatch(/definition and custom labels/);
    expect($('struct-refresh').title).toMatch(/selection and folds stay/);
    expect($('struct-refresh').title).not.toBe($('refresh').title);
    const entry = STRUCTURE_HELP.allSections.flatMap(([, entries]) => entries).find(([title]) => title === 'Refresh');
    expect(entry[2].short).toMatch(/definition and custom labels/);
    expect(entry[1]).toMatch(/does not read the data JSON/);
  });

  it('points the first-run tour at a control that exists', () => {
    TOUR.forEach((step) => expect(document.querySelector(step.anchor)).not.toBeNull());
  });
});
