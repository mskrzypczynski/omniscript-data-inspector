'use strict';

/* Data tab: the JSON the selected OmniScript is holding right now, re-read on
 * a timer. Frames and OmniScript hosts are owned by targets.js and shared
 * with the Structure tab — this file only asks for the selected host's
 * payload and draws it. */

import { isContainer, addAllPaths, SEP } from '../core/json-tree-model.js';
import { formatBytes } from '../core/targets-model.js';
import { renderJsonTree } from './json-tree-view.js';
import { Targets } from './targets.js';

/* How long a change stays marked. Without this the amber and the dot on
 * collapsed branches lasted exactly one render — at a 500 ms poll they were
 * gone before you could look at them. */
const HIGHLIGHT_MS = 3000;

/* Constant poll period; manual mode turns polling off instead. */
const POLL_MS = 1000;

const state = {
  active: true,
  visible: true,
  prop: 'jsonDataStr',
  live: true,
  stale: false,
  renderPending: false,
  view: 'tree',
  filter: '',
  raw: null,
  data: undefined,
  parseError: null,
  scanError: null,
  expanded: new Set(['']),
  expandedText: new Set(),
  changed: new Set(),
  changedBranch: new Set(),
  lastUpdate: null,
  changedAt: 0,
  seeded: false
};

const el = {};

/* ------------------------------------------------------------------ *
 * Polling
 * ------------------------------------------------------------------ */

let timer = null;

function schedule() {
  clearTimeout(timer);
  if (!state.live || !state.active || !state.visible) return;
  timer = setTimeout(read, POLL_MS);
}

function read() {
  if (!Targets.selected()) {
    markStale();
    render();
    schedule();
    return;
  }

  Targets.fetch(state.prop, (value, error) => {
    if (error) {
      state.scanError = error.value || error.description || error.error || 'The page could not be read.';
      render();
      schedule();
      return;
    }
    state.scanError = null;
    if (value === null || value === undefined) {
      markStale();
    } else {
      state.stale = false;
      apply(value);
    }
    render();
    schedule();
  });
}

/* The host went away (navigation, the script finished). Keep what was last
 * read instead of blanking the view; it is replaced as soon as a host
 * answers again. */
function markStale() {
  if (state.raw === null) { apply(null); return; }
  state.stale = true;
}

function hasTextSelection() {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const node = selection.anchorNode;
  return !!(node && el.viewport.contains(node));
}

function apply(raw) {
  if (raw === null || raw === undefined) {
    state.raw = null;
    state.data = undefined;
    state.parseError = null;
    state.changed.clear();
    state.changedBranch.clear();
    state.changedAt = 0;
    return;
  }
  if (raw === state.raw) {
    if (state.changedAt && Date.now() - state.changedAt > HIGHLIGHT_MS) {
      state.changed.clear();
      state.changedBranch.clear();
      state.changedAt = 0;
    }
    return;
  }

  const previous = state.data;
  state.raw = raw;

  try {
    state.data = JSON.parse(raw);
    state.parseError = null;
  } catch (e) {
    state.data = undefined;
    state.parseError = e.message;
  }

  state.changed = new Set();
  state.changedBranch = new Set();
  if (state.parseError === null && previous !== undefined) {
    diff(previous, state.data, '', state.changed);
    state.changed.forEach((path) => {
      const parts = path.split(SEP);
      for (let i = parts.length - 1; i > 0; i--) {
        state.changedBranch.add(parts.slice(0, i).join(SEP));
      }
      state.changedBranch.add('');
    });
  }

  if (!state.seeded && state.data !== undefined) {
    seedExpansion(state.data);
    state.seeded = true;
  }

  state.lastUpdate = new Date();
  state.changedAt = state.changed.size ? Date.now() : 0;
}

function seedExpansion(value) {
  state.expanded.add('');
  if (!isContainer(value)) return;
  Object.keys(value).slice(0, 200).forEach((key) => state.expanded.add(key));
}

function diff(a, b, path, out) {
  if (out.size > 800) return;
  const containerA = isContainer(a);
  const containerB = isContainer(b);
  if (!containerA && !containerB) { if (a !== b) out.add(path); return; }
  if (containerA !== containerB || Array.isArray(a) !== Array.isArray(b)) { out.add(path); return; }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    const childPath = path ? path + SEP + key : key;
    if (!(key in a) || !(key in b)) { out.add(childPath); return; }
    diff(a[key], b[key], childPath, out);
  });
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function render() {
  renderStatus();

  /* Rebuilding the tree drops the user's selection, so a poll must not do it
   * while they are selecting text to copy. Wait for the selection to clear. */
  if (hasTextSelection()) { state.renderPending = true; return; }
  state.renderPending = false;

  const viewport = el.viewport;
  viewport.textContent = '';

  if (state.scanError) {
    viewport.appendChild(notice('Could not read the page', state.scanError, true));
    return;
  }

  if (!Targets.selected()) {
    viewport.appendChild(emptyNotice());
    return;
  }

  if (state.raw === null) {
    viewport.appendChild(notice(`Nothing on ${state.prop}`,
      'This OmniScript exposes no value on that property right now.', false));
    return;
  }

  if (state.parseError) {
    viewport.appendChild(notice('The property is not valid JSON',
      `${state.parseError} — the raw value is shown below.`, true));
    viewport.appendChild(rawBlock(state.raw));
    return;
  }

  if (state.data === undefined) return;

  if (state.stale) {
    viewport.appendChild(notice('OmniScript no longer on the page',
      'Showing the last data read. It will refresh when an OmniScript is found again.', false));
  }

  if (state.view === 'raw') {
    viewport.appendChild(rawBlock(pretty()));
    return;
  }

  const result = renderJsonTree(viewport, state.prop, state.data, {
    expanded: state.expanded,
    expandedText: state.expandedText,
    changed: state.changed,
    changedBranch: state.changedBranch,
    filter: state.filter,
    onToggle: render
  });

  if (!result.matched) {
    viewport.appendChild(notice('No matches', `Nothing in this payload matches "${state.filter}".`, false));
    return;
  }

  if (result.truncated) {
    viewport.appendChild(notice('Output trimmed',
      `Showing the first ${result.rows} rows. Filter the payload or switch to Raw to see the rest.`, false));
  }
}

function rawBlock(text) {
  const pre = document.createElement('pre');
  pre.className = 'raw';
  pre.textContent = text;
  return pre;
}

function notice(title, body, isError) {
  const box = document.createElement('div');
  box.className = `notice${isError ? ' is-error' : ''}`;
  if (title) {
    const heading = document.createElement('h2');
    heading.textContent = title;
    box.appendChild(heading);
  }
  const p = document.createElement('div');
  p.textContent = body;
  box.appendChild(p);
  return box;
}

function emptyNotice() {
  const box = notice('No OmniScript found',
    'Open one, then press Rescan. Every frame, document and open shadow root is searched for elements exposing ' +
    state.prop + '.', false);

  const list = document.createElement('ul');
  const tips = ['Closed shadow roots cannot be read.'];

  const frames = Targets.frames();
  if (frames.length > 1) {
    tips.push('Frames searched: ' + frames.map((frame) => (frame ? Targets.frameLabel(frame) : 'top frame')).join(', ') + '.');
  } else {
    tips.push('No iframes were found on this page.');
  }

  Targets.hints().forEach((h) => {
    if (h.props && h.props.length) tips.unshift(`${h.tag} exposes: ${h.props.join(', ')}`);
  });

  tips.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    list.appendChild(li);
  });

  box.appendChild(list);
  return box;
}

function renderStatus() {
  if (!state.active) return;

  const left = document.createElement('span');
  const host = Targets.selected();

  if (host) {
    const shown = Targets.visibleHosts().length;
    const nested = Targets.nestedCount();
    left.appendChild(strong(String(shown)));
    left.appendChild(document.createTextNode(shown === 1 ? ' OmniScript · ' : ' OmniScripts · '));
    left.appendChild(strong(host.label));
    left.appendChild(document.createTextNode(' · ' + formatBytes(state.raw ? state.raw.length : 0)));
    if (nested) left.appendChild(document.createTextNode(` · ${nested} nested hidden`));
    if (Targets.truncated()) left.appendChild(document.createTextNode(' · list truncated'));
  } else {
    left.textContent = state.scanError ? 'Read failed' : 'Nothing found on this page';
  }

  el.statusLeft.textContent = '';
  el.statusLeft.appendChild(left);

  let right = !state.visible ? 'Idle (panel hidden)'
    : state.stale ? 'Stale (OmniScript gone)'
      : (state.live ? 'Live' : 'Manual');
  if (state.lastUpdate) right += ` · changed ${state.lastUpdate.toLocaleTimeString()}`;
  if (state.changed.size) right += ` · ${state.changed.size} value(s) updated`;
  el.statusRight.textContent = right;
}

function strong(text) {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

function pretty() {
  try { return JSON.stringify(state.data, null, 2); } catch { return state.raw || ''; }
}

function resetPayload() {
  state.raw = null;
  state.data = undefined;
  state.parseError = null;
  state.seeded = false;
  state.stale = false;
  state.expanded = new Set(['']);
  state.expandedText = new Set();
  state.changed = new Set();
  state.changedBranch = new Set();
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

function copyText(text, button, restore) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    flash(button, 'Copied', restore);
  }, () => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    flash(button, 'Copied', restore);
  });
}

function flash(button, message, restore) {
  button.textContent = message;
  setTimeout(() => { button.textContent = restore; }, 1200);
}

function setView(view) {
  state.view = view;
  el.viewTree.classList.toggle('is-on', view === 'tree');
  el.viewRaw.classList.toggle('is-on', view === 'raw');
  render();
}

function downloadPayload() {
  const text = state.parseError ? (state.raw || '') : pretty();
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `omniscript-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function revealElement() {
  const host = Targets.selected();
  if (!host) return;
  const expression = '(function(i){ try { window.$omni = window.__omniHosts[i];' +
    ' if (typeof inspect === "function") inspect(window.$omni); return true; }' +
    ' catch(e){ return String(e); } })(' + JSON.stringify(host.local) + ')';
  Targets.evalOn(host.frame, expression, () => {
    flash(el.select, 'Exposed as $omni', 'Reveal element');
  });
}

function mount() {
  el.live = document.getElementById('live');
  el.refresh = document.getElementById('refresh');
  el.prop = document.getElementById('prop');
  el.viewTree = document.getElementById('view-tree');
  el.viewRaw = document.getElementById('view-raw');
  el.filter = document.getElementById('filter');
  el.expand = document.getElementById('expand');
  el.collapse = document.getElementById('collapse');
  el.copy = document.getElementById('copy');
  el.download = document.getElementById('download');
  el.select = document.getElementById('select');
  el.viewport = document.getElementById('viewport');
  el.statusLeft = document.getElementById('status-left');
  el.statusRight = document.getElementById('status-right');

  el.live.addEventListener('change', () => {
    state.live = el.live.checked;
    if (state.live) read(); else clearTimeout(timer);
    renderStatus();
  });

  el.refresh.addEventListener('click', () => read());

  el.prop.addEventListener('change', () => {
    state.prop = el.prop.value.trim() || 'jsonDataStr';
    el.prop.value = state.prop;
    resetPayload();
    Targets.setProps(state.prop, null);
  });

  el.viewTree.addEventListener('click', () => setView('tree'));
  el.viewRaw.addEventListener('click', () => setView('raw'));

  let filterTimer = null;
  el.filter.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filter = el.filter.value;
      render();
    }, 120);
  });

  el.expand.addEventListener('click', () => {
    state.expanded = new Set();
    addAllPaths(state.data, '', state.expanded, 0);
    render();
  });

  el.collapse.addEventListener('click', () => {
    state.expanded = new Set(['']);
    render();
  });

  el.copy.addEventListener('click', () => {
    copyText(state.parseError ? (state.raw || '') : pretty(), el.copy, 'Copy JSON');
  });

  el.download.addEventListener('click', downloadPayload);
  el.select.addEventListener('click', revealElement);

  document.addEventListener('selectionchange', () => {
    if (state.renderPending && state.active && !hasTextSelection()) render();
  });

  Targets.subscribe((reason) => {
    if (reason === 'selection' || reason === 'props') resetPayload();
    if (state.active) { render(); read(); }
  });
}

export const DataTab = {
  mount,
  read,
  /* For the shared Rescan button, which is visible on every tab: read again
   * only if the Data tab is the one currently on screen, so rescanning from
   * another tab doesn't also render one that is hidden. */
  refreshIfActive: () => { if (state.active) read(); },
  show: () => { state.active = true; render(); read(); },
  hide: () => { state.active = false; clearTimeout(timer); },
  /* Called from the shell's window.OmniPanel.setVisible, after it has already
   * deduplicated repeated calls with the same value — this only ever applies
   * the new value, exactly like Structure.setVisible. */
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) { if (state.active) read(); } else { clearTimeout(timer); }
    renderStatus();
  }
};
