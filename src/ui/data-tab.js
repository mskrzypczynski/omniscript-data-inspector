'use strict';

/* Data tab: the JSON the selected OmniScript is holding right now, re-read on
 * a timer. Frames and OmniScript hosts are owned by targets.js and shared
 * with the Structure tab — this file only asks for the selected host's
 * payload and draws it. */

import { subtreeBranches } from '../core/shared/json-tree-model.js';
import { stepChange, valueAt } from '../core/data/changes.js';
import { copyTarget } from '../core/data/copy-target.js';
import { hasBranches } from '../core/data/expand-controls.js';
import { dataSegments, treePathFor } from '../core/shared/path-links.js';
import { filterForKey } from '../core/shared/filter-query.js';
import { copyValueOf } from './json-tree-view.js';
import { paintExpandControls } from './data/empty-state.js';
import { createRecordLink } from './data/record-link.js';
import { createWatchList } from './data/watch-list.js';
import { createPinsMemory } from './data/pins-memory.js';
import { forgetWatchStrip } from './data/watch-strip.js';
import { renderComparePanel } from './data/compare-panel.js';
import { openRowMenu } from './data/row-menu.js';
import { createLineage } from './data/lineage-view.js';
import { stepMark } from './data/raw-view.js';
import { copyWithToast, copyWithButton } from './clipboard.js';
import { debounce } from './util.js';
import { createReader } from './data/reader.js';
import { createReveal } from './data/reveal.js';
import { renderStatusBar } from './data/status-bar.js';
import { createDataView } from './data/view.js';
import { createDataDump } from './data/dump.js';
import { installDataSettings } from './data/settings.js';
import { revealElement } from './data/payload-actions.js';
import { openExportMenu } from './data/export-menu.js';
import { toast } from './toast.js';
import { Targets } from './targets.js';
import { Nav } from './nav.js';
import { Mask } from './mask-setting.js';
import { resetPayload as resetPayloadFields, markRestart, dropMarks, expireFlash } from '../core/data/payload-state.js';
import { HIGHLIGHT_MS } from '../core/shared/flash.js';
import { Shared } from './shared.js';
import { PayloadHistory } from './payload-history.js';
import { Settings, DEFAULTS } from './settings.js';
import { viewToOpen } from '../core/shared/remembered-views.js';
import { StatusLine } from './status-line.js';
import { Features } from './features.js';


const state = {
  active: true,
  visible: true,
  prop: 'jsonDataStr',
  live: true,
  stale: false,
  renderPending: false,
  view: 'tree', // 'tree' | 'form' | 'raw' | 'sizes' | 'changes'
  filter: '',
  raw: null,
  data: undefined,
  parseError: null,
  scanError: null,
  expanded: new Set(['']),
  filterOpen: new Map(), // while filtering: path -> open, the user's own toggles
  windowNote: '', // "N rows, drawn a window at a time", for the status bar's tooltip
  queryInfo: null, // the $ query being drawn: { text, matches, capped }, for the status bar
  filterKey: '', // the query (and changed-only) those toggles belong to
  hasRead: false, // a read was started since the payload was last reset
  expandedText: new Set(),
  changed: new Set(),
  changedBranch: new Set(),
  pins: [], // watched tree paths, in the order they were added
  notify: new Set(), // watched paths that announce a change
  exprs: [], // typed watch expressions (text), in the order they were added
  exprNotify: new Set(), // expressions that announce a change
  exprEditing: false, // the box for a new expression is open
  exprDraft: '', // what is typed in it
  exprError: '', // why the last one was refused
  log: [], // the change log: the last 200 changes, oldest first
  logOpen: new Set(), // ids of the log entries opened to show their values
  sizesChart: 'list', // which chart the Sizes view shows; not stored
  sizesUnused: false, // the Sizes list shows only what no element reads; not stored
  sizesSlots: new Map(), // the colour each treemap key was given, so it keeps it; not stored
  sizesZoom: '', // the key the Sizes list and treemap are drilled into ('' is the whole payload); not stored
  sizesShown: 20, // how many rows the Sizes list shows (Show 20 more / Show all); not stored
  logSeq: 0,
  changeInfo: null, // what the last read changed: { updated, rowsAdded, rowsRemoved, truncated }
  watchPaint: null,
  watchPrev: {},
  /* The last payloads read, oldest first: the panel-wide history, which every
   * read joins whether Track changes is on or not. */
  get history() { return PayloadHistory.list(); },
  imported: [], // JSON files loaded in the compare panel: { raw, time, label }
  compareOpen: false,
  compareA: null, // snapshots chosen in the compare panel; null picks the last two
  compareB: null,
  compareSig: '',
  rawLines: 0,
  rawMatches: 0,
  rawCursor: -1,
  touched: new Set(), // changed at some point since the marks were cleared
  changedOnly: false,
  trackChanges: false, // the Track changes switch: marks, Changed only, the change log and Compare data
  before: new Map(), // marked path -> its value before the first change since the marks were cleared
  focus: null, // the row jumped to: next/previous change, or from Structure
  scrollToFocus: false,
  jumpedAt: 0, // when that jump was made (ms): its row flashes for JUMP_FLASH_MS, then looks like any other
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

/* "Where is this set?": the row tooltip's last-change line and the row menu's popover. */
const lineage = createLineage(state);

/* The read loop (poller, stale handling, redraw-only-on-change) lives in
 * data/reader.js. */
const reader = createReader(state, { render, renderStatus });
const revealPath = createReveal(state, el, setView);

/* The watch list kept between sessions, while Remember my settings is on. */
const pinsMemory = createPinsMemory({ state, render, clear: clearWatchList });

/* The pinned paths, the typed expressions and the strip that shows them. */
const { togglePin, renderWatch: drawWatch, watchExpressionFor } = createWatchList({ state, el, render, revealPath, changed: pinsMemory.save });

/* The strip exists only where the watch list does (a gated feature): Free has no #watch. */
function renderWatch() {
  if (el.watch) drawWatch();
}

/* Open record: the page's origin, for the Id values that can be opened. */
const recordLink = createRecordLink({ state, render });

/* What is drawn into the viewport, and the caches a redraw reuses. */
const view = createDataView({ state, el, render, renderStatus, revealPath, togglePin, rowMenu, lineage, recordLink, clearFilter });

/* Nothing watched: the lists of pins, bells and expressions, and the strip's
 * memory. Also when the page now holds another script, so its watch list never
 * starts from (or is saved with) the previous script's. */
function clearWatchList() {
  state.pins = [];
  state.notify = new Set();
  state.exprs = [];
  state.exprNotify = new Set();
  state.exprEditing = false;
  state.exprDraft = '';
  state.exprError = '';
  forgetWatchStrip(state);
  state.watchPrev = {};
}

function hasTextSelection() {
  const selection = window.getSelection && window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const node = selection.anchorNode;
  return !!(node && el.viewport.contains(node));
}

/* The user is mid-gesture in the tree: selecting text, or pointing at a copy
 * button. A rebuild now would swallow the click. Focus alone is not a
 * gesture: a button keeps focus after its click, and waiting for focus to move
 * would freeze the live tree. */
function isInteracting() {
  return hasTextSelection() || !!el.viewport.querySelector('.row-copy:not(.row-fold):hover');
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function consumeReveal() {
  if (!state.pendingReveal || state.data === undefined || state.parseError) return;
  const hit = treePathFor(state.data, state.pendingReveal);
  state.pendingReveal = null;

  if (!hit.found) {
    showNote('Not in the data yet', 'That element has no value on this property right now.');
    return;
  }

  revealPath(hit.path, { clearFilters: true, expandSelf: true });
  if (!hit.exact) showNote('Showing the nearest parent', 'The element itself has no value yet.');
}

let noteTimer = null;

function showNote(title, body) {
  state.note = { title, body };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { state.note = null; render(); }, 4000);
}

/* The flash ends by itself (CSS), so expiry only has to forget the paths: no
 * redraw, which would drop selection and scroll for nothing. */
let flashTimer = null;
function scheduleFlashExpiry() {
  clearTimeout(flashTimer);
  flashTimer = null;
  if (!state.changedAt) return;
  const left = HIGHLIGHT_MS - (Date.now() - state.changedAt);
  flashTimer = setTimeout(() => { flashTimer = null; expireFlash(state, Date.now()); }, Math.max(left, 0) + 20);
}

/* A redraw asked for while one is under way (the definition arriving
 * synchronously, say) waits for it to finish: two draws into the same viewport
 * would stack two trees. */
let drawing = false;
let drawAgain = false;

function render() {
  if (drawing) { drawAgain = true; return; }
  drawing = true;
  try { draw(); } finally { drawing = false; }
  if (drawAgain) { drawAgain = false; render(); }
}

function draw() {
  expireFlash(state, Date.now());
  scheduleFlashExpiry();
  consumeReveal();
  syncFilterKey();
  renderStatus();
  renderWatch();
  renderCompare();

  /* Rebuilding the tree drops the user's selection, so a poll must not do it
   * while they are selecting text or using a copy button. Wait until they stop. */
  if (isInteracting()) { state.renderPending = true; return; }
  state.renderPending = false;

  view.drawViewport();
}

function renderStatus() {
  if (!state.active) return;
  renderStatusBar(el, state, view.changeList().length);
}

function resetPayload() {
  resetPayloadFields(state);
  state.sizesSlots = new Map();
  PayloadHistory.clear();
  state.hasRead = false;
  state.filterOpen = new Map();
}

/* "Clear filter" beside a search that found nothing. */
function clearFilter() {
  state.filter = '';
  el.filter.value = '';
  render();
  el.filter.focus();
}

function isFiltering() {
  return !!state.filter.trim() || state.changedOnly;
}

/* Toggles made during a search belong to that search: a new query (or turning
 * changed-only on or off) starts again with every match open. */
function syncFilterKey() {
  const key = state.filter.trim().toLowerCase() + '\u0000' + state.changedOnly;
  if (key === state.filterKey) return;
  state.filterKey = key;
  state.filterOpen = new Map();
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

/* A new property name: the old payload is meaningless, so read afresh. */
function commitProp(value) {
  state.prop = value;
  resetPayload();
  Targets.setProps(state.prop, null);
}

/* Refresh is the way to update while Auto-refresh is off, so it is the
 * primary button then; while the tab updates itself it is a plain one. */
function paintRefresh() {
  el.refresh.classList.toggle('primary', !state.live);
}

function setLive(on) {
  state.live = on;
  el.live.checked = on;
  paintRefresh();
  if (on) reader.read(); else reader.stop();
  renderStatus();
  Settings.notify();
}

/* The Track changes switch. On shows the Changes bar and the Changes view and
 * starts keeping marks and the change log; off drops what was kept and hides
 * both. The amber flash of a changed value and the payload history do not
 * depend on it. */
function setTrackChanges(on, remember = true) {
  if (!Features.has('data.changes')) return;
  state.trackChanges = on;
  el.dataChanges.checked = on;
  el.viewChanges.hidden = !on;
  paintTreeOnly();
  if (!on) {
    dropMarks(state);
    state.changedOnly = false;
    el.changedOnly.checked = false;
    state.compareOpen = false;
    state.compareSig = '';
    state.imported = [];
    if (state.view === 'changes') setView('tree', false);
  }
  if (remember) Settings.set('dataChanges', on);
  render();
}

/* Expand all and Collapse all open and close the branches of the Tree and the groups
 * of the Form: elsewhere they stay in place, greyed out with the reason in their
 * tooltip, so the toolbar does not jump. The Changes bar belongs to the three
 * views of the data itself. The view switch is the first thing on the toolbar and
 * does not depend on any of this, so nothing that appears or leaves moves it. */
function paintTreeOnly() {
  const branches = hasBranches(state.view);
  paintExpandControls(state.view);
  if (el.changesBar) el.changesBar.hidden = !(state.trackChanges && (branches || state.view === 'raw'));
}

function setView(view, redraw = true) {
  /* A view whose button is not there (Sizes, Changes in Free) cannot be shown. */
  if (view === 'sizes' && !Features.has('data.sizes')) view = 'tree';
  if (view === 'changes' && !Features.has('data.changes')) view = 'tree';
  state.view = view;
  [['tree', el.viewTree], ['form', el.viewForm], ['sizes', el.viewSizes], ['raw', el.viewRaw], ['changes', el.viewChanges]].forEach(([name, button]) => {
    if (!button) return;
    button.classList.toggle('is-on', view === name);
    button.setAttribute('aria-pressed', String(view === name));
  });
  paintTreeOnly();
  if (redraw) render();
}

/* ------------------------------------------------------------------ *
 * Right-click menu
 * ------------------------------------------------------------------ */

function rowMenu(ev, info) {
  openRowMenu(ev, info, {
    state,
    filtering: isFiltering,
    copy: (text, what) => copyWithToast(text, what ? `Copied ${what}` : 'Copied'),
    filterTo: (key) => { const text = filterForKey(key); state.filter = text; el.filter.value = text; render(); },
    togglePin,
    watchExpression: watchExpressionFor,
    canShowInStructure: (path) => !!view.jumpLabel(view.ownerLookup(), path),
    showInStructure: (path) => Nav.go('structure', { segments: dataSegments(state.data, path) }),
    whereFrom: lineage.show,
    recordLink,
    rerender: render
  });
}

/* ------------------------------------------------------------------ *
 * Compare data
 * ------------------------------------------------------------------ */

function renderCompare() {
  if (!el.comparePanel || !Features.has('data.compare')) return;
  renderComparePanel({ panel: el.comparePanel, toggle: el.compareToggle }, state, { copy: copyWithButton, step: () => Shared.step() });
}

/* Jump to the previous / next marked change, opening whatever hides it. */
function stepToChange(dir) {
  if (!Features.has('data.changes')) return;
  const list = view.changeList();
  const target = stepChange(list, state.focus, dir);
  if (target === null) { toast('No marked changes'); return; }

  revealPath(target, { clearFilters: true, keepChangedOnly: true });
  render();
}

function mount() {
  el.live = document.getElementById('live');
  el.refresh = document.getElementById('refresh');
  el.viewTree = document.getElementById('view-tree');
  el.viewForm = document.getElementById('view-form');
  el.viewRaw = document.getElementById('view-raw');
  el.viewSizes = document.getElementById('view-sizes');
  el.viewChanges = document.getElementById('view-changes');
  el.filter = document.getElementById('filter');
  el.expand = document.getElementById('expand');
  el.collapse = document.getElementById('collapse');
  el.export = document.getElementById('data-export');
  el.select = document.getElementById('select');
  el.dataChanges = document.getElementById('data-changes');
  el.changesBar = document.getElementById('changes-bar');
  el.changedOnly = document.getElementById('changed-only');
  el.prevChange = document.getElementById('prev-change');
  el.nextChange = document.getElementById('next-change');
  el.changeCount = document.getElementById('change-count');
  el.clearChanges = document.getElementById('clear-changes');
  el.watch = document.getElementById('watch');
  el.comparePanel = document.getElementById('compare-panel');
  el.compareToggle = document.getElementById('compare-toggle');
  el.viewport = document.getElementById('viewport');

  /* Always starts live: the browser may restore the checkbox
   * ticked or unticked, so set it explicitly. */
  el.live.checked = true;
  state.live = el.live.checked;

  state.prop = Settings.get('dataProp').trim() || DEFAULTS.dataProp;
  Targets.initProps(state.prop, null);
  /* The payload for the other tabs (Calls links calls to changes in
   * it; the debug bundle includes it), with the panel-wide history. */
  Shared.setPayload(() => ({ prop: state.prop, raw: state.raw, data: state.data, history: PayloadHistory.list() }));
  Shared.setDump('data', createDataDump({ state, sizesOf: view.sizesOf }));
  setView(viewToOpen('dataView', Settings.get('dataView'), 'tree'), false);
  if (Features.has('data.changes')) {
    state.trackChanges = Settings.get('dataChanges');
    el.dataChanges.checked = state.trackChanges;
    el.viewChanges.hidden = !state.trackChanges;
    el.dataChanges.addEventListener('change', () => setTrackChanges(el.dataChanges.checked));
  }
  paintTreeOnly();
  paintRefresh();
  if (!Features.has('data.query')) {
    /* Free keeps the path and key=value forms; the title leaves out the $ query. */
    el.filter.title = 'Narrow the tree by text, a path such as Step:Rows|2:Field or key=value. (/)';
  }

  el.live.addEventListener('change', () => setLive(el.live.checked));

  el.refresh.addEventListener('click', () => reader.readFull());

  installDataSettings({
    state, render,
    set: { view: setView, prop: commitProp, trackChanges: setTrackChanges, live: setLive }
  });

  el.viewTree.addEventListener('click', () => { setView('tree'); Settings.set('dataView', 'tree'); });
  el.viewForm.addEventListener('click', () => { setView('form'); Settings.set('dataView', 'form'); });
  el.viewRaw.addEventListener('click', () => { setView('raw'); Settings.set('dataView', 'raw'); });
  /* Sizes and Changes are views of the moment: not kept as the default view. */
  if (el.viewSizes) el.viewSizes.addEventListener('click', () => setView('sizes'));
  if (el.viewChanges) el.viewChanges.addEventListener('click', () => setView('changes'));

  const applyFilter = debounce(() => {
    state.filter = el.filter.value;
    render();
  }, 120);
  el.filter.addEventListener('input', applyFilter);

  /* While searching, Expand all means "every match open" (no overrides) and
   * Collapse all closes every branch but the top one. */
  el.expand.addEventListener('click', () => {
    if (isFiltering()) { state.filterOpen = new Map(); render(); return; }
    /* Branches only: counting every leaf used up the 20,000 allowed long
     * before a big payload was open, and said nothing about it. */
    const { paths, capped } = subtreeBranches(state.data, '');
    state.expanded = new Set(['', ...paths]);
    if (capped) toast(`Opened the first ${paths.length.toLocaleString('en-US')} branches`);
    render();
  });

  el.collapse.addEventListener('click', () => {
    if (isFiltering()) {
      state.filterOpen = new Map(subtreeBranches(state.data, '').paths.filter((path) => path !== '').map((path) => [path, false]));
    } else {
      state.expanded = new Set(['']);
    }
    render();
  });

  el.export.addEventListener('click', (ev) => openExportMenu(ev, el.export, state));

  if (Features.has('data.changes')) {
    el.changedOnly.addEventListener('change', () => {
      state.changedOnly = el.changedOnly.checked;
      render();
    });

    el.prevChange.addEventListener('click', () => stepToChange(-1));
    el.nextChange.addEventListener('click', () => stepToChange(1));

    el.clearChanges.addEventListener('click', () => {
      state.touched = new Set();
      state.before = new Map();
      state.log = [];
      state.logOpen.clear();
      state.focus = null;
      render();
    });
  }

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

  if (Features.has('data.compare')) {
    el.compareToggle.addEventListener('click', () => {
      state.compareOpen = !state.compareOpen;
      state.compareSig = '';
      renderCompare();
    });
  }

  /* In the raw view the filter is a text search: Enter / Shift+Enter walk the
   * matches. */
  el.filter.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || state.view !== 'raw') return;
    state.rawCursor = stepMark(el.viewport, state.rawCursor, ev.shiftKey);
  });

  el.viewport.addEventListener('mouseover', (ev) => {
    const row = ev.target.closest && ev.target.closest('.row, .form-row');
    if (row && row.dataset.path !== undefined) state.hoverPath = row.dataset.path;
  });
  el.viewport.addEventListener('mouseleave', () => { state.hoverPath = null; });

  el.select.addEventListener('click', () => revealElement(el.select));

  const flushPending = () => {
    if (state.renderPending && state.active && !isInteracting()) render();
  };
  document.addEventListener('selectionchange', flushPending);
  el.viewport.addEventListener('mouseout', () => setTimeout(flushPending, 0));
  el.viewport.addEventListener('focusout', () => setTimeout(flushPending, 0));

  /* Esc goes up a level of the Sizes view wherever focus is: a changed read
   * builds the view again, and the key must not depend on the old box. */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (!state.active || state.view !== 'sizes' || !el.viewport.isConnected) return;
    /* A read that removed the focused row leaves focus on the pane itself. */
    if (ev.target !== document.body && ev.target !== document.documentElement && ev.target !== el.viewport) return;
    if (document.querySelector('.help-overlay:not([hidden])')) return;
    const box = el.viewport.firstElementChild;
    if (box && box.classList.contains('sizes') && box.goUp && box.goUp()) ev.preventDefault();
  });

  Nav.on('data', (request) => {
    state.pendingReveal = request.segments;
    if (state.active) render();
  });

  recordLink.refresh();
  Targets.subscribe((reason) => {
    if (reason === 'list') { render(); return; }
    recordLink.refresh();
    /* A different script (or property, or page) means a different definition. */
    Shared.setElements([]);
    state.ownersRequested = false;
    if (reason === 'navigated') markRestart(state);
    if (reason === 'selection') { state.sizesZoom = ''; state.sizesUnused = false; clearWatchList(); }
    if (reason === 'selection' || reason === 'props') resetPayload();
    pinsMemory.sync(reason === 'selection');
    if (!state.active) return;
    render();
    /* A script or property the user picked is read at once; a rescan that
     * merely found something new ('hosts', 'navigated') is background. */
    if (reason === 'selection' || reason === 'props') reader.read(); else reader.readInBackground();
  });
}

/* Keyboard: c copies the value under the pointer (or the row just jumped
 * to, while it flashes), n / p walk the marked changes. */
function copySelected() {
  /* A row with keyboard focus is the one meant; otherwise the one under the
   * pointer; otherwise the one just jumped to while its flash shows (core/data/copy-target.js). */
  const focused = document.activeElement;
  const focusedPath = focused && el.viewport.contains(focused) && (focused.classList.contains('row') || focused.classList.contains('form-row')) ? focused.dataset.path : undefined;
  const target = copyTarget({ focused: focusedPath, hovered: state.hoverPath, jumped: state.focus, jumpedAt: state.jumpedAt, now: Date.now() });
  const value = target === null || state.data === undefined ? undefined : valueAt(state.data, target.path);
  if (value === undefined) { toast('Point at a row first'); return; }
  copyWithToast(copyValueOf(Mask.apply(value)), 'Copied value');
}

export const DataTab = {
  mount,
  copySelected,
  step: stepToChange,
  focusFilter: () => el.filter.focus(),
  read: reader.read,
  /* For the shared Rescan button, which is visible on every tab: read again
   * only if the Data tab is the one currently on screen, so rescanning from
   * another tab doesn't also render one that is hidden. A rescan is a
   * background event: with Auto-refresh off it never reads the payload. */
  refreshIfActive: () => { if (state.active) reader.readInBackground(); },
  show: () => { state.active = true; render(); reader.readInBackground(); },
  hide: () => { state.active = false; reader.stop(); StatusLine.title(''); },
  /* Called from the shell's window.OmniPanel.setVisible, after it has already
   * deduplicated repeated calls with the same value — this only ever applies
   * the new value, exactly like Structure.setVisible. */
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) { if (state.active) reader.readInBackground(); } else { reader.stop(); }
    renderStatus();
  }
};
