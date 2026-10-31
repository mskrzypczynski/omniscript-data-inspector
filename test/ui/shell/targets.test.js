'use strict';

/* Regression test for a real bug: hostScan finds every element exposing the
 * data property, including nested child-element hosts, and a dropdown
 * option's value is that host's position in the *global*, cumulative scan
 * order (see scanHosts in src/ui/targets.js). A hidden nested host appearing
 * between two visible hosts shifts the later one's index without changing
 * either visible label — so the rendered <option> values must be re-synced
 * whenever that could have happened, or an option that still reads "the
 * right OmniScript" silently selects whatever host now sits at its old
 * index once clicked. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from '../support/panel-fixture.js';

function stubChromeWithScriptedHostScans(hostScanResponses) {
  let call = 0;

  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: () => {} } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (!callback) return;

          if (expression.includes('function frameScan')) {
            callback({ ok: true, frames: [] }); // a single top frame, no iframes
            return;
          }

          const hosts = hostScanResponses[Math.min(call, hostScanResponses.length - 1)];
          call++;
          callback({ ok: true, hosts, hints: [], truncated: false });
        }
      }
    }
  };
}

async function loadTargets() {
  jest.resetModules();
  const { Targets } = await import('../../../src/ui/targets.js');
  return Targets;
}

function mountTargets(Targets) {
  mountPanelMarkup();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
}

function optionLabelled(select, text) {
  return [...select.options].find((option) => option.textContent === text);
}

describe('Targets host selection across a rescan', () => {
  it('keeps an unselected dropdown option pointing at the right host once a hidden nested host shifts its index', async () => {
    const Targets = await loadTargets();
    stubChromeWithScriptedHostScans([
      // First scan: two top-level hosts. Selection defaults to index 0 (A).
      [
        { label: 'c-quote-A', dataLen: 10, defLen: 5, top: true },
        { label: 'c-quote-B', dataLen: 10, defLen: 5, top: true }
      ],
      // Second scan: a nested child host now sits between them in scan
      // order. A (selected) is still first, so its index — and therefore
      // state.selected — doesn't change. B's index shifts from 1 to 2.
      [
        { label: 'c-quote-A', dataLen: 10, defLen: 5, top: true },
        { label: 'c-quote-A-child', dataLen: 1, defLen: 0, top: false },
        { label: 'c-quote-B', dataLen: 10, defLen: 5, top: true }
      ]
    ]);
    mountTargets(Targets);

    await new Promise((resolve) => Targets.start(resolve));
    expect(Targets.selected().label).toBe('c-quote-A'); // default selection

    // A rescan runs, exactly as the periodic poll or the Rescan button
    // would, while the selected host (A) never moves.
    await new Promise((resolve) => Targets.refresh(resolve));
    expect(Targets.selected().label).toBe('c-quote-A'); // still correct internally

    const targetSelect = document.getElementById('target');
    const optionForB = optionLabelled(targetSelect, 'c-quote-B');
    expect(optionForB).toBeDefined();

    targetSelect.value = optionForB.value;
    targetSelect.dispatchEvent(new Event('change'));

    // The option still labelled "c-quote-B" must resolve to the actual
    // c-quote-B host — not the nested host that now sits at its old index.
    expect(Targets.selected().label).toBe('c-quote-B');
  });
});

describe('Targets keeps the picked script across rescans', () => {
  it('does not jump back to the first of two scripts sharing an element name', async () => {
    const scan = [
      { label: 'c-os', key: 'Quote/New/English', dataLen: 10, defLen: 5, top: true },
      { label: 'c-os', key: 'Case/Edit/English', dataLen: 10, defLen: 5, top: true }
    ];
    stubChromeWithScriptedHostScans([scan, scan]);
    const Targets = await loadTargets();
    mountTargets(Targets);
    await new Promise((resolve) => Targets.refresh(resolve));

    const select = document.getElementById('target');
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    await new Promise((resolve) => Targets.refresh(resolve));

    expect(Targets.selected().key).toBe('Case/Edit/English');
  });
});

describe('hostScan and hostFetch enumerate alike', () => {
  afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

  it('skip empty strings and count objects without serialising them first', async () => {
    const { hostScan, hostFetch } = await import('../../../src/ui/targets.js');
    const empty = document.createElement('div');
    empty.jsonDataStr = '';
    const objectHost = document.createElement('div');
    objectHost.jsonDataStr = { step: 1 };
    const stringHost = document.createElement('div');
    stringHost.jsonDataStr = '{"a":1}';
    document.body.append(empty, objectHost, stringHost);

    expect(hostScan('jsonDataStr', 'jsonDef').hosts).toHaveLength(2);
    expect(hostFetch('jsonDataStr', 'jsonDef', 1, 'jsonDataStr').value).toBe('{"a":1}');
    expect(hostFetch('jsonDataStr', 'jsonDef', 2, 'jsonDataStr').missing).toBe(true);
  });
});

describe('hostHighlight (runs inside the inspected page)', () => {
  let hostHighlight;
  beforeAll(async () => { ({ hostHighlight } = await import('../../../src/ui/targets.js')); });
  afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

  function pageWithHost() {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<section><input data-omni-key="Field1" /><span data-lwc-x="lwc-123"></span></section>';
    document.body.appendChild(host);
    window.__omniHosts = [host];
    return host;
  }

  it('finds an element by lwcId inside an open shadow root', () => {
    pageWithHost();
    expect(hostHighlight(0, 'lwc-123', '', true)).toEqual({ ok: true, found: true, visible: false });
  });

  it('falls back to the element name, and reports not found', () => {
    pageWithHost();
    expect(hostHighlight(0, 'nope', 'Field1', true).found).toBe(true);
    expect(hostHighlight(0, 'nope', 'Other', true).found).toBe(false);
    expect(hostHighlight(5, 'lwc-123', '', true).found).toBe(false);
  });

  it('draws an outline when the element has a size, and removes it when asked', () => {
    const host = pageWithHost();
    const target = host.shadowRoot.querySelector('span');
    target.getBoundingClientRect = () => ({ left: 5, top: 6, width: 40, height: 20 });
    expect(hostHighlight(0, 'lwc-123', '', true).visible).toBe(true);
    expect(document.getElementById('__omni_inspector_outline')).not.toBeNull();
    hostHighlight(0, '', '', false);
    expect(document.getElementById('__omni_inspector_outline')).toBeNull();
  });
});

describe('hostNavigate (runs inside the inspected page)', () => {
  let hostNavigate;
  beforeAll(async () => { ({ hostNavigate } = await import('../../../src/ui/targets.js')); });
  afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; jest.useRealTimers(); });

  function pageWith(html) {
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' }).innerHTML = html;
    document.body.appendChild(host);
    window.__omniHosts = [host];
    return host;
  }
  const clicks = [];
  const watch = (host) => {
    clicks.length = 0;
    host.shadowRoot.querySelectorAll('button, [role="button"]').forEach((node) => node.addEventListener('click', () => clicks.push(node.id || node.textContent)));
  };

  it('clicks the Previous button even when it is hidden by width or style', () => {
    const host = pageWith('<div><button id="next">Next</button><button id="p" style="width:0;display:none">Previous</button></div>');
    watch(host);
    expect(hostNavigate(0, 1)).toMatchObject({ ok: true, how: 'button' });
    expect(clicks).toEqual(['p']);
  });

  it('finds it inside a nested open shadow root, and by role', () => {
    const host = pageWith('<section></section>');
    const inner = host.shadowRoot.querySelector('section');
    inner.attachShadow({ mode: 'open' }).innerHTML = '<span role="button" aria-label="Go back" id="b"></span>';
    const seen = [];
    inner.shadowRoot.getElementById('b').addEventListener('click', () => seen.push('b'));
    expect(hostNavigate(0, 1).how).toBe('button');
    expect(seen).toEqual(['b']);
  });

  it('prefers a button whose text says previous to one that only has an id or data attribute', () => {
    const host = pageWith('<button id="prev-hidden"></button><button id="x" data-action="back">Go</button><button id="y">Previous</button>');
    watch(host);
    hostNavigate(0, 1);
    expect(clicks).toEqual(['y']);
  });

  it('falls back from text to aria-label, title, name, id and a data attribute, in that order', () => {
    const host = pageWith('<button id="d" data-action="back">1</button><button id="i" id2="x">2</button><button id="prevButton">3</button>' +
      '<button name="previous" id="n">4</button><button title="Previous" id="t">5</button><button aria-label="Previous step" id="a">6</button>');
    watch(host);
    hostNavigate(0, 1);
    expect(clicks).toEqual(['a']);
    host.shadowRoot.getElementById('a').remove();
    clicks.length = 0;
    hostNavigate(0, 1);
    expect(clicks).toEqual(['t']);
    host.shadowRoot.getElementById('t').remove();
    clicks.length = 0;
    hostNavigate(0, 1);
    expect(clicks).toEqual(['n']);
    host.shadowRoot.getElementById('n').remove();
    clicks.length = 0;
    hostNavigate(0, 1);
    expect(clicks).toEqual(['prevButton']);
    host.shadowRoot.getElementById('prevButton').remove();
    clicks.length = 0;
    hostNavigate(0, 1);
    expect(clicks).toEqual(['d']);
  });

  it('does not take words that only contain back or prev', () => {
    const host = pageWith('<button id="a">Feedback</button><button id="b">Background</button><button id="c">Preview</button>');
    watch(host);
    const seen = [];
    host.shadowRoot.firstElementChild.addEventListener('omniactionbtn', (ev) => seen.push(ev.detail));
    expect(hostNavigate(0, 1).how).toBe('event');
    expect(clicks).toEqual([]);
    expect(seen).toEqual([{ type: 'prev' }]);
  });

  it('sends the script its own event, bubbling and composed, when there is no button', () => {
    const host = pageWith('<div><p>Nothing to click</p></div>');
    const seen = [];
    document.addEventListener('omniactionbtn', (ev) => seen.push({ detail: ev.detail, composed: ev.composed, bubbles: ev.bubbles }), { once: true });
    expect(hostNavigate(0, 1)).toMatchObject({ ok: true, how: 'event' });
    expect(seen).toEqual([{ detail: { type: 'prev' }, composed: true, bubbles: true }]);
    expect(host.isConnected).toBe(true);
  });

  it('goes back the number of steps asked, the later hops a moment apart, and never more than ten', () => {
    jest.useFakeTimers();
    const host = pageWith('<button id="p">Previous</button>');
    watch(host);
    hostNavigate(0, 3);
    expect(clicks).toHaveLength(1);
    jest.advanceTimersByTime(700);
    expect(clicks).toHaveLength(2);
    jest.advanceTimersByTime(700);
    expect(clicks).toHaveLength(3);
    jest.advanceTimersByTime(5000);
    expect(clicks).toHaveLength(3);

    clicks.length = 0;
    hostNavigate(0, 50);
    jest.advanceTimersByTime(20000);
    expect(clicks).toHaveLength(10);
  });

  it('says none for a script that is not there, and changes no data', () => {
    pageWith('<button>Previous</button>');
    expect(hostNavigate(7, 1)).toMatchObject({ ok: false, how: 'none' });
    expect(hostNavigate(0, 1).ok).toBe(true);
    expect(window.__omniHosts[0].jsonDataStr).toBeUndefined();
  });

  it('is self-contained: its source has no import or outer variable', () => {
    const source = hostNavigate.toString();
    expect(source).not.toMatch(/\bimport\b/);
    const rebuilt = new Function(`return (${source})`)();
    pageWith('<button>Previous</button>');
    expect(rebuilt(0, 1).how).toBe('button');
  });
});

describe('hostScan names scripts by Type/SubType/Language', () => {
  afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

  it('reads the key from a definition object or a JSON string, and leaves it empty without one', async () => {
    const { hostScan } = await import('../../../src/ui/targets.js');
    const fromObject = document.createElement('div');
    fromObject.jsonDef = { bpType: 'Account', bpSubType: 'Onboarding', bpLang: 'English', children: [] };
    const fromString = document.createElement('div');
    fromString.jsonDef = JSON.stringify({ children: [], bpType: 'Case', bpSubType: 'New "quoted"', bpLang: 'Polish' });
    const dataOnly = document.createElement('div');
    dataOnly.jsonDataStr = '{}';
    document.body.append(fromObject, fromString, dataOnly);

    const keys = hostScan('jsonDataStr', 'jsonDef').hosts.map((host) => host.key);
    expect(keys).toEqual(['Account/Onboarding/English', 'Case/New \\"quoted\\"/Polish', '']);
  });

  it('shows the key in the picker, with the element in the tooltip', async () => {
    stubChromeWithScriptedHostScans([[{ label: 'c-os#main', key: 'Account/Onboarding/English', dataLen: 10, defLen: 10, top: true }]]);
    const Targets = await loadTargets();
    mountTargets(Targets);
    await new Promise((resolve) => Targets.refresh(resolve));
    const option = document.getElementById('target').options[0];
    expect(option.textContent).toBe('Account/Onboarding/English');
    expect(option.title.split('\n')[0]).toBe('c-os#main');
  });
});

describe('one OmniScript exposed by several elements', () => {
  const KEY = 'Sales/Quote/English';
  const scan = [
    { label: 'c-os-header', key: KEY, dataLen: 10, defLen: 50, top: true },
    { label: 'c-os-form', key: KEY, dataLen: 900, defLen: 50, top: true },
    { label: 'c-os-nav', key: KEY, dataLen: 10, defLen: 50, top: true },
    { label: 'c-other', key: 'Sales/Order/English', dataLen: 20, defLen: 50, top: true }
  ];

  it('is listed once, by the element holding the data, and selected', async () => {
    stubChromeWithScriptedHostScans([scan]);
    const Targets = await loadTargets();
    mountTargets(Targets);
    await new Promise((resolve) => Targets.refresh(resolve));

    const select = document.getElementById('target');
    expect([...select.options].map((option) => option.textContent)).toEqual([KEY, 'Sales/Order/English']);
    expect(Targets.selected().label).toBe('c-os-form');
    // The two other elements are repeats of a listed script, not embedded scripts.
    expect(Targets.nestedCount()).toBe(0);
    expect(Targets.elementHostCount()).toBe(2);
  });

  it('lists every element, by name, with Embedded scripts on', async () => {
    stubChromeWithScriptedHostScans([scan]);
    const Targets = await loadTargets();
    mountTargets(Targets);
    const nested = document.getElementById('show-nested');
    nested.checked = true;
    nested.dispatchEvent(new Event('change'));
    await new Promise((resolve) => Targets.refresh(resolve));

    expect([...document.getElementById('target').options].map((option) => option.textContent)).toEqual([
      `${KEY}  ·  c-os-header`, `${KEY}  ·  c-os-form`, `${KEY}  ·  c-os-nav`, 'Sales/Order/English'
    ]);
  });
});

describe('hostScan tells a whole OmniScript from an element', () => {
  afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

  const hostWith = (def, data = '{}') => {
    const node = document.createElement('div');
    if (def !== undefined) node.jsonDef = def;
    node.jsonDataStr = data;
    return node;
  };
  const scripts = async () => {
    const { hostScan } = await import('../../../src/ui/targets.js');
    return hostScan('jsonDataStr', 'jsonDef').hosts.map((host) => host.script);
  };

  it('marks a definition with a bpType and bpSubType, an omniProcessType or steps as a script', async () => {
    document.body.append(
      hostWith({ bpType: 'Account', bpSubType: 'Onboarding', bpLang: 'English', children: [] }),
      hostWith(JSON.stringify({ children: [], bpType: 'Case', bpSubType: 'Edit' })),
      hostWith({ omniProcessType: 'OmniScript', children: [] }),
      hostWith(JSON.stringify({ omniProcessType: 'OmniScript' })),
      hostWith({ children: [{ type: 'Step', name: 'One', propSetMap: {} }] })
    );
    expect(await scripts()).toEqual([true, true, true, true, true]);
  });

  it('marks an element definition (a type and a propSetMap) as not a script', async () => {
    document.body.append(
      hostWith({ type: 'Text', name: 'Name', propSetMap: { label: 'Name' } }),
      hostWith(JSON.stringify({ type: 'Select', name: 'Kind', propSetMap: { options: [] } }))
    );
    expect(await scripts()).toEqual([false, false]);
  });

  it('leaves it undefined for a host without a definition or with one it cannot place', async () => {
    document.body.append(hostWith(undefined), hostWith({ something: 1 }), hostWith('not json'));
    expect(await scripts()).toEqual([undefined, undefined, undefined]);
  });

  it('a script of forty elements is one script and no embedded scripts', async () => {
    const { hostScan } = await import('../../../src/ui/targets.js');
    const { hiddenHostCounts } = await import('../../../src/core/shared/targets-model.js');
    const main = hostWith({ bpType: 'Quote', bpSubType: 'New', bpLang: 'English', children: [] });
    document.body.append(main);
    for (let i = 0; i < 40; i++) main.append(hostWith({ type: 'Text', name: `T${i}`, propSetMap: {} }));
    const hosts = hostScan('jsonDataStr', 'jsonDef').hosts;
    expect(hosts).toHaveLength(41);
    expect(hosts.filter((host) => host.top)).toHaveLength(1);
    expect(hiddenHostCounts(hosts)).toEqual({ scripts: 0, others: 40 });
  });

  it('still enumerates like hostFetch', async () => {
    const { hostScan, hostFetch } = await import('../../../src/ui/targets.js');
    document.body.append(hostWith({ type: 'Text', propSetMap: {} }, '{"a":1}'), hostWith({ bpType: 'A', bpSubType: 'b' }, '{"b":2}'));
    expect(hostScan('jsonDataStr', 'jsonDef').hosts).toHaveLength(2);
    expect(hostFetch('jsonDataStr', 'jsonDef', 1, 'jsonDataStr').value).toBe('{"b":2}');
  });
});

describe('the Embedded scripts list names element hosts', () => {
  it('says component for an element component and embedded for a script inside another', async () => {
    stubChromeWithScriptedHostScans([[
      { label: 'c-main', key: 'Sales/Quote/English', dataLen: 10, defLen: 50, top: true, script: true },
      { label: 'c-text', dataLen: 1, defLen: 5, top: false, script: false },
      { label: 'c-inner', key: 'Sales/Inner/English', dataLen: 1, defLen: 5, top: false, script: true }
    ]]);
    const Targets = await loadTargets();
    mountTargets(Targets);
    document.getElementById('show-nested').click();
    await new Promise((resolve) => Targets.refresh(resolve));
    const options = [...document.getElementById('target').options];
    expect(options.map((option) => option.textContent)).toEqual([
      'Sales/Quote/English',
      'c-text  · component',
      'Sales/Inner/English  · embedded'
    ]);
    expect(options[1].title).toContain('A component of another script');
    expect(options[2].title).toContain('Embedded in another OmniScript');
  });
});
