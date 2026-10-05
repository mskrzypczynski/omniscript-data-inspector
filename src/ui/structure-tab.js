'use strict';

/* Structure tab: the OmniScript's elements, read from its definition and joined
 * against the live data. The frame and the OmniScript itself are chosen in the
 * shared scope bar (targets.js), so this file only asks for two payloads. */

import { flatten, parseObj, resolveElementValue, displayValue, executionStatus } from '../core/structure-model.js';
import { applyAutoCollapse } from '../core/auto-collapse.js';
import { ownerOfSegments } from '../core/path-links.js';
import { HIGHLIGHT_MS } from '../core/payload-state.js';
import { Targets } from './targets.js';
import { attachPropPicker } from './prop-picker.js';
import { Nav } from './nav.js';
import { Advanced } from './advanced.js';
import { Shared } from './shared.js';
import { createElementList } from './structure/element-list.js';
import { createDetailPane } from './structure/detail-pane.js';
import {
  isHidden as isHiddenIn, updateVisibility as updateVisibilityIn, elementsByKey as elementsByKeyIn,
  explain as explainIn, whyKey as whyKeyIn
} from './structure/visibility-state.js';
import { copyWithToast } from './clipboard.js';
import { toast } from './toast.js';
import { Mask } from './mask-setting.js';

const state = {
  progress: {},
  visibility: {}, // computeVisibility: which elements are hidden right now, and why
  visibleOnly: false,
  detailWhy: '', // whyKey of the selected element as last drawn
  autoCollapse: false, // fold steps the script has passed
  autoFolded: new Set(), // step keys folded automatically, once each
  handFolded: new Set(), // sections the user folded or unfolded: auto-collapse never touches them
  hover: false, // outline the hovered element on the page
  follow: false, // keep the current step selected as the script moves on
  pendingReveal: null, // key list from the Data tab, applied once elements are loaded
  activeIndex: null, // definition.asIndex: the runtime's active step
  active: false,
  visible: true,
  defProp: 'jsonDef',
  dataProp: 'jsonDataStr',
  elements: [],
  data: undefined,
  dataRaw: null,
  header: null, // scriptHeaderDef: allCustomLabels + labelMap
  error: null,
  filter: '',
  actionsOnly: false,
  selectedKey: null,
  detailTab: 'definition',
  detailFilter: '',
  cells: {},
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

const el = {};

function resetSelectionState() {
  state.expanded = {
    definition: new Set(['']), value: new Set(['']),
    conditions: new Set(['']), validation: new Set([''])
  };
  state.expandedText = {
    definition: new Set(), value: new Set(),
    conditions: new Set(), validation: new Set()
  };
}

/* -------------------------------------------------------- retrieval */

/* Callbacks waiting for the next load to finish, however it ends. */
const afterLoad = [];

function finishLoad() {
  Shared.setElements(state.elements);
  afterLoad.splice(0).forEach((done) => done());
}

function load() {
  if (!Targets.selected()) {
    state.elements = [];
    state.error = null;
    render();
    finishLoad();
    return;
  }

  Targets.fetch(state.defProp, (definitionRaw, error) => {
    if (error) {
      state.error = error.value || error.description || error.error || 'The definition could not be read.';
      state.elements = [];
      render();
      finishLoad();
      return;
    }

    state.error = null;

    if (!definitionRaw) {
      state.elements = [];
      render();
      finishLoad();
      return;
    }

    let definition;
    try {
      definition = JSON.parse(definitionRaw);
    } catch (e) {
      state.elements = [];
      state.error = `The definition is not valid JSON: ${e.message}`;
      render();
      finishLoad();
      return;
    }

    state.activeIndex = typeof definition.asIndex === 'number' ? definition.asIndex : null;

    /* scriptHeaderDef is a sibling property: allCustomLabels resolves label
     * text, labelMap gives each element's JSONPath. Optional — the tab works
     * without it. */
    Targets.fetch('scriptHeaderDef', (headerRaw) => {
      state.header = parseObj(headerRaw);

      try {
        state.elements = flatten(definition, state.header);
      } catch (e) {
        state.elements = [];
        state.error = `Could not read the definition: ${e.message}`;
      }

      Targets.fetch(state.dataProp, (raw) => {
        state.dataRaw = raw || null;
        try {
          state.data = raw ? JSON.parse(raw) : undefined;
        } catch {
          state.data = undefined;
        }
        render();
        finishLoad();
        applyPendingReveal();
        if (state.follow && !state.selectedKey) followStep();
      });
    });
  });
}

/* ---------------------------------------------------- live values */

let pulseTimer = null;

function schedulePulse() {
  clearTimeout(pulseTimer);
  if (!state.active || !state.visible) return;
  pulseTimer = setTimeout(pulse, 2000);
}

function pulse() {
  if (!state.active || !state.visible || !Targets.selected()) { schedulePulse(); return; }
  Targets.fetch(state.dataProp, (raw) => {
    if (raw !== state.dataRaw) applyData(raw);
    Targets.peekField(state.defProp, 'asIndex', (index) => {
      /* A failed read keeps the last known position instead of wiping the
       * marks. */
      if (typeof index === 'number' && index !== state.activeIndex) {
        state.activeIndex = index;
        if (updateProgress()) renderList();
        renderStatus();
        if (state.follow) followStep();
      }
      schedulePulse();
    });
  });
}

/* Values change constantly as the script is filled in, so refresh the cells
 * in place rather than rebuilding the list, which would lose scroll position
 * and fight with anyone reading it. */
function applyData(raw) {
  state.dataRaw = raw;
  try {
    state.data = raw ? JSON.parse(raw) : undefined;
  } catch {
    return;
  }

  const progressChanged = updateProgress();
  const hiddenChanged = updateVisibility();
  if (progressChanged || hiddenChanged) renderList();

  state.elements.forEach((element) => {
    const cell = state.cells[element.key];
    if (!cell) return;
    const next = displayValue(element, resolveElementValue(element, state.data));
    if (cell.textContent === next) return;
    cell.textContent = next;
    cell.classList.remove('is-changed');
    void cell.offsetWidth; // restart the animation
    cell.classList.add('is-changed');
    clearTimeout(cell.__flash);
    cell.__flash = setTimeout(() => cell.classList.remove('is-changed'), HIGHLIGHT_MS);
  });

  /* The detail pane is only rebuilt when it would read differently: doing it
   * on every data change would drop the focus and scroll of its filter box. */
  const why = whyKey(selected());
  if (state.detailTab === 'value' || why !== state.detailWhy) renderDetail();
  renderStatus();
}

/* -------------------------------------------------------- rendering */

function visible() {
  const query = state.filter.trim().toLowerCase();
  return state.elements.filter((element) => {
    if (state.actionsOnly && !element.remote) return false;
    if (state.visibleOnly && isHidden(element)) return false;
    if (!query) return true;
    return element.searchText.includes(query);
  });
}

/* With Collapse done steps on, fold what the script has passed. */
function autoCollapseNow() {
  if (!state.autoCollapse) return false;
  return applyAutoCollapse(state.elements, state.progress, state);
}

const isHidden = (element) => isHiddenIn(state, element);
const updateVisibility = () => updateVisibilityIn(state);
const elementsByKey = () => elementsByKeyIn(state);
const explain = (element) => explainIn(state, element);
const whyKey = (element) => whyKeyIn(state, element);

function updateProgress() {
  const next = executionStatus(state.elements, state.data, state.activeIndex);
  const changed = JSON.stringify(next) !== JSON.stringify(state.progress);
  state.progress = next;
  return autoCollapseNow() || changed;
}

function render() {
  updateProgress();
  updateVisibility();
  renderList();
  renderDetail();
  renderStatus();
}

function selected() {
  return state.elements.find((element) => element.key === state.selectedKey) || null;
}

/* A click on a row of the list. */
function selectFromList(element) {
  state.selectedKey = element.key;
  resetSelectionState();
  render();
}

const { renderList } = createElementList({ state, el, visible, isHidden, explain, select: selectFromList });
const { renderDetail } = createDetailPane({ state, el, selected, explain, whyKey });

function renderStatus() {
  if (!state.active) return;
  const shown = visible().length;
  const hidden = state.elements.filter(isHidden).length;
  document.getElementById('status-left').textContent = state.elements.length
    ? `${shown} of ${state.elements.length} elements${hidden ? ` · ${hidden} hidden` : ''}`
    : 'No definition loaded';
  const host = Targets.selected();
  const lang = state.header && state.header.bpLang ? ` · ${state.header.bpLang}` : '';
  const position = state.activeIndex === null
    ? ' · active step: unknown'
    : ` · asIndex ${state.activeIndex}`;
  document.getElementById('status-right').textContent = host ? `${state.defProp} · ${host.label}${lang}${position}` : '';
}

/* ----------------------------------------------------------- wiring */

/* The step the OmniScript is on, or the action when it is on one. */
function currentElement() {
  return state.elements.find((element) =>
    state.progress[element.key] === 'current' && element.category.key === 'step') ||
    state.elements.find((element) => state.progress[element.key] === 'current') || null;
}

/* Selects an element and scrolls it into view. Opens the sections above it;
 * with clearFilters it also drops any filter that would hide it. */
function selectElement(element, { clearFilters = false } = {}) {
  const byKey = elementsByKey();
  let parent = byKey[element.parentKey];
  while (parent) { state.collapsed.delete(parent.key); parent = byKey[parent.parentKey]; }

  if (clearFilters && !visible().some((candidate) => candidate.key === element.key)) {
    state.filter = '';
    state.actionsOnly = false;
    state.visibleOnly = false;
    document.getElementById('struct-filter').value = '';
    document.getElementById('struct-actions-only').checked = false;
    document.getElementById('struct-visible-only').checked = false;
  }

  state.selectedKey = element.key;
  resetSelectionState();
  render();

  const row = el.list.querySelector('.log-row.is-selected');
  if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
}

function goToCurrentStep() {
  const button = document.getElementById('struct-current');
  const current = currentElement();

  if (!current) {
    button.textContent = state.elements.length ? 'No current step' : 'Nothing loaded';
    setTimeout(() => { button.textContent = 'Current step'; }, 1500);
    return;
  }
  selectElement(current, { clearFilters: true });
}

/* Auto-follow: runs when the script moves on. Leaves the filters alone — if
 * they hide the step, the detail pane still follows it. */
function followStep() {
  const current = currentElement();
  if (current && current.key !== state.selectedKey) selectElement(current);
}

/* A jump from the Data tab: select the element that owns that key. */
function applyPendingReveal() {
  if (!state.pendingReveal || !state.elements.length) return;
  const owner = ownerOfSegments(state.elements, state.data, state.pendingReveal);
  state.pendingReveal = null;

  if (!owner) {
    const status = document.getElementById('status-right');
    status.textContent = 'No element in the definition owns that key';
    return;
  }
  selectElement(owner, { clearFilters: true });
}

function mount() {
  el.list = document.getElementById('struct-list');
  el.detail = document.getElementById('struct-detail');

  document.getElementById('struct-current').addEventListener('click', goToCurrentStep);

  document.getElementById('struct-follow').addEventListener('change', (ev) => {
    state.follow = ev.currentTarget.checked;
    if (state.follow) followStep();
  });

  document.getElementById('struct-autocollapse').addEventListener('change', (ev) => {
    state.autoCollapse = ev.currentTarget.checked;
    state.autoFolded = new Set();
    state.handFolded = new Set();
    if (state.autoCollapse) autoCollapseNow();
    renderList();
  });

  document.getElementById('struct-hover').addEventListener('change', (ev) => {
    state.hover = ev.currentTarget.checked;
  });

  /* The four options below are hidden when Advanced is off, so none may stay
   * in force: put each back to off. */
  Advanced.subscribe((on) => {
    if (on) return;
    state.follow = false;
    state.autoCollapse = false;
    state.autoFolded = new Set();
    state.handFolded = new Set();
    state.hover = false;
    state.visibleOnly = false;
    ['struct-follow', 'struct-autocollapse', 'struct-hover', 'struct-visible-only']
      .forEach((id) => { document.getElementById(id).checked = false; });
    render();
  });

  document.getElementById('struct-visible-only').addEventListener('change', (ev) => {
    state.visibleOnly = ev.currentTarget.checked;
    render();
  });

  Shared.setLoader((done) => { afterLoad.push(done); load(); });

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

  attachPropPicker(document.getElementById('struct-prop'), (done) => Targets.listProps(done));

  document.getElementById('struct-prop').addEventListener('change', (ev) => {
    state.defProp = ev.currentTarget.value.trim() || 'jsonDef';
    ev.currentTarget.value = state.defProp;
    state.selectedKey = null;
    Targets.setProps(null, state.defProp);
  });

  document.getElementById('struct-actions-only').addEventListener('change', (ev) => {
    state.actionsOnly = ev.currentTarget.checked;
    render();
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

  let filterTimer = null;
  document.getElementById('struct-filter').addEventListener('input', (ev) => {
    const value = ev.currentTarget.value;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { state.filter = value; render(); }, 120);
  });

  /* The shared scope bar decides which OmniScript this is; reload whenever it
   * changes rather than keeping a frame or element list of our own. */
  Targets.subscribe((reason) => {
    if (reason === 'list') return; // same script, just a different list around it
    if (reason === 'navigated') forgetScript(); // the page left: drop what was read from it
    state.selectedKey = null;
    state.collapsed = new Set();
    state.header = null;
    state.autoFolded = new Set();
    state.handFolded = new Set();
    if (state.active) load();
  });
}

/* Drop the definition and data read from the page, and everything derived
 * from them. */
function forgetScript() {
  state.elements = [];
  state.data = undefined;
  state.dataRaw = null;
  state.header = null;
  state.error = null;
  state.activeIndex = null;
  state.progress = {};
  state.visibility = {};
  state.cells = {};
  Shared.setElements([]);
}

function copySelected() {
  const element = selected();
  const value = element ? resolveElementValue(element, state.data) : undefined;
  if (value === undefined) { toast(element ? 'This element holds no value' : 'Select an element first'); return; }
  copyWithToast(JSON.stringify(Mask.apply(value), null, 2), 'Copied value');
}

export const Structure = {
  mount,
  copySelected,
  focusFilter: () => document.getElementById('struct-filter').focus(),
  show: () => { state.active = true; load(); schedulePulse(); },
  hide: () => { state.active = false; clearTimeout(pulseTimer); },
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) { if (state.active) { load(); schedulePulse(); } } else clearTimeout(pulseTimer);
  }
};
