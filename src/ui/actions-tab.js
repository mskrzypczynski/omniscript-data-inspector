'use strict';

/* Calls tab.
 *
 * Listens to the DevTools network stream and decodes the Apex calls OmniStudio
 * makes. A remote action reaches the server as an Aura ApexAction wrapping
 * { sClassName, sMethodName, input, options }, so one HTTP request can carry
 * several actions — each becomes its own row.
 *
 * Everything is best-effort: when a shape is not recognised the entry still
 * appears with its raw request and response, so nothing is silently dropped.
 *
 * This module owns the state and the wiring; the capture, the list, the
 * detail pane, the selection bar, the settings and the loaded-session swap it
 * draws on live in src/ui/actions/.
 */

import { icon, setLabel } from './icons.js';
import { exportEntries, badgeSummary, failed } from '../core/shared/actions-model.js';
import { actionsStatus } from '../core/actions/actions-status.js';
import { actionsDump } from '../core/actions/actions-dump.js';
import { groupChains, chainRows, withChainIds, nextStopCheck, isChainId } from '../core/actions/actions-chains.js';
import { sessionText } from '../core/actions/actions-import.js';
import { Mask } from './mask-setting.js';
import { Session } from './session.js';
import { Targets } from './targets.js';
import { Shared } from './shared.js';
import { Nav } from './nav.js';
import { Settings } from './settings.js';
import { Features } from './features.js';
import { copyWithToast, copyWithButton } from './clipboard.js';
import { openContextMenu } from './context-menu.js';
import { toast } from './toast.js';
import { StatusLine } from './status-line.js';
import { debounce, downloadText } from './util.js';
import { createCallList } from './actions/call-list.js';
import { createDetailPane } from './actions/detail-pane.js';
import { createCapture, MAX_ENTRIES } from './actions/capture.js';
import { createChoose } from './actions/choose.js';
import { createFiltering } from './actions/filtering.js';
import { createSelectionBar } from './actions/selection-bar.js';
import { createSessionView, blankView } from './actions/session.js';
import { createActionsSettings } from './actions/settings.js';
import { createTestPane } from './actions/test-pane.js';
import { createRawPane } from './actions/raw-pane.js';
import { newCallButton, hiddenBy, hiddenWords } from '../core/actions/test-calls.js';
import { Page } from './page.js';

const state = {
  active: false,
  clearOnReload: false, // start a new list when the page reloads (off: the log is kept)
  showAll: false, // every Apex call, not only OmniStudio's (the All Apex calls box)
  filter: '',
  errorsOnly: false,
  slowMs: 0, // 0 = no threshold
  timeFormat: 'ms', // how call times are written: 'ms' or 'human'
  ...blankView(),
  chains: [], // the chains found in the calls, worked out on every redraw (core groupChains)
  repeats: new Map(), // call id -> { ofId, count } for the calls that repeat an earlier one (core findRepeats)
  repeatIds: new Set(), // those calls and the ones they repeat, for the repeat: filter
  session: null, // { name } while a loaded session is on screen
  menuRow: null, // the call whose right-click menu is open
  shownCount: 0, // how many calls the filters show now, for the parts that draw beside the list
  seq: 0, // ids of calls
  reqSeq: 0, // ids of network requests
  envelopes: {}, // the latest request of each endpoint kind per origin, what a test call is built from (core call-wire)
  pendingTests: [], // test calls sent and not yet answered (core test-calls resolveTest)
  testSeq: 0 // ids of sends
};

/* The elements the tab reaches for again and again, looked up once in mount. */
const el = {};

/* -------------------------------------------------- parts of the tab */

const capture = createCapture({ state, redraw });

/* Which calls the filters show, and the repeats of the list as a whole. */
const { refreshRepeats, visitsNow, parsedQuery, filterOpts, visibleEntries } = createFiltering({ state });

/* Which switches and filters the tab owns, and how the controls mirror them. */
const settings = createActionsSettings({ state, el, redraw });

/* Drops every filter, including the ones Advanced hides, so a call is never
 * kept out of sight by something the user cannot see. This is a rescue for
 * this session: the settings are left alone, so the list of settings that
 * differ in Settings still names them and Restore default settings puts them
 * back. */
function resetFilters() {
  state.showAll = Features.has('calls.analysis');
  state.errorsOnly = false;
  state.slowMs = 0;
  state.filter = '';
  settings.syncFilterControls();
  el.filter.value = '';
}

function showAll() {
  resetFilters();
  redraw();
}

/* The line above the list for a call the panel sent that a filter keeps out
 * of the list: the detail shows the call, so the list says why it has no row.
 * Only while that call is the open one; null when nothing hides it. */
function hiddenNotice() {
  if (state.hiddenSent === null || state.hiddenSent !== state.selectedId) return null;
  const entry = state.entries.find((candidate) => candidate.id === state.hiddenSent);
  const by = entry ? hiddenBy(entry, filterOpts()) : '';
  if (!by) { state.hiddenSent = null; return null; }
  return { text: hiddenWords(by), onShowAll: showAll };
}

/* Choosing a call: opening it, a chain's hops, the baseline, the row menu. The
 * detail pane is created below and needs some of these, so it is asked for late. */
const {
  selected, selectEntry, selectChain, toggleChain, revealCall, showCall, onRowClick, pickBaseline, clearBaseline,
  compareWith, openRowMenu, compareWithPrevious, compareWithLastSuccess, onShiftD
} = createChoose({
  state, el, redraw, detail: () => detail, parsedQuery,
  markCall: (entry, shift) => selectionBar.markCall(entry, shift),
  testPane: () => testPane, rawPane: () => rawPane
});

const detail = createDetailPane({ state, el, selected, actions: { compareWith, showCall, selectChain, clearBaseline }, testPane: { openRerun: (entry) => testPane.openRerun(entry), render: (pane) => testPane.render(pane), key: () => testPane.key() },
  rawPane: { showing: (entry) => rawPane.showing(entry), render: (pane, entry) => rawPane.render(pane, entry), key: (entry) => rawPane.key(entry) } });

/* The Raw view of a call (Show raw in the row menu) takes the detail pane too. */
const rawPane = createRawPane({ state, el, paint: () => detail.renderDetail() });

/* The Test call form takes the detail pane's place; the list stays. */
const testPane = createTestPane({
  state, el, paint: () => detail.renderDetail(), showCall, recordSent: (sent) => capture.recordSent(sent),
  filterOpts, showAll, redraw: () => redraw(state.active),
  // New test call… is the button that opened the form while a new one is open.
  onToggle: (open, isNew) => { if (open) state.rawFor = null; if (isNew) el.newCall.setAttribute('aria-expanded', String(open)); }
});

const selectionBar = createSelectionBar({
  state, el, showCall, visibleEntries, paintMarks: () => callList.paintMarks()
});

const callList = createCallList({
  state, el, showAll,
  onRowClick,
  onMark: selectionBar.markCall,
  onMarkAll: selectionBar.markAllVisible,
  onMarkKey: (id) => selectionBar.markCall({ id }, false),
  onBaselineKey: pickBaseline,
  onContext: openRowMenu,
  onChainClick: selectChain,
  onChainToggle: toggleChain,
  onMarkChain: selectionBar.markChain,
  isOpen: (group) => state.expandedChains.has(group.id),
  hiddenNotice,
  onTagSelect: (id) => showCall(id),
  afterDraw: () => { testPane.settle(); detail.refreshDetail(); },
  context: () => ({
    visits: visitsNow(), masked: Mask.on(),
    mask: Mask.on() ? Mask.apply : undefined, parsed: parsedQuery(), repeats: state.repeats
  })
});

/* ------------------------------------------------------------- drawing */

/* "Stopped early" is a verdict of the clock: a chain whose last answer says it
 * goes on turns into one 30 s after, with nothing arriving to trigger a redraw.
 * So a redraw is booked for that moment. */
let stopTimer = null;
function cancelStops() {
  clearTimeout(stopTimer);
  stopTimer = null;
}
function watchStops() {
  cancelStops();
  // A hidden tab books nothing: showing it draws again, and books the next check then.
  if (state.session || !state.active) return;
  const wait = nextStopCheck(state.chains, state.entries, Date.now());
  if (wait !== null) stopTimer = setTimeout(() => { stopTimer = null; redraw(state.active); }, wait);
}

/* One redraw: the filters are applied once and the list, the status bar and
 * the badge all read that result. drawList false is for a hidden tab, where
 * only the badge needs to follow. */
function redraw(drawList = true) {
  /* Chains are looked for in every call, not only the ones the filters show,
   * so a filter never splits one. The clock tells a chain that stopped from one
   * still going; a file has no "now" (its calls are old), so it is judged by
   * its own last call. */
  state.chains = groupChains(state.entries, state.session ? {} : { now: Date.now() });
  /* A chain is named after its first hop, so when that hop goes (the cap) the
   * chain's id goes with it: a selection that points at it points at nothing. */
  if (isChainId(state.selectedId) && !state.chains.some((group) => group.id === state.selectedId)) state.selectedId = null;
  watchStops();
  refreshRepeats();
  const rows = visibleEntries();
  state.shownCount = rows.length;
  updateBadge(rows);
  if (drawList) callList.render(rows, chainRows(rows, state.chains, state.expandedChains));
  selectionBar.render();
  renderStatus(rows);
}

/* The tab badge: the failed calls (red) or else the calls in view (grey). It
 * counts every call the All Apex calls box lets through, not only the ones the other
 * filters show, so a failure is seen from the other tabs even while a filter
 * keeps it off the list. */
function updateBadge(rows) {
  const inScope = !state.showAll ? state.entries.filter((entry) => entry.omni) : state.entries;
  const badge = badgeSummary(rows, state.repeats, inScope);
  el.badge.textContent = badge.text;
  el.badge.hidden = badge.hidden;
  el.badge.classList.toggle('is-bad', badge.failed > 0);
  el.badge.title = badge.title;
  // The glyph and number, read as one name; the plain count needs none.
  if (badge.label) {
    el.badge.setAttribute('role', 'img');
    el.badge.setAttribute('aria-label', badge.label);
  } else {
    el.badge.removeAttribute('role');
    el.badge.removeAttribute('aria-label');
  }
}

function renderStatus(rows) {
  if (!state.active) return;
  const { left, right } = actionsStatus({
    shown: rows.length,
    total: state.entries.length,
    chains: state.chains.length,
    failed: rows.filter(failed).length,
    session: !!state.session,
    recording: state.recording,
    dropped: state.dropped,
    droppedOmni: state.droppedOmni,
    maxEntries: MAX_ENTRIES,
    filters: { ...filterOpts(), clearOnReload: state.clearOnReload }
  });
  // A file: nothing is captured, so the status says so and names the file.
  StatusLine.set(state.session ? `${sessionText(state.session.name)} · ${left}` : left, right);
}

/* ----------------------------------------------------------- wiring */

/* The ticked calls when there are any, otherwise the visible ones. */
function exportCalls() {
  const chosen = selectionBar.markedEntries();
  const calls = chosen.length ? chosen : visibleEntries();
  if (!calls.length) { toast('Nothing to export'); return; }
  const payload = withChainIds(exportEntries(calls, Mask.apply), calls, state.chains);
  downloadText(`calls-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(payload, null, 2));
}

/* A state toggle: "Recording" with the red dot while the panel captures calls
 * (pressed), "Paused" with the pause icon while it does not. Its name for a
 * screen reader does not change ("Recording", set in panel.html); the state is
 * aria-pressed, as for any toggle button, and the tooltip says what a click
 * does. */
function paintRecord() {
  const on = state.recording;
  setLabel(el.record, on ? 'Recording' : 'Paused');
  const current = el.record.querySelector(':scope > .ui-icon');
  const wanted = on ? 'dot' : 'pause';
  if (current && !current.classList.contains(`ic-${wanted}`)) current.replaceWith(icon(wanted));
  el.record.setAttribute('aria-pressed', String(on));
  el.record.classList.toggle('is-recording', on);
  // A loaded session cannot record: the button is out of use, and says why.
  el.record.disabled = !!state.session;
  // Send follows Recording: a call sent while paused would have its answer thrown away.
  testPane.refresh();
  el.record.title = state.session
    ? 'Paused while a bundle is open: the calls on screen are from a file, and the page\'s own calls are not captured.'
    : on
      ? 'Capturing calls. Click to pause.'
      : 'Not capturing. Click to resume.';
}

/* New test call… is there where its gate is open; with Allow test calls off, or in a loaded
 * session, it cannot be used and says why. */
function paintNewCall() {
  if (!el.newCall) return; // Free has no test calls
  const point = newCallButton({ allowed: Settings.get('allowTestCalls') === true, session: !!state.session },
    'Compose a call and send it to the org of the page, as your user.');
  el.newCall.hidden = !point.visible;
  el.newCall.disabled = point.disabled;
  el.newCall.title = point.title;
}

/* Clear empties the captured calls, not a file, so it is out of use for a session. */
function paintClear() {
  el.clear.disabled = !!state.session;
  el.clear.title = state.session
    ? 'An open bundle cannot be cleared here; go back to live to see the page\'s own calls again.'
    : 'Remove every captured call from the list';
}

function clearCalls() {
  state.entries = [];
  state.selectedId = null;
  state.compareId = null;
  state.compareHow = 'picked';
  state.dropped = false;
  state.droppedOmni = false;
  state.openErrors.clear();
  state.debugOpen.clear();
  state.marked.clear();
  state.markAnchor = null;
  state.expandedChains.clear();
  state.testDrafts.clear();
  state.hiddenSent = null;
}

function lookUpElements() {
  el.list = document.getElementById('log-list');
  el.notes = document.getElementById('log-notes');
  el.detail = document.getElementById('log-detail');
  el.badge = document.getElementById('actions-count');
  el.selection = document.getElementById('log-selection');
  el.selectionText = document.getElementById('log-selection-text');
  el.selectionChart = document.getElementById('log-selection-chart');
  el.selectionBar = document.getElementById('log-selection-bar');
  el.selectionLegend = document.getElementById('log-selection-legend');
  el.record = document.getElementById('log-record');
  el.clear = document.getElementById('log-clear');
  el.filter = document.getElementById('log-filter');
  el.errorsOnly = document.getElementById('log-errors-only');
  el.showAll = document.getElementById('log-show-all');
  el.newCall = document.getElementById('log-new-call');
  el.export = document.getElementById('log-export');
}

/* The filter box names slow: among its prefixes; without Slow calls it does not. */
function trimFilterWords() {
  el.filter.placeholder = el.filter.placeholder.replace(' or slow:', '');
  el.filter.title = el.filter.title.replace(' slow:800 calls that took at least 800 ms (slow: alone uses the threshold from Settings);', '');
}

function mount() {
  lookUpElements();
  callList.mount();

  el.record.addEventListener('click', () => {
    if (state.session) return;
    state.recording = !state.recording;
    paintRecord();
    // The empty state says whether capture is paused.
    if (!state.entries.length) redraw(state.active);
    else renderStatus(visibleEntries());
  });

  el.clear.addEventListener('click', () => {
    if (state.session) return;
    clearCalls();
    redraw();
  });

  if (Features.has('calls.select')) {
    document.getElementById('log-selection-clear').addEventListener('click', selectionBar.clearMarks);
    document.getElementById('log-selection-copy').addEventListener('click', (ev) => {
      copyWithButton(selectionBar.text(), ev.currentTarget);
    });
  }
  if (!Features.has('calls.analysis')) trimFilterWords();

  paintRecord();
  paintNewCall();
  if (el.newCall) {
    el.newCall.addEventListener('click', (ev) => {
      const box = el.newCall.getBoundingClientRect();
      const kinds = [['IP', 'Integration Procedure'], ['DR', 'Data Mapper']];
      openContextMenu({ clientX: box.left, clientY: box.bottom, type: ev.type, detail: ev.detail },
        kinds.map(([kind, name]) => ({ label: name, title: `Compose a call to a ${name}`, action: () => testPane.openNew(kind) })));
    });
  }
  settings.restore();
  settings.install();

  /* The same setting as in Settings; the tab's box is a second handle on it. */
  if (el.showAll) {
    el.showAll.addEventListener('change', (ev) => {
      state.showAll = ev.currentTarget.checked;
      Settings.set('logShowAll', state.showAll);
      redraw();
    });
  }
  el.errorsOnly.addEventListener('change', (ev) => {
    state.errorsOnly = ev.currentTarget.checked;
    Settings.set('logErrorsOnly', state.errorsOnly);
    redraw();
  });
  Shared.setCalls(() => state.entries);
  Shared.setOnlyOmni(() => !state.showAll);
  Shared.setDump('actions', (mask) => actionsDump({ ...state, onlyOmni: !state.showAll }, mask, Mask.on()));

  /* Mask values changes what the list may show (failure text, snippets, what a
   * payload search can match). */
  let drawnMask = Mask.on();
  let drawnAllow = Settings.get('allowTestCalls') === true;
  Settings.onChange(() => {
    /* Allow test calls decides which entry points exist: they are drawn, or
     * taken away, as it changes; an open form closes when it goes off. */
    const allow = Settings.get('allowTestCalls') === true;
    if (allow !== drawnAllow) {
      drawnAllow = allow;
      paintNewCall();
      if (!allow) { if (testPane.isOpen()) testPane.close(); testPane.forgetDrafts(); }
      detail.refreshDetail();
    }
    if (Mask.on() === drawnMask) return;
    drawnMask = Mask.on();
    redraw(state.active);
  });

  Nav.on('actions', ({ id }) => {
    const entry = state.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (!visibleEntries().includes(entry)) {
      resetFilters();
      redraw();
    }
    revealCall(entry);
    selectEntry(entry);
    const row = el.list.querySelector('.log-row.is-selected');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
  });

  const applyFilter = debounce((value) => {
    state.filter = value;
    redraw();
  }, 120);
  el.filter.addEventListener('input', (ev) => applyFilter(ev.currentTarget.value));

  el.export.addEventListener('click', exportCalls);

  document.addEventListener('keydown', onShiftD);

  Page.onRequestFinished(capture.onRequestFinished);

  Page.onNavigated(() => {
    if (!state.clearOnReload) return;
    // The file stays; the live list behind it starts over, as it would have.
    if (state.session) { sessionView.restartAside(); return; }
    clearCalls();
    redraw(state.active);
  });

  /* The step each call was made on is read from the script the top bar has
   * selected, so another script (or a file) changes what the list says about
   * them. A script change that is not a new selection leaves them as they are. */
  Targets.subscribe((reason) => {
    if (reason === 'selection') redraw(state.active);
  });

  Session.onChange(sessionView.onSession);
  paintClear();
  if (Session.active()) sessionView.onSession(Session.bundle());
  else redraw();
}

/* ------------------------------------------------------- loaded session */

/* Everything that shows the list swapped for a file's calls, or back. */
const sessionView = createSessionView({
  state,
  repaint: () => {
    paintRecord();
    paintClear();
    paintNewCall();
    selectionBar.reset(); // other calls are ticked now
    detail.forget();
    redraw(state.active);
    detail.renderDetail();
  }
});

/* The detail tabs by their ids, as the tab strip labels them: the toast says the label. */
const TAB_WORDS = { input: 'input', output: 'output', options: 'options', debug: 'debug', compare: 'compare', changes: 'changes', hops: 'calls' };

function copySelected() {
  const entry = selected();
  if (!entry) { toast('Select a call first'); return; }
  const text = detail.copyTextFor(entry);
  if (!text) { toast('Nothing to copy'); return; }
  copyWithToast(text, `Copied ${TAB_WORDS[state.detailTab] || state.detailTab}`);
}

export const RemoteActions = {
  mount,
  compareWithPrevious,
  compareWithLastSuccess,
  copySelected,
  focusFilter: () => el.filter.focus(),
  /* The shell writes the generated tooltips after this tab is mounted, so the
   * ones that follow the state (Recording, Clear list, New test call…) are
   * written again when the tab is shown. */
  show: () => { state.active = true; paintRecord(); paintClear(); paintNewCall(); redraw(); },
  hide: () => { state.active = false; cancelStops(); }
};
