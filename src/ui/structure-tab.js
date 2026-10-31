'use strict';

/* Structure tab: the OmniScript's elements, read from its definition and joined
 * against the live data. The frame and the OmniScript itself are chosen in the
 * shared top bar (targets.js), so this file only asks for two payloads. */

import { resolveElementValue, executionStatus } from '../core/shared/structure-model.js';
import { applyAutoCollapse } from '../core/structure/auto-collapse.js';
import { filterElements, withContext } from '../core/structure/element-filter.js';
import { scriptIdentity, keepsSelection } from '../core/shared/script-identity.js';
import { recordStep, closedVisits } from '../core/structure/step-timeline.js';
import { sessionVisits, savedAt } from '../core/shared/session-bundle.js';
import { createLintCache, countProblems } from '../core/structure/lint.js';
import { currentElement as currentElementIn } from '../core/structure/step-follow.js';
import { stepNavigation } from '../core/structure/step-nav.js';
import { statusLeft, statusTitle, stepPosition } from '../core/structure/status-text.js';
import { followNote } from '../core/structure/toolbar-menus.js';
import { Targets } from './targets.js';
import { Nav } from './nav.js';
import { Shared } from './shared.js';
import { Session } from './session.js';
import { PayloadHistory } from './payload-history.js';
import { stepStamp } from '../core/shared/step-stamp.js';
import { createStepTracker } from './structure/step-tracker.js';
import { createSelecting } from './structure/select.js';
import { createCompareControls } from './structure/compare-controls.js';
import { createLoader } from './structure/load.js';
import { createValues } from './structure/values.js';
import { createSetErrorsWatch } from './structure/set-errors-watch.js';
import { createStructureSettings } from './structure/settings.js';
import { createStructureDump } from './structure/dump.js';
import { createElementList } from './structure/element-list.js';
import { createRowMenu } from './structure/row-menu.js';
import { createDetailPane } from './structure/detail-pane.js';
import { createToolbarMenus } from './structure/toolbar-menus.js';
import { setEmptyState } from './structure/empty-state.js';
import { rowVerdicts } from '../core/structure/row-verdict.js';
import {
  isHidden as isHiddenIn, isCertainlyHidden as isCertainlyHiddenIn, updateVisibility as updateVisibilityIn, elementsByKey as elementsByKeyIn,
  explain as explainIn, whyKey as whyKeyIn
} from './structure/visibility-state.js';
import { copyWithToast } from './clipboard.js';
import { toast } from './toast.js';
import { StatusLine } from './status-line.js';
import { debounce } from './util.js';
import { Mask } from './mask-setting.js';
import { Settings } from './settings.js';
import { Features } from './features.js';

const state = {
  progress: {},
  visibility: {}, // computeVisibility: which elements are hidden right now, and why
  visibleOnly: false,
  detailWhy: '', // whyKey of the selected element as last drawn
  detailStoppers: '', // stoppersKey of the selected step as last drawn
  whatIf: new Map(), // rule field -> a value typed in the rule table to try (never written to the page)
  whatIfBases: new Map(), // rule field -> fingerprint of what the data held when it was typed
  showTimeline: false, // the Timeline button is on: the pane shows it whatever is selected
  detailHint: '', // the value type hint of the selected element as last drawn
  detailValue: '', // what the Current value tab showed as last drawn (its value, labels, mask)
  detailTabs: '', // the ids and labels of the tab strip as last drawn
  detailNav: '', // the label of the step button in the head as last drawn
  menuKey: null, // the element whose right-click menu is open
  navNote: '', // what the row menu's Go to this step answered, for the status bar
  detailTimeline: '', // signature of the Timeline as last drawn ('' when it is not on show)
  autoCollapse: false, // fold steps the script has passed
  autoFolded: new Set(), // step keys folded automatically, once each
  handFolded: new Set(), // sections the user folded or unfolded: auto-collapse never touches them
  hover: false, // outline the hovered element on the page
  follow: true, // keep the current step selected as the script moves on
  pendingReveal: null, // key list from the Data tab, applied once elements are loaded
  activeIndex: null, // definition.asIndex: the runtime's active step
  active: false,
  visible: true,
  defProp: 'jsonDef',
  dataProp: 'jsonDataStr',
  elements: [],
  data: undefined,
  dataRaw: null,
  dataParseError: false, // the last data read was not valid JSON; the old data is kept
  header: null, // scriptHeaderDef: allCustomLabels + labelMap
  defRaw: null, // the definition text the elements were built from
  defSignature: '', // structureSignature of those elements
  problems: [], // lintDefinition of those elements, recomputed only when the definition changes
  notesOpen: false, // the Problems list shows its notes group open
  showProblems: false, // the detail pane lists the problems instead of the selected element
  compare: null, // a loaded comparison ({ fileName, from, result } or { fileName, error }) shown instead of the element
  rowsChosen: {}, // repeat block key -> the row the detail pane reads (from 1)
  detailValidation: '', // live validation text as last drawn
  visits: [], // step-timeline visits: when the script was on which step
  error: null,
  filter: '',
  actionsOnly: false,
  selectedKey: null,
  followedKey: null, // the step Follow last selected; a different selection is the user's own
  detailTab: 'value',
  valueView: 'form', // Current value of a step or block: form, tree or raw (core/structure/form-rows.js); kept for the life of the tab, not stored
  formOpen: new Set(), // groups opened in the form: element key + id of the row
  pickedTab: null, // the tab picked by hand (kept while an element lacks it); otherwise each element opens on its own default (core/structure/detail-tabs.js)
  formulaOpen: new Set(), // message formulas the user opened under their evaluated text
  showInternal: false, // the Properties tab lists the runtime's own keys too
  propOpen: new Set(), // property keys whose object or array is open
  propMore: new Set(), // property keys whose long text is shown whole
  propDocOpen: new Set(), // property keys whose explanation is open under the row
  root: {}, // rootOf(definition): the script's own fields, for the summary
  deselected: false, // Esc cleared the selection: Follow current step leaves it so
  detailSummary: '', // the summary as last drawn ('' when it is not on show)
  propTrees: {}, // property key -> the open/closed state of its JSON tree
  detailFilter: '',
  formNote: '', // "N of M rows" while the form is filtered, for the status bar
  filterOpen: {}, // while the detail filter is on: tab -> Map(path -> open), the user's own toggles
  collapsed: new Set(), // element keys whose section is folded; empty ⇒ all open
  expanded: {
    definition: new Set(['']), value: new Set(['']),
    conditions: new Set(['']), validation: new Set([''])
  },
  expandedText: {
    definition: new Set(), value: new Set(),
    conditions: new Set(), validation: new Set()
  }
};

/* Lint reads the whole definition and the data's keys: run it again only when
 * either changed. */
const lintOnChange = createLintCache();

const el = {};
let toolbarMenus = { updateView() {}, updateMore() {} }; // set in mount, once the settings exist

/* -------------------------------------------------------- retrieval */

/* Which element is selected, and how a pick is made (structure/select.js). The
 * readers further down are asked for late. */
const {
  selected, selectFromList, deselect, selectElement, jumpToKey, goToCurrentStep, followStep, applyPendingReveal
} = createSelecting({
  state, el, render, visible, elementsByKey: () => elementsByKey(), currentElement: () => currentElement(),
  viewChanged: () => toolbarMenus.updateView()
});

/* Reading the definition and the data from the page (structure/load.js). */
const loader = createLoader({ state, render, applyPendingReveal, followStep });
const { load } = loader;

/* Set Errors that start to fire while another tab is on screen. */
const setErrors = createSetErrorsWatch({ state, currentElement: () => currentElement() });

/* ---------------------------------------------------- live values */

/* Runs while the panel is on screen, on any tab: see step-tracker.js. The
 * Structure tab's own redraws are skipped while another tab is shown. */
const tracker = createStepTracker({
  state,
  applyData,
  moved: (index) => {
    state.activeIndex = index;
    const changed = updateProgress();
    if (state.active) {
      if (changed) renderList();
      renderStatus();
      if (!selected() && needsRedraw()) renderDetail(); // the summary says which step it is on
    }
    if (state.follow) followStep();
  },
  stamp: () => stepStamp(stepInfo()),
  tick: (done, read) => {
    trackStep();
    setErrors.watch(read);
    if (!state.active) { done(); return; }
    refreshTiming();
    loader.afterPulse(done);
  }
});

/* Values change constantly as the script is filled in, so refresh the hints, the
 * badge and the Next column in place rather than rebuilding the list, which would
 * lose scroll position and fight with anyone reading it. */
function applyData(raw) {
  state.dataRaw = raw;
  try {
    state.data = raw ? JSON.parse(raw) : undefined;
  } catch {
    /* Keep the last good data, but say the new text was not used. */
    state.dataParseError = true;
    renderStatus();
    return;
  }
  state.dataParseError = false;

  /* Visibility first: progress reads it to tell a Set Values that ran from one skipped. */
  const hiddenChanged = updateVisibility();
  const progressChanged = updateProgress();
  if (progressChanged || hiddenChanged) renderList();

  refreshHints();

  /* The detail pane is only rebuilt when it would read differently: doing it
   * on every data change would drop the focus and scroll of its filter box. */
  const problemsBefore = state.problems;
  refreshProblems();
  if (state.problems !== problemsBefore) updateProblemsChip();
  if (needsRedraw() || (state.showProblems && state.problems !== problemsBefore)) renderDetail();
  refreshBadge();
  refreshVerdicts();
  renderStatus();
}

/* -------------------------------------------------------- rendering */

function visible() {
  return filterElements(state.elements, {
    query: state.filter, actionsOnly: state.actionsOnly, visibleOnly: state.visibleOnly, isHidden
  });
}

/* With Collapse done steps on, fold what the script has passed. */
function autoCollapseNow() {
  if (!state.autoCollapse) return false;
  return applyAutoCollapse(state.elements, state.progress, state);
}

const isHidden = (element) => isHiddenIn(state, element);
const isCertainlyHidden = (element) => isCertainlyHiddenIn(state, element);
const updateVisibility = () => updateVisibilityIn(state);
const elementsByKey = () => elementsByKeyIn(state);
const explain = (element) => explainIn(state, element);
const whyKey = (element) => whyKeyIn(state, element);

function updateProgress() {
  const next = executionStatus(state.elements, state.data, state.activeIndex, state.visibility);
  const changed = JSON.stringify(next) !== JSON.stringify(state.progress);
  state.progress = next;
  trackStep();
  return autoCollapseNow() || changed;
}

/* Notes when the script moves to another step. Seen only while this tab polls,
 * so a move made while another tab was open is dated from the next look. */
function trackStep() {
  if (Session.active()) return; // a loaded file's visits are its own, and its clock stopped
  const current = currentElement();
  state.visits = recordStep(state.visits, current && { key: current.key, name: current.name }, Date.now());
}

/* The step visits for what is loaded: a loaded file's own, frozen at the time it
 * was saved (never the live script's), else none until the script is watched. */
function visitsForSession() {
  const bundle = Session.bundle();
  if (!bundle) return [];
  const saved = savedAt(bundle);
  return closedVisits(sessionVisits(bundle), saved ? saved.getTime() : NaN);
}

/* The problems of the definition, judged against the data read last. */
function refreshProblems() {
  if (!Features.has('structure.problems')) return; // Free: nothing is linted, the list stays empty
  state.problems = state.elements.length ? lintOnChange(state.elements, state.header, state.data) : [];
}

/* Follow current step stops following once an element is picked by hand, or Esc has
 * cleared the selection, until Current step is pressed or the box is ticked again.
 * Its label never changes (a longer one reflowed the toolbar while the user
 * clicked): a fixed-width dot beside it shows the pause, the tooltip says what
 * it means, and a status line (read out by assistive technology) announces it. */
function updateFollowPaused() {
  const note = document.getElementById('struct-follow-paused');
  if (!note) return;
  const paused = state.follow && (state.deselected || (state.selectedKey !== null && state.followedKey !== state.selectedKey));
  const text = followNote(paused);
  if (note.textContent !== text) note.textContent = text;
  const label = document.getElementById('struct-follow').closest('label');
  label.classList.toggle('is-paused', paused);
  label.title = paused ? `${FOLLOW_TITLE} ${FOLLOW_PAUSED_TITLE}` : FOLLOW_TITLE;
}

const FOLLOW_TITLE = 'Keep the step the script is on selected as it moves on.';
const FOLLOW_PAUSED_TITLE = 'Paused while you browse. Press Current step to follow the script again.';

function mountFollowPaused() {
  const label = document.getElementById('struct-follow').closest('label');
  /* The dot always takes its room (hidden by colour, not removed), so the label never moves. */
  const dot = document.createElement('span');
  dot.className = 'follow-dot';
  dot.setAttribute('aria-hidden', 'true');
  label.appendChild(dot);
  const note = document.createElement('span');
  note.id = 'struct-follow-paused';
  note.className = 'sr-only';
  note.setAttribute('role', 'status');
  label.after(note); // beside the label, not in it: the checkbox's name stays fixed
}

function render() {
  setEmptyState(!Targets.selected());
  updateFollowPaused();
  toolbarMenus.updateView();
  toolbarMenus.updateMore();
  updateVisibility();
  updateProgress();
  refreshProblems();
  updateProblemsChip();
  renderList();
  renderDetail();
  renderStatus();
}

/* The Problems chip: in the toolbar only while there is something to show. */
function updateProblemsChip() {
  const chip = document.getElementById('struct-problems');
  if (!chip) return;
  const count = countProblems(state.problems);
  if (!count) state.showProblems = false;
  chip.hidden = count === 0;
  const text = `Problems (${count})`;
  if (chip.textContent !== text) chip.textContent = text;
  chip.setAttribute('aria-pressed', String(state.showProblems));
}

function closeProblems() {
  state.showProblems = false;
  updateProblemsChip();
  renderDetail();
}

function openProblems() {
  state.showProblems = true;
  state.compare = null;
  updateProblemsChip();
  renderDetail();
}

/* What is worked out from the definition and the data, kept while neither changes. */
const { refs, rows, estimator, language, hintOf, stoppersOf } = createValues({ state, elementsByKey });

/* The Next column: a verdict per row, from the same step findings as the red number. */
const verdicts = () => rowVerdicts({
  elements: state.elements, data: state.data, visibility: state.visibility, progress: state.progress,
  stoppers: stoppersOf, language: language()
});

const { renderList, refreshBadge, refreshHints, refreshVerdicts } = createElementList({
  state, el, visible, isHidden, isCertainlyHidden, explain, byKey: elementsByKey, hintOf,
  stopCount: (step) => (Features.has('structure.steps') ? stoppersOf(step).count : 0), verdicts, select: selectFromList, deselect, clearFilters,
  rowMenu: (ev, element, row) => rowMenu.open(ev, element, row)
});

/* The right-click menu of a row (structure/row-menu.js). */
const rowMenu = createRowMenu({
  state, byKey: elementsByKey, select: selectFromList, renderList: () => renderList(),
  navigationFor: (element) => navigationFor(element),
  note: (text) => showNavNote(text)
});

/* The verdict of step-nav.js for a step, as the row menu and the head of the step read it. */
function navigationFor(element) {
  if (!Features.has('structure.steps')) return null; // Free: no Go to this step / Previous step
  const current = currentElement();
  return current ? stepNavigation({
    elements: state.elements, progress: state.progress, currentKey: current.key, targetKey: element.key
  }) : null;
}

const NAV_NOTE_MS = 12000;

/* A line the status bar adds after its own text for a few seconds: what the row
 * menu's step navigation answered. */
let navNoteTimer = null;
function showNavNote(text) {
  state.navNote = text;
  renderStatus();
  clearTimeout(navNoteTimer);
  navNoteTimer = setTimeout(() => { state.navNote = ''; renderStatus(); }, NAV_NOTE_MS);
}

/* The filter box, Actions only and Visible only back to their defaults. */
function clearFilters() {
  state.filter = '';
  state.actionsOnly = false;
  state.visibleOnly = false;
  document.getElementById('struct-filter').value = '';
  Settings.set('structVisibleOnly', false);
  render();
}

/* Stepping through the rows of a repeat block. */
function setRow(blockKey, row) {
  state.rowsChosen = { ...state.rowsChosen, [blockKey]: row };
  renderDetail();
  refreshBadge();
}

/* Is the element out of the list because of the filters? A step kept as
 * context for its matches is still there. */
function filteredOut(element) {
  return !withContext(state.elements, visible()).rows.some((row) => row.key === element.key);
}

const { renderDetail, refreshTiming, needsRedraw } = createDetailPane({
  state, el, selected, explain, whyKey, stoppersOf, filteredOut, jump: jumpToKey,
  current: () => currentElement(), openProblems: () => openProblems(),
  refs, rows, byKey: elementsByKey, setRow, closeProblems, estimator, language, hintOf,
  navigationFor: (element) => navigationFor(element), goBack: (element) => rowMenu.goBack(element),
  findCompared: (element) => compareControls.findCompared(element),
  selectCompared: (target) => compareControls.selectCompared(target),
  closeCompare: () => compareControls.closeCompare(),
  status: () => renderStatus()
});

/* The comparison with an earlier definition, and the step timeline. */
const compareControls = createCompareControls({
  state, el, renderDetail: () => renderDetail(), updateProblemsChip, selectElement
});

function renderStatus() {
  if (!state.active) return;
  const total = state.elements.length;
  /* Only what the rules hide for certain: a rule that cannot be judged leaves the
   * definition's old bShow, which is not evidence, and what sits under such an
   * element or rests on a formula's estimate is no more certain. */
  const hidden = state.elements.filter(isCertainlyHidden).length;
  const left = statusLeft({
    total, shown: visible().length, hidden, step: stepPosition(state.elements, currentElement())
  });
  const host = Targets.selected();
  const lang = state.header && state.header.bpLang ? ` · ${state.header.bpLang}` : '';
  const where = host ? `${host.label}${lang}` : '';
  const notes = [state.navNote, state.formNote].filter(Boolean);
  StatusLine.set(notes.length ? `${left} · ${notes.join(' · ')}` : left,
    state.dataParseError ? `${where}${where ? ' · ' : ''}could not parse data` : where);
  StatusLine.title(total ? statusTitle({ defProp: state.defProp, activeIndex: state.activeIndex, hidden }) : '');
}

/* ----------------------------------------------------------- wiring */

const currentElement = () => currentElementIn(state.elements, state.progress);

/* The step the script is on, as the other tabs read it (without the copied visits). */
function stepInfo() {
  const current = currentElement();
  return {
    key: current ? current.key : null,
    name: current ? current.name : '',
    asIndex: state.activeIndex,
    visits: state.visits
  };
}

function mount() {
  el.list = document.getElementById('struct-list');
  el.detail = document.getElementById('struct-detail');

  document.getElementById('struct-current').addEventListener('click', goToCurrentStep);
  compareControls.mountCompare();
  if (Features.has('structure.problems')) {
    document.getElementById('struct-problems').addEventListener('click', () => {
      if (state.showProblems) closeProblems(); else openProblems();
    });
  }
  const settings = createStructureSettings({
    state, render, renderList, followStep, updateFollowPaused, autoCollapseNow,
    viewChanged: () => toolbarMenus.updateView()
  });
  toolbarMenus = createToolbarMenus({ state, settings, compare: compareControls, render });
  mountFollowPaused();
  toolbarMenus.mount();
  settings.init();

  document.getElementById('struct-follow').addEventListener('change', (ev) => {
    settings.setFollow(ev.currentTarget.checked);
    Settings.set('structFollow', state.follow);
  });

  settings.install();

  Shared.setLoader(loader.whenLoaded);
  Shared.setDump('structure', createStructureDump({
    state, currentElement, rows, explain, isHidden, stoppersOf
  }));
  Shared.setStep(() => ({ ...stepInfo(), visits: state.visits.map((visit) => ({ ...visit })) }));

  Nav.on('structure', (request) => {
    if (request.elementKey) {
      const target = state.elements.find((element) => element.key === request.elementKey);
      if (target) selectElement(target, { clearFilters: true });
      return;
    }
    state.pendingReveal = request.segments;
    applyPendingReveal();
  });


  document.getElementById('struct-refresh').addEventListener('click', () => {
    Targets.refresh(() => load());
  });

  document.getElementById('struct-collapse').addEventListener('click', () => {
    state.collapsed = new Set();
    state.elements.forEach((element) => { if (element.hasChildren) state.collapsed.add(element.key); });
    renderList();
  });

  document.getElementById('struct-expand').addEventListener('click', () => {
    state.collapsed = new Set();
    renderList();
  });

  /* A new filter shows a new set of rows: it starts at the top, where the first
   * match is. (A poll or a fold redraws the same rows and keeps the place.) */
  const applyFilter = debounce((value) => {
    state.filter = value;
    render();
    document.getElementById('struct-list').scrollTop = 0;
  }, 120);
  document.getElementById('struct-filter').addEventListener('input', (ev) => applyFilter(ev.currentTarget.value));

  /* The shared top bar decides which OmniScript this is; reload whenever it
   * changes rather than keeping a frame or element list of our own. */
  Targets.subscribe((reason) => {
    if (reason === 'list') return; // same script, just a different list around it
    /* A host appearing or vanishing (a child element rendered on the next
     * step) says nothing about the selected script: keep what the user picked
     * and folded, and only read again. */
    if (!keepsSelection(reason, loader.loadedScript(), scriptIdentity(Targets.selected()))) {
      state.selectedKey = null;
      state.deselected = false;
      state.collapsed = new Set();
      state.header = null;
      state.autoFolded = new Set();
      state.handFolded = new Set();
      state.visits = visitsForSession();
      state.data = undefined;
      state.dataRaw = null;
      state.rowsChosen = {};
      state.showProblems = false;
      state.compare = null;
      setErrors.reset();
      PayloadHistory.clear(); // nothing to compare across two scripts
    }
    if (state.active || state.visible) load();
  });

  /* A file loaded, or closed: its step visits replace the live ones, or go. The
   * top bar's own change may reset them too (another script), to the same answer. */
  Session.onChange(() => {
    state.visits = visitsForSession();
    if (state.active) renderDetail();
  });

  tracker.start();
}

function copySelected() {
  const element = selected();
  const value = element ? resolveElementValue(element, state.data, rows()) : undefined;
  if (value === undefined) { toast(element ? 'This element holds no value' : 'Select an element first'); return; }
  copyWithToast(JSON.stringify(Mask.apply(value), null, 2), 'Copied value');
}

export const Structure = {
  mount,
  copySelected,
  focusFilter: () => document.getElementById('struct-filter').focus(),
  show: () => { state.active = true; load(); tracker.start(); },
  /* The tracker keeps running: step timing must not depend on the open tab. */
  hide: () => { state.active = false; StatusLine.title(''); },
  setVisible: (visible) => {
    state.visible = visible;
    if (!visible) { tracker.stop(); return; }
    if (state.active) load();
    tracker.now(); // date a move made meanwhile as soon as the panel is seen again
  }
};
