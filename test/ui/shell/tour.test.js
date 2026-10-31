'use strict';

/* The first-run tour: four steps as a small card by the control each describes,
 * shown while the stored `tourSeen` flag is absent, written when it is closed,
 * and started again from the help's Start here. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const SEEN = { tourSeen: true, tourSeenData: true, tourSeenStructure: true, tourSeenActions: true };
const $ = (id) => document.getElementById(id);
const card = () => document.querySelector('.tour-card');
const title = () => card().querySelector('.tour-title').textContent;
const text = () => card().querySelector('.tour-text').textContent;
const move = (how) => card().querySelector(`[data-move="${how}"]`).click();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const press = (key, target = document.body) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};

function stubStorage(storage) {
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const calls = { set: [], remove: [] };
  global.chrome.storage = {
    local: {
      get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in storage).map((name) => [name, copy(storage[name])])),
      set: async (values) => { calls.set.push(values); Object.entries(values).forEach(([name, value]) => { storage[name] = copy(value); }); },
      remove: async (key) => { calls.remove.push(key); [].concat(key).forEach((name) => { delete storage[name]; }); }
    }
  };
  return calls;
}

async function boot(storage, { free = false } = {}) {
  jest.resetModules();
  mountPanelMarkup({ free });
  stubChromeDevtools();
  const calls = storage ? stubStorage(storage) : null;
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
  await flush();
  return calls;
}

afterEach(() => {
  /* Close a tour left open, so its document listeners do not outlive the test. */
  if (card()) card().querySelector('[data-move="skip"]').click();
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('first-run tour', () => {
  it('shows step 1 on the first boot, as a dialog that names itself and counts its steps', async () => {
    await boot({});
    expect(card()).not.toBeNull();
    expect(card().getAttribute('role')).toBe('dialog');
    const label = $(card().getAttribute('aria-labelledby'));
    expect(label.textContent).toBe('1 of 4: OmniScript');
    expect(text()).toBe('The OmniScript on the page is picked for you; with several, choose one. Press Rescan if it is missing.');
    expect([...card().querySelectorAll('.tour-text .ctl-chip')].map((chip) => chip.textContent)).toEqual(['Rescan']);
    expect(card().getAttribute('aria-describedby')).toBe('tour-text');
    expect(card().querySelector('[role="status"]').textContent).toContain('1 of 4');
    expect(card().querySelectorAll('.tour-dots i')).toHaveLength(4);
    expect(card().querySelector('.tour-dots i.is-on')).toBe(card().querySelector('.tour-dots i'));
    expect($('target').classList.contains('tour-target')).toBe(true);
  });

  it('is not a modal: nothing is dimmed and the panel keeps working', async () => {
    await boot({});
    expect(card().getAttribute('aria-modal')).toBeNull();
    $('tab-structure').click();
    expect($('view-structure').hidden).toBe(false);
  });

  it('gives every button a tooltip and puts the keyboard on Next', async () => {
    await boot({});
    card().querySelectorAll('button').forEach((control) => expect(control.title).not.toBe(''));
    expect(document.activeElement).toBe(card().querySelector('[data-move="next"]'));
    expect(card().querySelector('[data-move="back"]').disabled).toBe(true);
  });

  it('words its buttons and counter as the Words list does: Previous tip, Next tip, "2 of 4", Done', async () => {
    await boot({});
    const counter = () => card().querySelector('.tour-counter').textContent;
    expect(card().querySelector('[data-move="back"]').textContent).toBe('Previous tip');
    expect(card().querySelector('[data-move="next"]').textContent).toBe('Next tip');
    expect(counter()).toBe('1 of 4');
    move('next');
    expect(counter()).toBe('2 of 4');
    move('next');
    move('next');
    expect(counter()).toBe('4 of 4');
    expect(card().querySelector('[data-move="next"]').textContent).toBe('Done');
  });

  it('puts the Tabs card under the tabs, at the left of the first, ringing only the tabs', async () => {
    await boot({});
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, at) => {
      tab.getBoundingClientRect = () => ({ left: 20 + at * 90, right: 100 + at * 90, top: 40, bottom: 66, width: 80, height: 26 });
    });
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
    try {
      move('next');
      expect(card().style.left).toBe('20px');
      expect(card().style.top).toBe('74px');
      expect(document.querySelectorAll('.tour-target')).toHaveLength(3);
      move('next'); // the filter box follows its own control again
      expect(document.querySelectorAll('.tour-target')).toHaveLength(1);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width);
    }
  });

  it('goes Back, and Back is not available on the first step', async () => {
    await boot({});
    move('next');
    move('next');
    move('back');
    expect(title()).toContain('2 of 4');
    move('back');
    expect(title()).toContain('1 of 4');
    expect(card().querySelector('[data-move="back"]').disabled).toBe(true);
  });

  it('points the filter step at the filter box of the tab on screen', async () => {
    await boot({});
    $('tab-actions').click();
    move('next');
    move('next');
    expect($('log-filter').classList.contains('tour-target')).toBe(true);
    expect($('filter').classList.contains('tour-target')).toBe(false);

    /* The sentence of the build under test: only the full build names $ queries and slow:. */
    const { tourSteps, stepText } = await import('../../../src/core/shared/tour.js');
    const { isFreeBuild } = await import('../../../src/ui/free-build.js');
    const filterStep = tourSteps(isFreeBuild())[2];
    expect(text()).toBe(stepText(filterStep, 'actions'));

    $('tab-structure').click();
    await flush();
    expect(text()).toBe(stepText(filterStep, 'structure'));
    expect($('struct-filter').classList.contains('tour-target')).toBe(true);
    expect($('log-filter').classList.contains('tour-target')).toBe(false);
  });

  it('words the filter step for the Free build: no $ queries, no slow:', async () => {
    await boot({}, { free: true });
    move('next');
    move('next');
    expect(text()).toBe('Type to narrow the tree; a path or key=value works too.');
    $('tab-actions').click();
    await flush();
    expect(text()).toBe('Type to narrow by name; in:, url:, step: and repeat: refine it.');
  });

  it('Esc skips it too, and leaves the focus where it was', async () => {
    const storage = {};
    jest.resetModules();
    mountPanelMarkup();
    stubChromeDevtools();
    stubStorage(storage);
    $('rescan').focus();
    await import('../../../src/ui/app.js');
    await flush();
    expect(card()).not.toBeNull();
    const ev = press('Escape');
    expect(ev.defaultPrevented).toBe(true);
    await flush();
    expect(card()).toBeNull();
    expect(storage.tourSeen).toBe(true);
    expect(document.activeElement).toBe($('rescan'));
  });

  it('leaves Esc to the help dialog while it is open', async () => {
    await boot({});
    $('help').click();
    press('Escape');
    expect($('help-overlay').hidden).toBe(true);
    expect(card()).not.toBeNull();
    press('Escape');
    expect(card()).toBeNull();
  });

  it('"Show the tour again" in Start here forgets the flag and brings the tour back', async () => {
    const storage = { ...SEEN };
    const calls = await boot(storage);
    expect(card()).toBeNull();

    $('help').click();
    const again = $('help-tour');
    expect(again.textContent).toBe('Show the tour again');
    expect(again.title).not.toBe('');
    again.click();
    await flush();
    expect($('help-overlay').hidden).toBe(true);
    expect(card()).not.toBeNull();
    expect(title()).toContain('1 of 4');
    expect(calls.remove).toEqual(['tourSeen', 'tourSeenData', 'tourSeenStructure', 'tourSeenActions']);
    expect(Object.keys(storage)).toEqual([]); // every tour's flag is cleared

    move('skip');
    await flush();
    expect(storage.tourSeen).toBe(true);
  });

  it('does not start without storage, since it could never be marked as seen', async () => {
    await boot();
    expect(card()).toBeNull();
  });

  it('starts when the stored flag is not a yes, and not for any other value', async () => {
    await boot({ ...SEEN, tourSeen: false });
    expect(title()).toContain('OmniScript');
    document.body.innerHTML = '';
    await boot({ ...SEEN, tourSeen: 'yes' });
    expect(card()).toBeNull();
  });

  it('is not tied to Remember my settings: the flag is written with it off', async () => {
    const storage = {};
    await boot(storage);
    move('skip');
    await flush();
    expect(storage.settings).toBeUndefined();
    expect(storage.tourSeen).toBe(true);
  });

  it('has a help entry', async () => {
    await boot({ ...SEEN });
    $('help').click();
    $('help-search').value = 'tour';
    $('help-search').dispatchEvent(new Event('input'));
    const terms = Array.from(document.querySelectorAll('#help-body dt')).map((dt) => dt.textContent);
    expect(terms).toContain('Tour');
  });
});
