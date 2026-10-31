'use strict';

/* Keyboard and screen-reader behaviour of the panel: the tabs pattern, the two
 * row lists, the help dialog, the split divider and the status announcer. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

const press = (target, key, init = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

beforeAll(async () => {
  stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
});

describe('tabs', () => {
  const tab = (name) => document.getElementById(`tab-${name}`);

  it('links each tab to its panel and rolls the tabindex', () => {
    ['data', 'structure', 'actions'].forEach((name) => {
      expect(tab(name).getAttribute('aria-controls')).toBe(`view-${name}`);
      expect(document.getElementById(`view-${name}`).getAttribute('aria-labelledby')).toBe(`tab-${name}`);
    });
    expect(tab('data').tabIndex).toBe(0);
    expect(tab('structure').tabIndex).toBe(-1);
  });

  it('moves with Left / Right, wraps, and honours Home / End', () => {
    tab('data').focus();
    press(tab('data'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('structure'));
    expect(tab('structure').getAttribute('aria-selected')).toBe('true');
    expect(tab('structure').tabIndex).toBe(0);
    expect(tab('data').tabIndex).toBe(-1);
    expect(document.getElementById('view-structure').hidden).toBe(false);

    press(tab('structure'), 'End');
    expect(document.activeElement).toBe(tab('actions'));
    press(tab('actions'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('data'));
    press(tab('data'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('actions'));
    press(tab('actions'), 'ArrowLeft');
    expect(document.activeElement).toBe(tab('structure'));
    press(tab('structure'), 'ArrowRight');
    expect(document.activeElement).toBe(tab('actions'));
    press(tab('actions'), 'Home');
    expect(document.activeElement).toBe(tab('data'));
    expect(document.getElementById('view-data').hidden).toBe(false);
  });

  it('keeps single-letter shortcuts out of text fields', () => {
    const filter = document.getElementById('filter');
    filter.focus();
    press(filter, '2');
    expect(document.getElementById('view-data').hidden).toBe(false);
    press(document.body, '2');
    expect(document.getElementById('view-structure').hidden).toBe(false);
    document.getElementById('tab-data').click();
  });
});

describe('help dialog', () => {
  it('takes focus, traps Tab, closes on Escape and returns focus', () => {
    const opener = document.getElementById('help');
    const card = document.querySelector('.help-card');
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');

    opener.focus();
    opener.click();
    expect(document.getElementById('help-overlay').hidden).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('help-search'));

    const items = Array.from(card.querySelectorAll('button, a[href], summary'))
      .filter((node) => !node.closest('[hidden]') && !(node.tagName !== 'SUMMARY' && node.closest('details:not([open])')));
    const last = items[items.length - 1];
    last.focus();
    const tab = press(last, 'Tab');
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);

    const back = press(items[0], 'Tab', { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    press(document.activeElement, 'Escape');
    expect(document.getElementById('help-overlay').hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('ignores other shortcuts while open, and restores focus to the opener', () => {
    const tabData = document.getElementById('tab-data');
    tabData.focus();
    press(tabData, 'h');
    expect(document.getElementById('help-overlay').hidden).toBe(false);
    press(document.activeElement, '2');
    expect(document.getElementById('view-structure').hidden).toBe(true);
    /* The search box has focus, so ? is typed there; Escape closes. */
    press(document.activeElement, 'h');
    expect(document.getElementById('help-overlay').hidden).toBe(false);
    press(document.activeElement, 'Escape');
    expect(document.activeElement).toBe(tabData);
  });
});

describe('split divider', () => {
  it('is a focusable separator that resizes with the arrow keys', async () => {
    document.body.innerHTML = '<div class="split"><div id="a"></div><div id="b"></div></div>';
    const split = document.querySelector('.split');
    Object.defineProperty(split, 'clientWidth', { value: 1000 });
    document.getElementById('a').getBoundingClientRect = () => ({ width: 400, height: 0 });
    const { initSplitPane } = await import('../../../src/ui/split.js');
    initSplitPane(split);

    const divider = split.querySelector('.split-divider');
    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.tabIndex).toBe(0);
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-valuenow')).toBe('40');

    const right = press(divider, 'ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    expect(split.style.getPropertyValue('--list-w')).toBe('41.60%');
    expect(divider.getAttribute('aria-valuenow')).toBe('42');

    press(divider, 'ArrowLeft', { shiftKey: true });
    expect(split.style.getPropertyValue('--list-w')).toBe('33.60%');

    /* Either pane can shrink to 80px, so almost the whole split is usable. */
    document.getElementById('a').getBoundingClientRect = () => ({ width: 100, height: 0 });
    press(divider, 'ArrowLeft', { shiftKey: true });
    expect(split.style.getPropertyValue('--list-w')).toBe('8.00%');

    document.getElementById('a').getBoundingClientRect = () => ({ width: 900, height: 0 });
    press(divider, 'ArrowRight', { shiftKey: true });
    expect(split.style.getPropertyValue('--list-w')).toBe('92.00%');
  });
});

describe('split divider before it has a size', () => {
  it('still carries aria-valuenow, min, max and orientation (a hidden tab is not laid out)', async () => {
    document.body.innerHTML = '<div class="split"><div id="a"></div><div id="b"></div></div>';
    const split = document.querySelector('.split'); // jsdom lays nothing out: no width
    const { initSplitPane } = await import('../../../src/ui/split.js');
    initSplitPane(split);
    const divider = split.querySelector('.split-divider');
    expect(divider.getAttribute('aria-valuenow')).toBe('46');
    expect(divider.getAttribute('aria-valuemin')).toBe('0');
    expect(divider.getAttribute('aria-valuemax')).toBe('100');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('reports the width it was dragged to rather than the default', async () => {
    document.body.innerHTML = '<div class="split"><div id="a"></div><div id="b"></div></div>';
    const split = document.querySelector('.split');
    split.style.setProperty('--list-w', '30.00%');
    const { initSplitPane } = await import('../../../src/ui/split.js');
    initSplitPane(split);
    expect(split.querySelector('.split-divider').getAttribute('aria-valuenow')).toBe('30');
  });
});

describe('status announcer', () => {
  it('ignores clock and size churn but announces real changes', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = '<span id="live"></span><span id="l"></span><span id="r"></span>';
    const { mountLiveStatus } = await import('../../../src/ui/live-status.js');
    const l = document.getElementById('l');
    const r = document.getElementById('r');
    const live = document.getElementById('live');
    mountLiveStatus(live, [l, r]);

    const settle = async () => { await Promise.resolve(); jest.advanceTimersByTime(1000); };
    l.textContent = '1 OmniScript · A · 2.0 KB';
    r.innerHTML = 'Live<span data-quiet> · changed 10:00:01 a.m.</span>';
    await settle();
    expect(live.textContent).toBe('1 OmniScript · A · Live');

    live.textContent = 'marker';
    l.textContent = '1 OmniScript · A · 2.1 KB';
    r.innerHTML = 'Live<span data-quiet> · changed 10.00.02 Uhr</span> · 3 value(s) updated';
    await settle();
    expect(live.textContent).toBe('marker');

    r.textContent = 'Stale (OmniScript gone)';
    await settle();
    expect(live.textContent).toBe('1 OmniScript · A · Stale (OmniScript gone)');
    jest.useRealTimers();
  });
});

describe('Calls list', () => {
  let listeners;

  function call(id) {
    const message = JSON.stringify({ actions: [{ id, descriptor: 'aura://ApexActionController/ACTION$execute', params: {
      classname: 'omnistudiocore.IPService', method: 'invokeMethod',
      params: { sClassName: 'omnistudiocore.IPService', sMethodName: `Proc${id}`, input: '{}', options: {} } } }] });
    return {
      request: { url: 'https://x/aura', method: 'POST', postData: { text: new URLSearchParams({ message }).toString() } },
      response: { status: 200, bodySize: 1 },
      time: 5,
      startedDateTime: new Date(2024, 0, 1, 0, 0, Number(id)).toISOString(),
      getContent: (cb) => cb(`while(1);${JSON.stringify({ actions: [{ id, state: 'SUCCESS', returnValue: { returnValue: {} } }] })}`)
    };
  }

  const rows = () => Array.from(document.querySelectorAll('#log-list [role="row"]:not(.log-head)'));

  beforeAll(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
    ['1', '2', '3'].forEach((id) => listeners.onRequestFinished.forEach((fn) => fn(call(id))));
  });

  it('exposes a grid with a roving tabindex, its header row among the rows', () => {
    const list = document.getElementById('log-list');
    expect(list.getAttribute('role')).toBe('grid');
    expect(rows()).toHaveLength(3);
    const head = list.querySelector('.log-head');
    expect(head.getAttribute('role')).toBe('row');
    expect(head.hasAttribute('aria-hidden')).toBe(false);
    expect([...head.children].every((cell) => cell.getAttribute('role') === 'columnheader')).toBe(true);
    expect(rows().map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    expect(rows().every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('moves and selects with arrows, j / k, Home, End and keeps focus through the redraw', () => {
    rows()[0].focus();
    press(rows()[0], 'Enter');
    expect(rows()[0].getAttribute('aria-selected')).toBe('true');

    press(document.activeElement, 'ArrowDown');
    expect(rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(rows()[1]);
    expect(rows()[1].tabIndex).toBe(0);
    expect(rows()[0].tabIndex).toBe(-1);

    press(document.activeElement, 'j');
    expect(document.activeElement).toBe(rows()[2]);
    press(document.activeElement, 'j');
    expect(document.activeElement).toBe(rows()[2]);
    press(document.activeElement, 'k');
    expect(document.activeElement).toBe(rows()[1]);
    press(document.activeElement, 'Home');
    expect(document.activeElement).toBe(rows()[0]);
    press(document.activeElement, 'End');
    expect(document.activeElement).toBe(rows()[2]);
    press(document.activeElement, 'PageUp');
    expect(document.activeElement).toBe(rows()[0]);
    press(document.activeElement, 'PageDown');
    expect(document.activeElement).toBe(rows()[2]);
  });

  it('does not steal focus when a new call redraws the list', () => {
    const filter = document.getElementById('log-filter');
    filter.focus();
    listeners.onRequestFinished.forEach((fn) => fn(call('4')));
    expect(document.activeElement).toBe(filter);

    rows()[2].focus();
    listeners.onRequestFinished.forEach((fn) => fn(call('5')));
    expect(rows()).toHaveLength(5);
    expect(document.activeElement).toBe(rows()[2]);
    expect(rows()[2].getAttribute('aria-selected')).toBe('true');
  });

  it('marks the detail tabs as pressed buttons', () => {
    const pressed = Array.from(document.querySelectorAll('#log-detail .seg-btn')).filter((b) => !b.disabled);
    expect(pressed.length).toBeGreaterThan(0);
    expect(pressed.every((b) => b.hasAttribute('aria-pressed'))).toBe(true);
  });
});

describe('Structure list', () => {
  let renderList;
  let state;
  let selectCalls;

  beforeAll(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../../src/ui/targets.js', () => ({
      Targets: { selected: () => ({ label: 'x' }), hints: () => [], highlight: () => {} }
    }));
    const { flatten } = await import('../../../src/core/shared/structure-model.js');
    const { createElementList } = await import('../../../src/ui/structure/element-list.js');

    document.body.innerHTML = '<div id="struct-list"></div>';
    const definition = { children: [
      { name: 'StepA', type: 'Step', children: [{ name: 'A1', type: 'Text' }, { name: 'A2', type: 'Text' }] },
      { name: 'StepB', type: 'Step', children: [{ name: 'B1', type: 'Text' }] }
    ] };
    state = {
      elements: flatten(definition, {}), progress: {}, collapsed: new Set(), handFolded: new Set(),
      filter: '', actionsOnly: false, selectedKey: null, cells: {}, data: {}, error: null, hover: false
    };
    selectCalls = [];
    ({ renderList } = createElementList({
      state, el: { list: document.getElementById('struct-list') },
      visible: () => state.elements, isHidden: () => false, explain: () => ({}),
      byKey: () => Object.fromEntries(state.elements.map((element) => [element.key, element])),
      cellText: () => '', blockerCount: () => 0,
      select: (element) => { state.selectedKey = element.key; selectCalls.push(element.name); renderList(); }
    }));
    renderList();
  });

  const items = () => Array.from(document.querySelectorAll('#struct-list [role="treeitem"]'));
  const names = () => items().map((row) => row.querySelector('.el-name').textContent);

  it('is a tree whose sections carry aria-expanded', () => {
    expect(document.getElementById('struct-list').getAttribute('role')).toBe('tree');
    expect(names()).toEqual(['StepA', 'A1', 'A2', 'StepB', 'B1']);
    expect(items()[0].getAttribute('aria-expanded')).toBe('true');
    expect(items()[1].hasAttribute('aria-expanded')).toBe(false);
    expect(items()[1].getAttribute('aria-level')).toBe('2');
    expect(items().map((row) => row.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it('selects with Up / Down / Home / End and k / j, keeping focus', () => {
    items()[0].focus();
    press(document.activeElement, 'ArrowDown');
    expect(selectCalls.at(-1)).toBe('A1');
    expect(document.activeElement).toBe(items()[1]);
    press(document.activeElement, 'j');
    expect(document.activeElement).toBe(items()[2]);
    press(document.activeElement, 'End');
    expect(document.activeElement).toBe(items()[4]);
    press(document.activeElement, 'k');
    expect(document.activeElement).toBe(items()[3]);
    press(document.activeElement, 'Home');
    expect(document.activeElement).toBe(items()[0]);
    expect(items()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('folds with Left, unfolds with Right and steps out to the parent', () => {
    press(document.activeElement, 'ArrowLeft');
    expect(names()).toEqual(['StepA', 'StepB', 'B1']);
    expect(items()[0].getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(items()[0]);

    press(document.activeElement, 'ArrowRight');
    expect(names()).toEqual(['StepA', 'A1', 'A2', 'StepB', 'B1']);
    expect(document.activeElement).toBe(items()[0]);

    press(document.activeElement, 'ArrowRight'); // already open: into the first child
    expect(document.activeElement).toBe(items()[1]);
    press(document.activeElement, 'ArrowLeft'); // a leaf: back out to its section
    expect(document.activeElement).toBe(items()[0]);
  });
});
