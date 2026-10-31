'use strict';

/* The tour of each tab: three steps at most, shown the first time that tab is
 * opened, never while another tour or a dialog is open, never in the same
 * session as another tour, with a "Don't show tours" link on every card and one
 * stored flag per tour. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { TOUR as STRUCTURE_TOUR } from '../../../src/ui/help/structure.js';
import { TOUR as ACTIONS_TOUR } from '../../../src/ui/help/actions.js';

const PANEL_SEEN = { tourSeen: true };
const ALL_SEEN = { tourSeen: true, tourSeenData: true, tourSeenStructure: true, tourSeenActions: true };

const $ = (id) => document.getElementById(id);
const cards = () => document.querySelectorAll('.tour-card');
const card = () => document.querySelector('.tour-card');
const title = () => card().querySelector('.tour-title').textContent;
const move = (how) => card().querySelector(`[data-move="${how}"]`).click();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const press = (key) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  global.chrome.storage = {
    local: {
      get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, copy(storage[name])])),
      set: async (values) => { Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
}

async function boot(storage) {
  jest.resetModules();
  mountPanelMarkup();
  stubChromeDevtools();
  stubStorage(storage);
  await import('../../../src/ui/app.js');
  await flush();
}

const openTab = async (name) => { $(`tab-${name}`).click(); await flush(); };

afterEach(() => {
  if (card()) card().querySelector('[data-move="off"]').click();
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('when a tab tour starts', () => {
  it('writes only its own flag when it ends, and the other tabs wait for another session', async () => {
    const storage = { ...PANEL_SEEN };
    await boot(storage);
    move('skip');
    await flush();
    expect(storage).toEqual({ tourSeen: true, tourSeenData: true });
    await openTab('structure');
    expect(card()).toBeNull(); // one tour a session
    await openTab('actions');
    expect(card()).toBeNull();
  });

  it('shows the next tab\'s tour the next time DevTools opens, the first time that tab is opened', async () => {
    const storage = { ...PANEL_SEEN, tourSeenData: true };
    await boot(storage);
    expect(card()).toBeNull(); // the tab on screen was seen
    await openTab('structure');
    expect(cards()).toHaveLength(1);
    expect(title()).toBe('1 of 3: Find an element');
    expect($('struct-filter').classList.contains('tour-target')).toBe(true);
    press('Escape'); // Esc skips this tour only
    await flush();
    expect(card()).toBeNull();
    expect(storage).toEqual({ tourSeen: true, tourSeenData: true, tourSeenStructure: true });
    await openTab('actions');
    expect(card()).toBeNull();

    document.body.innerHTML = '';
    await boot(storage);
    await openTab('actions');
    expect(title()).toBe('1 of 3: Recording');
    expect($('log-record').classList.contains('tour-target')).toBe(true);
  });

  it('does not start in the session of the panel tour', async () => {
    const storage = {};
    await boot(storage);
    expect(title()).toContain('1 of 4');
    await openTab('structure');
    expect(cards()).toHaveLength(1); // still the panel tour
    expect(title()).toContain('1 of 4');
    move('skip');
    await flush();
    await openTab('actions');
    expect(card()).toBeNull();
    expect(storage).toEqual({ tourSeen: true });
  });

  it('does not start while a dialog is open', async () => {
    await boot({ ...PANEL_SEEN, tourSeenData: true });
    $('help').click();
    await openTab('structure');
    expect(card()).toBeNull();
    press('Escape');
    await openTab('data');
    await openTab('structure');
    expect(card()).not.toBeNull(); // the help is closed now: the tab was not used up
  });

  it('does not start while another tour is open, never shows two cards, and drops a tour whose tab was left', async () => {
    await boot({ ...PANEL_SEEN });
    expect(title()).toContain('Find a value');
    await openTab('structure');
    // The Data tour goes with its tab, and the Structure one waits: one tour a session.
    expect(cards()).toHaveLength(0);
  });

  it('skips a step whose control is not on screen', async () => {
    await boot({ ...PANEL_SEEN, tourSeenData: true });
    $('struct-view').hidden = true;
    await openTab('structure');
    expect(card().querySelectorAll('.tour-dots i')).toHaveLength(2);
  });
});

describe('a tab tour and the tab on screen', () => {
  it('goes when another tab is opened, without being marked seen, and is due again next time', async () => {
    const storage = { ...PANEL_SEEN, tourSeenData: true };
    await boot(storage);
    await openTab('structure');
    expect(title()).toBe('1 of 3: Find an element');
    await openTab('actions');
    expect(card()).toBeNull(); // no stale card at the top left, ringing nothing
    expect(document.querySelector('.tour-target')).toBeNull();
    await flush();
    expect(storage).toEqual({ ...PANEL_SEEN, tourSeenData: true });

    document.body.innerHTML = '';
    await boot(storage);
    await openTab('structure');
    expect(title()).toBe('1 of 3: Find an element');
  });

  it('leaves the panel tour on screen across a tab change: it is about the panel', async () => {
    await boot({});
    await openTab('structure');
    expect(title()).toContain('1 of 4');
  });
});

describe('Esc and a tab tour', () => {
  it('in a filter box clears the filter and leaves the tour alone', async () => {
    const storage = { ...PANEL_SEEN };
    await boot(storage);
    const filter = $('filter');
    filter.focus();
    filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush();
    expect(card()).not.toBeNull();
    expect(storage).toEqual({ ...PANEL_SEEN });
  });

  it('does nothing to the tour while the focus is outside the card', async () => {
    const storage = { ...PANEL_SEEN };
    await boot(storage);
    $('settings').focus();
    press('Escape');
    await flush();
    expect(card()).not.toBeNull();
    expect(storage).toEqual({ ...PANEL_SEEN });
  });

  it('ends the tour, as seen, when the card has the focus', async () => {
    const storage = { ...PANEL_SEEN };
    await boot(storage);
    expect(card().contains(document.activeElement)).toBe(true);
    press('Escape');
    await flush();
    expect(card()).toBeNull();
    expect(storage).toEqual({ ...PANEL_SEEN, tourSeenData: true });
  });
});

describe("Don't show tours", () => {
  it('is on every card: the panel tour and a tab tour', async () => {
    await boot({});
    const off = card().querySelector('[data-move="off"]');
    expect(off.textContent).toBe('Don’t show tours');
    expect(off.title).not.toBe('');
    expect(off.hidden).toBe(false);
    move('next');
    move('next');
    move('next');
    expect(card().querySelector('[data-move="off"]').hidden).toBe(false); // the last step too

    document.body.innerHTML = '';
    await boot({ tourSeen: true });
    expect(card().querySelector('[data-move="off"]')).not.toBeNull();
  });

  it('sets all four flags at once, closes the card and shows no tour again', async () => {
    const storage = { tourSeen: true };
    await boot(storage);
    move('off');
    await flush();
    expect(card()).toBeNull();
    expect(storage).toEqual(ALL_SEEN);
    await openTab('structure');
    expect(card()).toBeNull();

    document.body.innerHTML = '';
    await boot(storage);
    await openTab('actions');
    expect(card()).toBeNull();
  });

  it('is brought back by "Show the tour again", which clears every flag', async () => {
    const storage = { ...ALL_SEEN };
    await boot(storage);
    $('help').click();
    $('help-tour').click();
    await flush();
    expect(storage).toEqual({});
    expect(title()).toContain('1 of 4');
  });
});

describe('Show the tour again while a tab tour is open', () => {
  it('closes that tour and starts the panel tour, with every flag forgotten', async () => {
    const storage = { ...PANEL_SEEN };
    await boot(storage);
    expect(title()).toContain('Find a value'); // the Data tab's tour
    $('help').click();
    $('help-tour').click();
    await flush();
    expect(cards()).toHaveLength(1);
    expect(title()).toContain('1 of 4');
    expect(storage).toEqual({});
  });
});

describe('Take the tour (Start here in the help)', () => {
  const openHelpOn = async (tab) => { await openTab(tab); $('help').click(); };

  it.each([['structure', STRUCTURE_TOUR], ['actions', ACTIONS_TOUR]])('starts the tour of %s from its own help', async (tab, steps) => {
    await boot({ ...ALL_SEEN });
    await openHelpOn(tab);
    $('help-take-tour').click();
    await flush();
    expect(title()).toContain(steps[0].title);
    expect(document.querySelector(`#view-${tab}`).hidden).toBe(false);
  });

  it('does not forget which tours were seen, and shows the tour though its flag says it was seen', async () => {
    const storage = { ...ALL_SEEN };
    await boot(storage);
    $('help').click();
    $('help-take-tour').click();
    await flush();
    expect(cards()).toHaveLength(1);
    expect(storage).toEqual(ALL_SEEN);
  });

  it('is left out while the help is narrowed by a search, like the rest of Start here', async () => {
    await boot({ ...ALL_SEEN });
    $('help').click();
    $('help-search').value = 'filter';
    $('help-search').dispatchEvent(new Event('input'));
    expect($('help-take-tour')).toBeNull();
  });
});

describe('startTabTour', () => {
  it('switches to the tab when another one is on screen, and starts its tour without resetting the others', async () => {
    const storage = { ...ALL_SEEN };
    await boot(storage);
    const { startTabTour } = await import('../../../src/ui/tour.js');
    expect(startTabTour('actions')).toBe(true);
    await flush();
    expect($('tab-actions').getAttribute('aria-selected')).toBe('true');
    expect(title()).toContain(ACTIONS_TOUR[0].title);
    expect(storage).toEqual(ALL_SEEN);
    move('skip');
    await flush();
    expect(storage).toEqual(ALL_SEEN);
  });

  it('refuses a name that is not a tab', async () => {
    await boot({ ...ALL_SEEN });
    const { startTabTour } = await import('../../../src/ui/tour.js');
    expect(startTabTour('replay')).toBe(false);
    expect(startTabTour('constructor')).toBe(false);
    expect(cards()).toHaveLength(0);
  });
});

describe('Show tours again (Settings, General)', () => {
  it('does what the link in the help does: closes Settings, forgets every flag and starts the panel tour', async () => {
    const storage = { ...ALL_SEEN };
    await boot(storage);
    $('settings').click();
    const again = $('settings-show-tours');
    expect(again.textContent).toBe('Show tours again');
    expect(again.title).toMatch(/show all the tours again/);
    expect(again.closest('#settings-body')).not.toBeNull();
    again.click();
    await flush();
    expect($('settings-overlay').hidden).toBe(true);
    expect(storage).toEqual({});
    expect(cards()).toHaveLength(1);
    expect(title()).toContain('1 of 4');
  });
});

describe('what the tours store', () => {
  it('is four yes-or-no flags in extension storage, with Remember my settings off', async () => {
    const storage = {};
    await boot(storage);
    move('skip');
    await flush();
    expect(storage).toEqual({ tourSeen: true });
    expect(storage.settings).toBeUndefined();
    Object.values(storage).forEach((value) => expect(typeof value).toBe('boolean'));
  });

  it('starts no tour without storage', async () => {
    jest.resetModules();
    mountPanelMarkup();
    stubChromeDevtools();
    await import('../../../src/ui/app.js');
    await flush();
    await openTab('structure');
    expect(card()).toBeNull();
  });
});
