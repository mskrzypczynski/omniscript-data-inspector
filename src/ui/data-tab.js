'use strict';

/* Data tab: the JSON the selected OmniScript is holding right now, re-read on
 * a timer. Frames and OmniScript hosts are owned by targets.js and shared
 * with the Structure tab — this file only asks for the selected host's
 * payload and draws it. */

import { addAllPaths } from '../core/json-tree-model.js';
import { formatBytes } from '../core/targets-model.js';
import { orderedChanges, changedVisible, stepChange, ancestorsOf, valueAt } from '../core/changes.js';
import { dataSegments, treePathFor, ownerIndex } from '../core/path-links.js';
import { renderJsonTree, copyValueOf } from './json-tree-view.js';
import { notice } from './notice.js';
import { renderWatchStrip } from './data/watch-strip.js';
import { renderComparePanel } from './data/compare-panel.js';
import { openRowMenu } from './data/row-menu.js';
import { buildRawBlock, stepMark } from './data/raw-view.js';
import { copyWithToast, copyWithButton } from './clipboard.js';
import { toast } from './toast.js';
import { Targets } from './targets.js';
import { attachPropPicker } from './prop-picker.js';
import { Nav } from './nav.js';
import { Mask } from './mask-setting.js';
import { applyPayload, resetPayload as resetPayloadFields, stopTracking, startTracking } from '../core/payload-state.js';
import { Advanced } from './advanced.js';
import { Shared } from './shared.js';

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
  pins: [], // watched tree paths, in the order they were added
  watchSig: '',
  watchPrev: {},
  history: [], // last payloads read: { raw, time }
  compareOpen: false,
  compareA: null, // snapshots chosen in the compare panel; null picks the last two
  compareB: null,
  compareSig: '',
  rawWrap: false,
  rawLines: 0,
  rawMatches: 0,
  rawCursor: -1,
  touched: new Set(), // changed at some point since the marks were cleared
  changedOnly: false,
  before: new Map(), // marked path -> its value before the first change since the marks were cleared
  focus: null, // the row jumped to: next/previous change, or from Structure
  scrollToFocus: false,
  ownersRequested: false, // asked Structure for the definition since the last scope change
  hoverPath: null, // the row the pointer is over, for the c shortcut
  scrollTo: null, // set by the last tree drawn: brings a path into view, windowed or not
  pendingReveal: null, // key list from the Structure tab, applied once data is read
  note: null,
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

/* What the tree on screen depends on. A poll that leaves it unchanged must not
 * rebuild the DOM: that drops focus and hover from the copy buttons. */
function viewSignature() {
  return [state.rawVersion, state.changed.size, state.touched.size, state.stale, state.scanError,
    !!Targets.selected()].join('\u0000');
}

function refreshView(before) {
  if (viewSignature() === before) renderStatus(); else render();
}

function read() {
  const before = viewSignature();

  if (!Targets.selected()) {
    markStale();
    refreshView(before);
    schedule();
    return;
  }

  Targets.fetch(state.prop, (value, error) => {
    if (error) {
      state.scanError = error.value || error.description || error.error || 'The page could not be read.';
      refreshView(before);
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
    refreshView(before);
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

/* The user is mid-gesture in the tree: selecting text, or pointing at or
 * focused on a copy button. A rebuild now would swallow the click. */
function isInteracting() {
  return hasTextSelection() || !!el.viewport.querySelector('.row-copy:hover, .row-copy:focus');
}

function apply(raw) {
  /* Marks, "was" values and the comparison history only serve the Advanced
   * controls, so they are collected only while those are shown. */
  applyPayload(state, raw, new Date(), Advanced.on());
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/* The marked paths in tree order. Walking a payload every second just to count
 * them is wasteful, so the answer is reused until the payload or the marks
 * change. */
let changeCache = { data: null, touched: null, size: -1, list: [] };

function changeList() {
  if (state.data === undefined) return [];
  if (changeCache.data !== state.data || changeCache.touched !== state.touched || changeCache.size !== state.touched.size) {
    changeCache = {
      data: state.data, touched: state.touched, size: state.touched.size,
      list: orderedChanges(state.data, state.touched)
    };
  }
  return changeCache.list;
}

/* Which rows can jump to Structure: those whose key belongs to an element of
 * the definition (itself, or the nearest element above it). The definition is
 * fetched once in the background when this tab first needs it; until it is
 * there, or if the script has none, no row offers the button. */
let ownerCache = { elements: null, data: null, lookup: null };

function ownerLookup() {
  if (!state.ownersRequested) {
    state.ownersRequested = true;
    Shared.ensureElements(() => { if (state.active) render(); });
  }
  const elements = Shared.elements();
  if (!elements.length || state.data === undefined) return null;
  /* The index depends only on these two references; rebuilding it on every
   * redraw walked the payload once per element without a JSONPath. */
  if (ownerCache.elements !== elements || ownerCache.data !== state.data) {
    ownerCache = { elements, data: state.data, lookup: ownerIndex(elements, state.data) };
  }
  return ownerCache.lookup;
}

function jumpLabel(owners, path) {
  if (!owners || !path) return null;
  const hit = owners(dataSegments(state.data, path));
  if (!hit) return null;
  return hit.exact
    ? `Select ${hit.element.name} in the Structure tab`
    : `Select ${hit.element.name} in the Structure tab (the element this value sits under)`;
}

function consumeReveal() {
  if (!state.pendingReveal || state.data === undefined || state.parseError) return;
  const hit = treePathFor(state.data, state.pendingReveal);
  state.pendingReveal = null;

  if (!hit.found) {
    showNote('Not in the data yet', 'That element has no value on this property right now.');
    return;
  }

  clearViewFilters();
  ancestorsOf(hit.path).forEach((path) => state.expanded.add(path));
  state.expanded.add(hit.path);
  state.focus = hit.path;
  state.scrollToFocus = true;
  if (!hit.exact) showNote('Showing the nearest parent', 'The element itself has no value yet.');
}

let noteTimer = null;

function showNote(title, body) {
  state.note = { title, body };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { state.note = null; render(); }, 4000);
}

function clearViewFilters() {
  state.filter = '';
  el.filter.value = '';
  state.changedOnly = false;
  el.changedOnly.checked = false;
  if (state.view !== 'tree') setView('tree', false);
}

function scrollToFocus() {
  if (!state.scrollToFocus) return;
  state.scrollToFocus = false;
  if (state.scrollTo) state.scrollTo(state.focus);
}

function render() {
  consumeReveal();
  renderStatus();
  renderWatch();
  renderCompare();

  /* Rebuilding the tree drops the user's selection, so a poll must not do it
   * while they are selecting text or using a copy button. Wait until they stop. */
  if (isInteracting()) { state.renderPending = true; return; }
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

  if (state.note) viewport.appendChild(notice(state.note.title, state.note.body, false));

  if (state.view === 'raw') {
    viewport.appendChild(rawBlock(pretty()));
    renderStatus(); // line and match counts are known only now
    return;
  }

  if (state.changedOnly && !changeList().length) {
    viewport.appendChild(notice('No changes yet',
      'Nothing has changed since the marks were cleared. Values that change while this tab is open are listed here.', false));
    return;
  }

  const owners = ownerLookup();
  const result = renderJsonTree(viewport, state.prop, state.data, {
    expanded: state.expanded,
    expandedText: state.expandedText,
    changed: state.changed,
    changedBranch: state.changedBranch,
    touched: state.touched,
    before: state.before,
    focus: state.focus,
    only: state.changedOnly ? changedVisible(state.data, state.touched) : null,
    filter: state.filter,
    transform: Mask.apply,
    onJump: (path) => Nav.go('structure', { segments: dataSegments(state.data, path) }),
    jumpLabel: (path) => jumpLabel(owners, path),
    pinned: new Set(state.pins),
    onPin: togglePin,
    onContext: rowMenu,
    onToggle: render
  });
  state.scrollTo = result.scrollTo;

  if (!result.matched) {
    viewport.appendChild(notice('No matches', state.filter
      ? `Nothing ${state.changedOnly ? 'changed ' : ''}in this payload matches "${state.filter}".`
      : 'Nothing to show.', false));
    return;
  }

  scrollToFocus();

  if (result.truncated) {
    viewport.appendChild(notice('Output trimmed',
      `Showing the first ${result.rows} rows. Filter the payload or switch to Raw to see the rest.`, false));
  }
  if (result.windowed) {
    el.statusLeft.title = `${result.rows} rows, drawn a window at a time`;
  }
}

/* The raw view for the current text; the line and match counts it found are
 * kept for the status bar and for walking matches. */
function rawBlock(text) {
  const { node, lines, matches } = buildRawBlock(text, { query: state.filter, wrap: state.rawWrap });
  state.rawLines = lines;
  state.rawMatches = matches;
  state.rawCursor = -1;
  return node;
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
  if (state.view === 'raw' && state.data !== undefined) {
    right += ` · ${state.rawLines} lines`;
    if (state.filter.trim()) right += ` · ${state.rawMatches} match${state.rawMatches === 1 ? '' : 'es'}`;
  }
  const marked = changeList().length;
  el.changeCount.textContent = marked ? `${marked} marked` : 'none marked';
  el.prevChange.disabled = marked === 0;
  el.nextChange.disabled = marked === 0;
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
  resetPayloadFields(state);
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

function flash(button, message, restore) {
  button.textContent = message;
  setTimeout(() => { button.textContent = restore; }, 1200);
}

function setView(view, redraw = true) {
  state.view = view;
  el.viewTree.classList.toggle('is-on', view === 'tree');
  el.viewRaw.classList.toggle('is-on', view === 'raw');
  el.rawWrap.closest('label').hidden = view !== 'raw';
  if (redraw) render();
}

/* The payload as text for the clipboard or a file, masked when the scope-bar
 * switch is on. null when masking was asked for but the property is not valid
 * JSON, so there is no structure to keep. */
function payloadText() {
  if (state.parseError) return Mask.on() ? null : (state.raw || '');
  if (state.data === undefined) return '';
  try { return JSON.stringify(Mask.apply(state.data), null, 2); } catch { return state.raw || ''; }
}

function downloadPayload() {
  const text = payloadText();
  if (text === null) { flash(el.download, 'Not valid JSON', 'Save file'); return; }
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

/* ------------------------------------------------------------------ *
 * Watch list
 * ------------------------------------------------------------------ */

function togglePin(path) {
  const at = state.pins.indexOf(path);
  if (at === -1) state.pins.push(path); else state.pins.splice(at, 1);
  state.watchSig = '';
  render();
}

/* Opens a path in the tree: the ancestors, then the row, scrolled into view. */
function revealPath(path) {
  if (state.view !== 'tree') setView('tree', false);
  if (state.filter) { state.filter = ''; el.filter.value = ''; }
  state.changedOnly = false;
  el.changedOnly.checked = false;
  ancestorsOf(path).forEach((ancestor) => state.expanded.add(ancestor));
  state.focus = path;
  state.scrollToFocus = true;
  render();
}

function renderWatch() {
  renderWatchStrip(el.watch, state, { reveal: revealPath, remove: togglePin });
}

/* ------------------------------------------------------------------ *
 * Right-click menu
 * ------------------------------------------------------------------ */

function rowMenu(ev, info) {
  openRowMenu(ev, info, {
    state,
    copy: (text) => copyWithToast(text, 'Copied'),
    filterTo: (key) => { state.filter = key; el.filter.value = key; render(); },
    togglePin,
    canShowInStructure: (path) => !!jumpLabel(ownerLookup(), path),
    showInStructure: (path) => Nav.go('structure', { segments: dataSegments(state.data, path) }),
    rerender: render
  });
}

/* ------------------------------------------------------------------ *
 * Compare payloads
 * ------------------------------------------------------------------ */

function renderCompare() {
  renderComparePanel({ panel: el.comparePanel, toggle: el.compareToggle }, state, { copy: copyWithButton });
}

/* Jump to the previous / next marked change, opening whatever hides it. */
function stepToChange(dir) {
  const list = changeList();
  const target = stepChange(list, state.focus, dir);
  if (target === null) { toast('No marked changes'); return; }

  if (state.view !== 'tree') setView('tree', false);
  if (state.filter) { state.filter = ''; el.filter.value = ''; }
  ancestorsOf(target).forEach((path) => state.expanded.add(path));
  state.focus = target;
  state.scrollToFocus = true;
  render();
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
  el.changedOnly = document.getElementById('changed-only');
  el.prevChange = document.getElementById('prev-change');
  el.nextChange = document.getElementById('next-change');
  el.changeCount = document.getElementById('change-count');
  el.clearChanges = document.getElementById('clear-changes');
  el.watch = document.getElementById('watch');
  el.comparePanel = document.getElementById('compare-panel');
  el.compareToggle = document.getElementById('compare-toggle');
  el.rawWrap = document.getElementById('raw-wrap');
  el.viewport = document.getElementById('viewport');
  el.statusLeft = document.getElementById('status-left');
  el.statusRight = document.getElementById('status-right');

  el.live.addEventListener('change', () => {
    state.live = el.live.checked;
    if (state.live) read(); else clearTimeout(timer);
    renderStatus();
  });

  el.refresh.addEventListener('click', () => read());

  attachPropPicker(el.prop, (done) => Targets.listProps(done));

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
    const text = payloadText();
    if (text === null) { flash(el.copy, 'Not valid JSON', 'Copy JSON'); return; }
    copyWithButton(text, el.copy, 'Copy JSON');
  });

  el.changedOnly.addEventListener('change', () => {
    state.changedOnly = el.changedOnly.checked;
    render();
  });

  el.prevChange.addEventListener('click', () => stepToChange(-1));
  el.nextChange.addEventListener('click', () => stepToChange(1));

  el.clearChanges.addEventListener('click', () => {
    state.touched = new Set();
    state.before = new Map();
    state.focus = null;
    render();
  });

  /* Using the toolbar means the user is done with whatever text they had
   * selected in the view: let the redraw happen now instead of waiting for them
   * to click somewhere to release it. */
  const releaseSelection = () => {
    const selection = window.getSelection && window.getSelection();
    if (selection && hasTextSelection()) selection.removeAllRanges();
    /* A redraw deferred while text was selected is flushed by the selection
     * change this causes, so renderPending must stay set. */
  };
  document.querySelector('#view-data .toolbar').addEventListener('mousedown', releaseSelection);
  document.querySelector('#view-data .toolbar').addEventListener('keydown', releaseSelection);

  /* Advanced controls are hidden when it is off, so nothing they set may stay
   * in force. */
  Advanced.subscribe((on) => {
    if (on) { startTracking(state, new Date()); renderCompare(); return; }
    state.changedOnly = false;
    el.changedOnly.checked = false;
    state.compareOpen = false;
    stopTracking(state);
    render();
  });

  el.compareToggle.addEventListener('click', () => {
    state.compareOpen = !state.compareOpen;
    state.compareSig = '';
    renderCompare();
  });

  el.rawWrap.addEventListener('change', () => {
    state.rawWrap = el.rawWrap.checked;
    render();
  });

  /* In the raw view the filter is a text search: Enter / Shift+Enter walk the
   * matches. */
  el.filter.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || state.view !== 'raw') return;
    state.rawCursor = stepMark(el.viewport, state.rawCursor, ev.shiftKey);
  });

  el.viewport.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest && ev.target.closest('.row');
    if (row && row.dataset.path !== undefined) state.hoverPath = row.dataset.path;
  });
  el.viewport.addEventListener('mouseleave', () => { state.hoverPath = null; });

  el.download.addEventListener('click', downloadPayload);
  el.select.addEventListener('click', revealElement);

  const flushPending = () => {
    if (state.renderPending && state.active && !isInteracting()) render();
  };
  document.addEventListener('selectionchange', flushPending);
  el.viewport.addEventListener('mouseout', () => setTimeout(flushPending, 0));
  el.viewport.addEventListener('focusout', () => setTimeout(flushPending, 0));

  Nav.on('data', (request) => {
    state.pendingReveal = request.segments;
    if (state.active) render();
  });

  Targets.subscribe((reason) => {
    if (reason === 'list') { render(); return; }
    /* A different script (or property, or page) means a different definition. */
    Shared.setElements([]);
    state.ownersRequested = false;
    if (reason === 'selection') { state.pins = []; state.watchSig = ''; state.watchPrev = {}; }
    if (reason === 'selection' || reason === 'props') resetPayload();
    if (state.active) { render(); read(); }
  });
}

/* Keyboard: c copies the value under the pointer (or the row last jumped
 * to), n / p walk the marked changes. */
function copySelected() {
  const path = state.hoverPath !== null ? state.hoverPath : state.focus;
  const value = path === null || state.data === undefined ? undefined : valueAt(state.data, path);
  if (value === undefined) { toast('Point at a row first'); return; }
  copyWithToast(copyValueOf(Mask.apply(value)), 'Copied value');
}

export const DataTab = {
  mount,
  copySelected,
  step: stepToChange,
  focusFilter: () => el.filter.focus(),
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
