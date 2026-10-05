'use strict';

/* Frames and OmniScript hosts, discovered once and shared by every tab.
 *
 * Both tabs used to keep their own frame index and their own element list,
 * which is why they kept disagreeing about what was on the page. This module
 * owns both: it enumerates every frame, lists the hosts in each, and publishes
 * one selection that the Data and Structure tabs both read.
 */

import { signature, shortFrame, formatBytes } from '../core/targets-model.js';

/* ---------------------------------------------------------- page side */

/* Lists elements exposing either property, in one pass per frame. The index
 * of a host in this list is the handle the fetchers use, so both functions
 * must enumerate in exactly the same order.
 *
 * Stringified into the inspected page (see CLAUDE.md): it may not close over
 * this module's scope or call anything defined outside its own body — the
 * page only ever receives this function's source text. hostScan and
 * hostFetch must keep enumerating identically; do not "clean up" the
 * duplication between them. */
function hostScan(DATA_PROP, DEF_PROP) {
  try {
    /* Every child element component inherits the same properties, so one
     * forty-element OmniScript is forty hosts. A low cap silently truncated
     * the list before reaching a second console tab's script. hostFetch must
     * use the identical limit, or the indices the two return stop matching. */
    const MAX_HOSTS = 400;
    const hosts = [];

    const read = (node, prop) => {
      let value;
      try { value = node[prop]; } catch { return null; }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return null; }
      }
      return null;
    };

    const label = (node) => {
      let text = node.tagName.toLowerCase();
      if (node.id) text += '#' + node.id;
      else if (node.className && typeof node.className === 'string') {
        const first = node.className.trim().split(/\s+/)[0];
        if (first) text += '.' + first;
      }
      return text;
    };

    const walk = (root) => {
      let nodes;
      try { nodes = root.querySelectorAll('*'); } catch { return; }
      for (const node of nodes) {
        if (hosts.length < MAX_HOSTS) {
          const data = read(node, DATA_PROP);
          const def = DEF_PROP ? read(node, DEF_PROP) : null;
          if (data || def) {
            hosts.push({
              node,
              label: label(node),
              dataLen: data ? data.length : 0,
              defLen: def ? def.length : 0
            });
          }
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        if (node.tagName === 'IFRAME') {
          try { if (node.contentDocument) walk(node.contentDocument); } catch { /* cross-origin */ }
        }
      }
    };

    walk(document);

    /* Child element components inherit the same @api properties, so a script
     * with forty elements yields forty hosts. The one that matters is the one
     * with no ancestor exposing the property — checked by walking up through
     * shadow roots and iframe boundaries, since tag names vary by package. */
    const nodes = hosts.map((host) => host.node);

    const parentOf = (node) => {
      if (!node) return null;
      if (node.host) return node.host; // shadow root
      if (node.parentNode) return node.parentNode;
      if (node.nodeType === 9) { // document in an iframe
        try { return node.defaultView && node.defaultView.frameElement; } catch { return null; }
      }
      return null;
    };

    hosts.forEach((host) => {
      let parent = parentOf(host.node);
      let guard = 0;
      host.top = true;
      while (parent && guard++ < 200) {
        if (nodes.indexOf(parent) !== -1) { host.top = false; break; }
        parent = parentOf(parent);
      }
    });

    const hints = [];
    if (!hosts.length) {
      (function scan(root) {
        let nodes;
        try { nodes = root.querySelectorAll('*'); } catch { return; }
        for (const node of nodes) {
          if (hints.length < 3 && node.tagName.toLowerCase().indexOf('omniscript') > -1) {
            const names = {};
            let proto = Object.getPrototypeOf(node);
            let guard = 0;
            while (proto && guard++ < 6) {
              const propertyNames = Object.getOwnPropertyNames(proto);
              for (const propertyName of propertyNames) {
                if (/json|data|def/i.test(propertyName)) names[propertyName] = 1;
              }
              proto = Object.getPrototypeOf(proto);
            }
            hints.push({ tag: label(node), props: Object.keys(names).slice(0, 24) });
          }
          if (node.shadowRoot) scan(node.shadowRoot);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument) scan(node.contentDocument); } catch { /* cross-origin */ }
          }
        }
      })(document);
    }

    window.__omniHosts = hosts.map((host) => host.node);

    return {
      ok: true,
      hints,
      truncated: hosts.length >= MAX_HOSTS,
      hosts: hosts.map((host) => ({ label: host.label, dataLen: host.dataLen, defLen: host.defLen, top: !!host.top }))
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), hosts: [], hints: [] };
  }
}

/* Reads one property off one host. `count` lets the panel notice that hosts
 * appeared or vanished without running a full enumeration every poll.
 *
 * Same self-containment rule as hostScan, and must enumerate identically to
 * it — see the comment there. */
function hostFetch(DATA_PROP, DEF_PROP, IDX, WANTED) {
  try {
    const MAX_HOSTS = 400; // must match hostScan
    const hosts = [];

    const read = (node, prop) => {
      let value;
      try { value = node[prop]; } catch { return null; }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return null; }
      }
      return null;
    };

    const walk = (root) => {
      let nodes;
      try { nodes = root.querySelectorAll('*'); } catch { return; }
      for (const node of nodes) {
        if (hosts.length < MAX_HOSTS) {
          if (read(node, DATA_PROP) || (DEF_PROP && read(node, DEF_PROP))) hosts.push(node);
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        if (node.tagName === 'IFRAME') {
          try { if (node.contentDocument) walk(node.contentDocument); } catch { /* cross-origin */ }
        }
      }
    };

    walk(document);
    window.__omniHosts = hosts;

    const node = hosts[IDX];
    if (!node) return { ok: true, count: hosts.length, missing: true, value: null };
    return { ok: true, count: hosts.length, missing: false, value: read(node, WANTED) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* Names of the properties the host at IDX exposes, for the property picker.
 * Walks the prototype chain up to (not including) the generic DOM base classes,
 * since @api properties live on the component's prototype as accessors.
 *
 * Same self-containment rule as hostScan; relies on window.__omniHosts, which
 * hostScan and hostFetch both refresh. */
function hostProps(IDX) {
  try {
    const node = window.__omniHosts && window.__omniHosts[IDX];
    if (!node) return { ok: true, props: [] };

    const seen = {};
    const props = [];
    let target = node;
    let guard = 0;

    while (target && guard++ < 12 && target !== Object.prototype && target !== HTMLElement.prototype &&
           target !== Element.prototype && target !== Node.prototype) {
      Object.getOwnPropertyNames(target).forEach((name) => {
        if (seen[name] || name === 'constructor' || name.charAt(0) === '_' || name.charAt(0) === '$') return;
        seen[name] = true;

        let type;
        try {
          const value = node[name];
          if (typeof value === 'function') return;
          type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        } catch { type = 'error'; }
        props.push({ name, type });
      });
      target = Object.getPrototypeOf(target);
    }

    props.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, props: props.slice(0, 500) };
  } catch {
    return { ok: false, props: [] };
  }
}

/* Reads one top-level field of an object-valued property on the host at IDX
 * without shipping the whole (possibly huge) payload back to the panel. Used
 * for the definition's asIndex. Same self-containment rule as hostScan; relies
 * on window.__omniHosts. */
function hostPeek(IDX, PROP, FIELD) {
  try {
    const node = window.__omniHosts && window.__omniHosts[IDX];
    if (!node) return { ok: true, value: null };
    let value = node[PROP];
    if (typeof value === 'string') value = JSON.parse(value);
    const field = value && typeof value === 'object' ? value[FIELD] : null;
    return { ok: true, value: field === undefined ? null : field };
  } catch {
    return { ok: false, value: null };
  }
}

/* Same self-containment rule as hostScan. */
function frameScan() {
  try {
    const out = [];
    const frames = document.querySelectorAll('iframe');
    for (const frame of frames) {
      const url = frame.src || '';
      if (url && url.indexOf('about:') !== 0 && out.indexOf(url) === -1) out.push(url);
    }
    return { ok: true, frames: out };
  } catch {
    return { ok: false, frames: [] };
  }
}

/* ------------------------------------------------------------- state */

const state = {
  dataProp: 'jsonDataStr',
  defProp: 'jsonDef',
  frames: [''],
  frameFilter: '', // '' means every frame
  showNested: false,
  truncated: false,
  hosts: [],
  selected: 0,
  hints: [],
  visible: true,
  dirty: { target: false, frame: false }
};

const listeners = [];
const el = {};
let pollTimer = null;

function notify(reason) {
  listeners.forEach((listener) => {
    try { listener(reason); } catch { /* a bad subscriber should not break the others */ }
  });
}

/* ---------------------------------------------------------- discovery */

function evalOnInspectedPage(frame, expression, callback) {
  if (frame) chrome.devtools.inspectedWindow.eval(expression, { frameURL: frame }, callback);
  else chrome.devtools.inspectedWindow.eval(expression, callback);
}

function discoverFrames(done) {
  const urls = [];

  const add = (url) => {
    if (!url || url.indexOf('about:') === 0) return;
    if (urls.indexOf(url) === -1 && urls.length < 12) urls.push(url);
  };

  chrome.devtools.inspectedWindow.getResources((resources) => {
    (resources || []).forEach((resource) => {
      if (resource && resource.type === 'document') add(resource.url);
    });
    chrome.devtools.inspectedWindow.eval(`(${frameScan.toString()})()`, (result) => {
      ((result && result.frames) || []).forEach(add);
      state.frames = [''].concat(urls);
      if (state.frameFilter && state.frames.indexOf(state.frameFilter) === -1) {
        state.frameFilter = '';
      }
      renderFrames();
      done();
    });
  });
}

/* Enumerates hosts in every frame and merges them into one list. */
function scanHosts(done) {
  const frames = state.frames;
  const expression = `(${hostScan.toString()})(${JSON.stringify(state.dataProp)},${JSON.stringify(state.defProp)})`;
  const collected = [];
  let hints = [];
  let truncated = false;
  let i = 0;

  function step() {
    if (i >= frames.length) { finish(); return; }
    const frame = frames[i];
    evalOnInspectedPage(frame, expression, (result) => {
      if (result && result.ok) {
        (result.hosts || []).forEach((host, local) => {
          collected.push({
            index: collected.length,
            label: host.label,
            frame,
            local,
            dataLen: host.dataLen,
            defLen: host.defLen,
            top: host.top
          });
        });
        if (result.truncated) truncated = true;
        if (!hints.length && result.hints && result.hints.length) hints = result.hints;
      }
      i++;
      step();
    });
  }

  function finish() {
    const before = signature(state.hosts);
    const previouslySelected = state.hosts[state.selected];

    state.hosts = collected;
    state.hints = hints;
    state.truncated = truncated;

    // Keep the same host selected across a refresh where possible.
    if (previouslySelected) {
      const stillThere = collected.findIndex((host) =>
        host.label === previouslySelected.label && host.frame === previouslySelected.frame);
      state.selected = stillThere === -1 ? 0 : stillThere;
    }
    if (state.selected >= collected.length) state.selected = 0;

    const current = collected[state.selected];
    if (!current || (!current.top && !state.showNested)) {
      const firstTop = collected.findIndex((host) => host.top);
      if (firstTop !== -1) state.selected = firstTop;
    }

    renderTargets();
    if (signature(collected) !== before) notify('hosts');
    done();
  }

  step();
}

function refresh(done) {
  discoverFrames(() => scanHosts(() => (done || (() => {}))()));
}

function schedule() {
  clearTimeout(pollTimer);
  if (!state.visible) return;
  pollTimer = setTimeout(() => refresh(schedule), 5000);
}

/* ---------------------------------------------------------- rendering */

function visibleHosts() {
  return state.hosts.filter((host) => {
    if (state.frameFilter && host.frame !== state.frameFilter) return false;
    if (!state.showNested && !host.top) return false;
    return true;
  });
}

function nestedCount() {
  return state.hosts.filter((host) => !host.top).length;
}

function renderTargets() {
  if (!el.target) return;
  if (document.activeElement === el.target) { state.dirty.target = true; return; }

  const hosts = visibleHosts();
  /* Must include each host's index, not just its label/frame: a hidden
   * nested host appearing or disappearing elsewhere in the scan shifts every
   * later host's global index (see scanHosts) without changing this list's
   * labels or frames. Skipping the rebuild here would leave stale
   * option.value attributes in the DOM — clicking one would then select
   * whatever host now sits at that old index, not the one on screen. */
  const sig = `${hosts.map((host) => `${host.index}:${host.label}@${host.frame}`).join('|')}#${state.selected}`;
  if (sig === el.target.dataset.sig) return;
  el.target.dataset.sig = sig;
  el.target.textContent = '';

  if (!hosts.length) {
    const none = document.createElement('option');
    none.textContent = 'no OmniScript found';
    el.target.appendChild(none);
    el.target.disabled = true;
    return;
  }

  el.target.disabled = hosts.length < 2;
  const multiFrame = state.frames.length > 1;
  hosts.forEach((host) => {
    const option = document.createElement('option');
    option.value = String(host.index);
    option.textContent = host.label +
      (multiFrame && host.frame ? '  ·  ' + shortFrame(host.frame) : '') +
      (host.top ? '' : '  · nested') +
      (host.defLen ? '' : '  · data only');
    option.title = (host.frame || 'top frame') +
      '\n' + (host.top ? 'Top-level OmniScript' : 'Nested inside another host') +
      '\ndata ' + formatBytes(host.dataLen) + ' · definition ' + (host.defLen ? formatBytes(host.defLen) : 'none');
    el.target.appendChild(option);
  });
  el.target.value = String(state.selected);
}

function renderFrames() {
  if (!el.frame) return;
  if (document.activeElement === el.frame) { state.dirty.frame = true; return; }

  const sig = state.frames.join('|');
  if (sig !== el.frame.dataset.sig) {
    el.frame.dataset.sig = sig;
    el.frame.textContent = '';
    state.frames.forEach((url) => {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url ? shortFrame(url) : 'All frames';
      option.title = url || 'Every document on the page';
      el.frame.appendChild(option);
    });
    el.frame.disabled = state.frames.length < 2;
  }
  el.frame.value = state.frameFilter;
}

/* ------------------------------------------------------------- public */

function selected() {
  return state.hosts[state.selected] || null;
}

function fetchProperty(which, callback) {
  const host = selected();
  if (!host) { callback(null, null); return; }

  const expression = `(${hostFetch.toString()})(` +
    `${JSON.stringify(state.dataProp)},` +
    `${JSON.stringify(state.defProp)},` +
    `${JSON.stringify(host.local)},` +
    `${JSON.stringify(which)})`;

  evalOnInspectedPage(host.frame, expression, (result, exception) => {
    if (exception || !result || !result.ok) { callback(null, exception || result); return; }
    /* Host count moved under us: re-enumerate rather than keep reading an
     * index that now points at something else. */
    if (result.missing) { refresh(() => callback(null, null)); return; }
    callback(result.value, null);
  });
}

function listProps(callback) {
  const host = selected();
  if (!host) { callback([]); return; }
  const expression = `(${hostProps.toString()})(${JSON.stringify(host.local)})`;
  evalOnInspectedPage(host.frame, expression, (result) => {
    callback(result && result.ok ? result.props : []);
  });
}

function peekField(prop, field, callback) {
  const host = selected();
  if (!host) { callback(null); return; }
  const expression = `(${hostPeek.toString()})(${JSON.stringify(host.local)},${JSON.stringify(prop)},${JSON.stringify(field)})`;
  evalOnInspectedPage(host.frame, expression, (result) => {
    callback(result && result.ok ? result.value : null);
  });
}

function mount(nodes) {
  el.target = nodes.target;
  el.frame = nodes.frame;
  el.nested = nodes.nested;

  if (el.nested) {
    el.nested.addEventListener('change', () => {
      state.showNested = el.nested.checked;
      el.target.dataset.sig = '';
      renderTargets();
      notify('selection');
    });
  }

  el.target.addEventListener('change', () => {
    state.selected = Number(el.target.value) || 0;
    notify('selection');
  });

  el.target.addEventListener('blur', () => {
    if (!state.dirty.target) return;
    state.dirty.target = false;
    renderTargets();
  });

  el.frame.addEventListener('change', () => {
    state.frameFilter = el.frame.value;
    const hosts = visibleHosts();
    if (hosts.length && !hosts.some((host) => host.index === state.selected)) {
      state.selected = hosts[0].index;
    }
    renderTargets();
    notify('selection');
  });

  el.frame.addEventListener('blur', () => {
    if (!state.dirty.frame) return;
    state.dirty.frame = false;
    renderFrames();
  });

  chrome.devtools.network.onNavigated.addListener(() => {
    state.frames = [''];
    state.frameFilter = '';
    state.hosts = [];
    state.selected = 0;
    refresh(() => notify('navigated'));
  });
}

export const Targets = {
  mount,
  refresh,
  fetch: fetchProperty,
  listProps,
  peekField,
  evalOn: evalOnInspectedPage,
  selected,
  hosts: () => state.hosts,
  visibleHosts,
  nestedCount,
  truncated: () => state.truncated,
  frames: () => state.frames,
  hints: () => state.hints,
  frameLabel: shortFrame,
  subscribe: (fn) => listeners.push(fn),
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) refresh(schedule); else clearTimeout(pollTimer);
  },
  setProps: (dataProp, defProp) => {
    if (dataProp) state.dataProp = dataProp;
    if (defProp) state.defProp = defProp;
    refresh(() => notify('props'));
  },
  start: (done) => refresh(() => { schedule(); (done || (() => {}))(); })
};
