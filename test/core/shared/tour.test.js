'use strict';

import { plainChips } from '../../../src/core/shared/chips.js';
import { parseQuery, hasQuery } from '../../../src/core/shared/actions-search.js';
import {
  TOUR_KEY, TOUR_KEYS, ALL_TOUR_KEYS, MAX_TAB_STEPS, TOUR_STEPS, tourSteps, tourToShow, nextStep, stepCount, anchorOf, cardLeft, unionBox,
  tabTourSteps, tabTourDue, dismissAllFlags, stepText, MAX_STEP_TEXT
} from '../../../src/core/shared/tour.js';

describe('TOUR_STEPS', () => {
  it('has four steps: the picker, the tabs, the filter box and the settings gear', () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual(['picker', 'tabs', 'filter', 'help']);
  });

  it('says what each control is for', () => {
    expect(TOUR_STEPS[0].text).toBe('The OmniScript on the page is picked for you; with several, choose one. Press [[Rescan]] if it is missing.');
    expect(TOUR_STEPS[1].text).toContain('Data shows what the script holds');
    expect(stepText(TOUR_STEPS[2], 'data')).toBe('Type to narrow the tree; a path, key=value or $ query works too.');
    expect(TOUR_STEPS[3].text).toBe('The [[?]] button opens help. The gear, [[Settings]], opens settings and the debug bundle.');
    TOUR_STEPS.forEach((step) => { expect(step.title).toBeTruthy(); expect(step.anchor).toBeTruthy(); });
  });

  it('ends at the gear in the Free build, which has no debug bundle', () => {
    expect(tourSteps()).toBe(TOUR_STEPS);
    const free = tourSteps(true);
    expect(free.map((step) => step.id)).toEqual(TOUR_STEPS.map((step) => step.id));
    expect(free[3].text).toBe('The [[?]] button opens help. The gear, [[Settings]], opens settings.');
    expect(free.slice(0, 2)).toEqual(TOUR_STEPS.slice(0, 2));
  });

  it('words the filter step for the tab it is on, and for the edition', () => {
    const full = tourSteps(false)[2];
    const free = tourSteps(true)[2];
    expect(stepText(full, 'actions')).toContain('in:, url:, step:, slow: and repeat:');
    expect(stepText(free, 'actions')).toContain('in:, url:, step: and repeat:');
    expect(stepText(free, 'actions')).not.toContain('slow');
    expect(stepText(free, 'data')).not.toContain('$');
    expect(stepText(full, 'structure')).toContain('override:');
    expect(stepText(full, 'unknown tab')).toBe(full.text);
    expect(stepText({ text: 'Plain' }, 'data')).toBe('Plain');
  });

  it('names no filter prefix that the filter does not take, and keeps every sentence short', () => {
    [tourSteps(false)[2], tourSteps(true)[2]].forEach((step) => {
      ['data', 'structure', 'actions'].forEach((tab) => {
        const text = plainChips(stepText(step, tab));
        expect(text.length).toBeLessThan(MAX_STEP_TEXT);
        expect(plainChips(text)).not.toContain('?');
        const named = [...text.matchAll(/\b(in|url|step|slow|repeat|override):/g)].map((found) => found[1]);
        named.filter((name) => name !== 'override').forEach((name) => {
          const parsed = parseQuery(name === 'repeat' ? 'repeat:' : name === 'slow' ? 'slow:500' : `${name}:x`);
          expect(hasQuery(parsed)).toBe(true);
        });
      });
    });
  });

  it('is stored under tourSeen', () => {
    expect(TOUR_KEY).toBe('tourSeen');
  });
});

describe('tourToShow', () => {
  it('is due only while the flag is absent', () => {
    expect(tourToShow(undefined)).toBe(true);
    expect(tourToShow(null)).toBe(true);
    expect(tourToShow(false)).toBe(true);
  });

  it('is not due once the flag is set, whatever its shape', () => {
    expect(tourToShow(true)).toBe(false);
    expect(tourToShow(1)).toBe(false);
    expect(tourToShow('yes')).toBe(false);
    expect(tourToShow({})).toBe(false);
  });
});

describe('nextStep', () => {
  it('moves on with next and ends the tour after the last step', () => {
    expect(nextStep(0, 'next')).toBe(1);
    expect(nextStep(2, 'next')).toBe(3);
    expect(nextStep(3, 'next')).toBeNull();
  });

  it('moves back with back and stops at the first step', () => {
    expect(nextStep(3, 'back')).toBe(2);
    expect(nextStep(0, 'back')).toBe(0);
  });

  it('ends the tour on skip or anything else', () => {
    expect(nextStep(1, 'skip')).toBeNull();
    expect(nextStep(1, 'sideways')).toBeNull();
    expect(nextStep(1, undefined)).toBeNull();
  });

  it('reads an index that is not a step as the first', () => {
    expect(nextStep(-4, 'next')).toBe(1);
    expect(nextStep(99, 'next')).toBe(1);
    expect(nextStep('x', 'back')).toBe(0);
  });

  it('takes the step count from the caller', () => {
    expect(nextStep(1, 'next', 2)).toBeNull();
    expect(nextStep(0, 'next', 2)).toBe(1);
  });
});

describe('stepCount', () => {
  it('counts from one', () => {
    expect(stepCount(0)).toBe('1 of 4');
    expect(stepCount(3)).toBe('4 of 4');
    expect(stepCount(0, 2)).toBe('1 of 2');
  });
});

describe('anchorOf', () => {
  it('points the filter step at the filter box of the tab on screen', () => {
    const filter = TOUR_STEPS[2];
    expect(anchorOf(filter, 'data')).toBe('#filter');
    expect(anchorOf(filter, 'structure')).toBe('#struct-filter');
    expect(anchorOf(filter, 'actions')).toBe('#log-filter');
    expect(anchorOf(filter, 'unknown')).toBe('#filter');
  });

  it('points the other steps at their own control', () => {
    expect(anchorOf(TOUR_STEPS[0], 'structure')).toBe('#target');
    expect(anchorOf(TOUR_STEPS[3], 'actions')).toBe('#help, #settings');
  });
});

describe('cardLeft', () => {
  const box = { left: 0, right: 900 };

  it('puts a card at its anchor\'s left edge unless the step asks for the right', () => {
    expect(cardLeft(TOUR_STEPS[0], { left: 40, right: 300 }, 260)).toBe(40);
    expect(cardLeft(TOUR_STEPS[2], { left: 3, right: 300 }, 260)).toBe(8);
  });

  it('rings the three tabs, not the strip, and stands the card under the first of them', () => {
    const tabs = TOUR_STEPS.find((step) => step.id === 'tabs');
    expect(tabs.anchor).toBe('[role="tab"]');
    expect(tabs.all).toBe(true);
    expect(tabs.align).toBeUndefined();
    expect(cardLeft(tabs, { left: 4, right: 330 }, 260)).toBe(8);
    expect(cardLeft(tabs, { left: 40, right: 330 }, 260)).toBe(40);
  });

  it('can still end a card at its anchor\'s right edge', () => {
    expect(cardLeft({ align: 'end' }, box, 260)).toBe(640);
  });

  it('keeps a card that is wider than its anchor inside the panel', () => {
    expect(cardLeft({ align: 'end' }, { left: 0, right: 120 }, 260)).toBe(8);
  });
});

describe('unionBox', () => {
  it('is the smallest box around the boxes', () => {
    expect(unionBox([{ left: 10, right: 60, top: 30, bottom: 50 }, { left: 70, right: 160, top: 28, bottom: 52 }]))
      .toEqual({ left: 10, right: 160, top: 28, bottom: 52 });
  });

  it('is null for none', () => {
    expect(unionBox([])).toBeNull();
    expect(unionBox(undefined)).toBeNull();
    expect(unionBox([null])).toBeNull();
  });
});

describe('the flags', () => {
  it('are one yes-or-no per tour: the panel tour and one for each tab', () => {
    expect(TOUR_KEYS).toEqual({ panel: 'tourSeen', data: 'tourSeenData', structure: 'tourSeenStructure', actions: 'tourSeenActions' });
    expect(ALL_TOUR_KEYS).toEqual(['tourSeen', 'tourSeenData', 'tourSeenStructure', 'tourSeenActions']);
  });

  it('are all set at once by Don\'t show tours', () => {
    expect(dismissAllFlags()).toEqual({ tourSeen: true, tourSeenData: true, tourSeenStructure: true, tourSeenActions: true });
  });
});

describe('tabTourSteps', () => {
  const step = (n) => ({ anchor: `#a${n}`, title: `T${n}`, text: `Do ${n}.` });

  it('keeps at most three steps, in order', () => {
    expect(MAX_TAB_STEPS).toBe(3);
    expect(tabTourSteps([step(1), step(2), step(3), step(4)]).map((item) => item.anchor)).toEqual(['#a1', '#a2', '#a3']);
  });

  it('drops what is not an anchor with a title and a text, and copes with junk', () => {
    expect(tabTourSteps([step(1), { anchor: '', title: 'x', text: 'y' }, { anchor: '#b', text: 'y' }, null, 5, { anchor: '#c', title: 't', text: ' ' }]))
      .toHaveLength(1);
    expect(tabTourSteps(undefined)).toEqual([]);
    expect(tabTourSteps('nope')).toEqual([]);
  });
});

describe('tabTourDue', () => {
  const base = { tab: 'structure', flags: {}, tourOpen: false, dialogOpen: false, shownThisSession: false };

  it('is due for a tab whose flag is absent, when nothing else is going on', () => {
    expect(tabTourDue(base)).toBe(true);
    expect(tabTourDue({ ...base, flags: { tourSeen: true, tourSeenData: true } })).toBe(true);
    expect(tabTourDue({ ...base, flags: { tourSeenStructure: false } })).toBe(true);
  });

  it('is not due once that tab\'s flag is set, whatever its shape', () => {
    expect(tabTourDue({ ...base, flags: { tourSeenStructure: true } })).toBe(false);
    expect(tabTourDue({ ...base, flags: { tourSeenStructure: 'yes' } })).toBe(false);
  });

  it('never while another tour or a dialog is open', () => {
    expect(tabTourDue({ ...base, tourOpen: true })).toBe(false);
    expect(tabTourDue({ ...base, dialogOpen: true })).toBe(false);
  });

  it('never in a session that already showed a tour, the panel tour included', () => {
    expect(tabTourDue({ ...base, shownThisSession: true })).toBe(false);
  });

  it('has no tour for the panel or for a tab it does not know', () => {
    expect(tabTourDue({ ...base, tab: 'panel' })).toBe(false);
    expect(tabTourDue({ ...base, tab: 'route' })).toBe(false);
    expect(tabTourDue({ ...base, tab: undefined })).toBe(false);
  });
});
