'use strict';

/* Structure tab: the OmniScript's elements, read from its definition and joined
 * against the live data. The frame and the OmniScript itself are chosen in the
 * shared scope bar (targets.js), so this file only asks for two payloads. */

import {
  flatten, parseObj, resolveElementValue, displayValue, isTextBlock, executionStatus
} from '../core/structure-model.js';
import { isContainer, addAllPaths } from '../core/json-tree-model.js';
import { renderJsonTree, HIGHLIGHT_MS } from './json-tree-view.js';
import { Targets } from './targets.js';
import { attachPropPicker } from './prop-picker.js';

const state = {
  progress: {},
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

function load() {
  if (!Targets.selected()) {
    state.elements = [];
    state.error = null;
    render();
    return;
  }

  Targets.fetch(state.defProp, (definitionRaw, error) => {
    if (error) {
      state.error = error.value || error.description || error.error || 'The definition could not be read.';
      state.elements = [];
      render();
      return;
    }

    state.error = null;

    if (!definitionRaw) {
      state.elements = [];
      render();
      return;
    }

    let definition;
    try {
      definition = JSON.parse(definitionRaw);
    } catch (e) {
      state.elements = [];
      state.error = `The definition is not valid JSON: ${e.message}`;
      render();
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

  if (updateProgress()) renderList();

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

  if (state.detailTab === 'value') renderDetail();
}

/* -------------------------------------------------------- rendering */

function visible() {
  const query = state.filter.trim().toLowerCase();
  return state.elements.filter((element) => {
    if (state.actionsOnly && !element.remote) return false;
    if (!query) return true;
    return `${element.name} ${element.type} ${element.label} ${element.labelKey}`.toLowerCase().includes(query);
  });
}

const STATUS_GLYPH = { done: '✓', current: '●', skipped: '–' };

/* One fixed-width column at the left edge of the row, so progress reads as a
 * single vertical strip instead of competing with the tags after the name. */
function statusCell(element, progress) {
  const cell = document.createElement('span');
  cell.className = `el-status${progress ? ` is-${progress}` : ''}`;
  if (!progress || !STATUS_GLYPH[progress]) return cell;

  const isStep = element.category.key === 'step';
  cell.textContent = STATUS_GLYPH[progress];
  cell.title = {
    current: 'The step the OmniScript is on now',
    skipped: 'Passed without running — its show condition was false',
    done: isStep ? 'Already passed' : 'Has run'
  }[progress];
  return cell;
}

function progressOf(element) {
  return state.progress[element.key] || null;
}

function updateProgress() {
  const next = executionStatus(state.elements, state.data, state.activeIndex);
  const changed = JSON.stringify(next) !== JSON.stringify(state.progress);
  state.progress = next;
  return changed;
}

function render() {
  updateProgress();
  renderList();
  renderDetail();
  renderStatus();
}

function listHeader() {
  const row = document.createElement('div');
  row.className = 'log-row log-head';
  const status = document.createElement('span');
  status.className = 'el-status';
  status.title = 'Progress: ✓ passed · ● current · – skipped';
  row.appendChild(status);

  const spacer = document.createElement('span');
  spacer.className = 'twisty is-leaf';
  row.appendChild(spacer);
  [
    ['el-icon', '', 'Element family'],
    ['log-name', 'Element', 'Label from the definition, or the element name when it has none'],
    ['el-type', 'Type', 'Element type as defined in the OmniScript'],
    ['el-value', 'Value', 'Current value in the live data']
  ].forEach(([className, text, title]) => {
    const cellEl = document.createElement('span');
    cellEl.className = className;
    cellEl.textContent = text;
    cellEl.title = title;
    row.appendChild(cellEl);
  });
  return row;
}

function isSectionCollapsed(element, byKey) {
  let parent = byKey[element.parentKey];
  let guard = 0;
  while (parent && guard++ < 100) {
    if (state.collapsed.has(parent.key)) return true;
    parent = byKey[parent.parentKey];
  }
  return false;
}

function renderRow(element, sectioning) {
  const row = document.createElement('div');
  row.className = 'log-row';
  if (element.key === state.selectedKey) row.classList.add('is-selected');

  const progress = progressOf(element);
  row.appendChild(statusCell(element, progress));
  if (progress) row.classList.add(`is-${progress}`);

  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  twisty.style.marginLeft = `${element.depth * 12}px`;
  if (sectioning && element.hasChildren) {
    const folded = state.collapsed.has(element.key);
    twisty.textContent = folded ? '▸' : '▾';
    twisty.title = folded ? 'Expand section' : 'Collapse section';
    twisty.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (state.collapsed.has(element.key)) state.collapsed.delete(element.key);
      else state.collapsed.add(element.key);
      renderList();
    });
  } else {
    twisty.classList.add('is-leaf');
  }
  row.appendChild(twisty);

  const icon = document.createElement('span');
  icon.className = `el-icon is-${element.category.key}`;
  icon.textContent = element.category.glyph;
  icon.title = `${element.category.label} — ${element.type}`;
  row.appendChild(icon);

  const name = document.createElement('span');
  name.className = 'log-name';
  name.textContent = element.name + (element.label ? ` (${element.label})` : '');
  name.title = `${element.name} — ${element.type}` +
    (element.label ? '\n' + (element.label.length > 300 ? element.label.slice(0, 300) + '…' : element.label) : '');
  if (element.missingLabels.length) row.classList.add('is-broken');
  row.appendChild(name);

  if (element.required) row.appendChild(tag('req', 'Required'));
  if (element.conditional) {
    row.appendChild(tag('cond', element.showExpr ? `Visible when: ${element.showExpr}` : 'Has show/hide conditions'));
  }
  if (element.remote) row.appendChild(tag('act', `Calls ${element.remote}`));

  if (element.missingLabels.length) {
    row.appendChild(tag('missing',
      (element.missingLabels.length === 1
        ? `Custom label "${element.missingLabels[0].key}" (${element.missingLabels[0].where})`
        : `${element.missingLabels.length} custom labels`) +
      ' missing from allCustomLabels — the OmniScript will not render correctly:\n' +
      element.missingLabels.map((m) => `• ${m.where}: ${m.key}`).join('\n')));
  }

  const type = document.createElement('span');
  type.className = 'el-type';
  type.textContent = element.type;
  row.appendChild(type);

  const value = document.createElement('span');
  value.className = 'el-value';
  value.textContent = displayValue(element, resolveElementValue(element, state.data));
  state.cells[element.key] = value;
  row.appendChild(value);

  row.addEventListener('click', () => {
    state.selectedKey = element.key;
    resetSelectionState();
    render();
  });

  return row;
}

function renderList() {
  const list = el.list;
  list.textContent = '';
  state.cells = {};

  if (state.error) {
    list.appendChild(notice('Could not read the definition', state.error, true));
    return;
  }

  if (!Targets.selected()) {
    list.appendChild(notice('No OmniScript selected', 'Pick one in the bar above, or press Rescan if the list is empty.', false));
    return;
  }

  if (!state.elements.length) {
    const box = notice('Nothing on ' + state.defProp,
      'This OmniScript exposes no definition on that property. Change the Definition field if your build names it differently.',
      false);
    Targets.hints().forEach((h) => {
      if (!h.props || !h.props.length) return;
      const p = document.createElement('div');
      p.style.marginTop = '6px';
      p.textContent = `${h.tag} exposes: ${h.props.join(', ')}`;
      box.appendChild(p);
    });
    list.appendChild(box);
    return;
  }

  let rows = visible();
  if (!rows.length) {
    list.appendChild(notice('No elements', 'Nothing matches the current filter.', false));
    return;
  }

  /* Sections only fold when the list still reflects the real tree — a text
   * filter or Actions only strips parents out, so honour neither then. */
  const sectioning = !state.filter.trim() && !state.actionsOnly;
  const byKey = {};
  state.elements.forEach((element) => { byKey[element.key] = element; });

  if (sectioning) {
    rows = rows.filter((element) => !isSectionCollapsed(element, byKey));
  }

  list.appendChild(listHeader());
  rows.forEach((element) => list.appendChild(renderRow(element, sectioning)));
}

const TAG_GLYPH = { req: '!', cond: '?', act: '↗', missing: '⚠' };

function tag(kind, title) {
  const span = document.createElement('span');
  span.className = `tag tag-${kind}`;
  span.textContent = TAG_GLYPH[kind] || '';
  span.title = title;
  return span;
}

function selected() {
  return state.elements.find((element) => element.key === state.selectedKey) || null;
}

/* The readable half of the Validation tab: what fires, when, and what the
 * user sees. The raw propSetMap is rendered underneath as the source of
 * truth, exactly like the Visibility tab. */
function renderValidationSummary(validation, container) {
  if (!validation) return;

  function line(className, label, text) {
    const div = document.createElement('div');
    div.className = className;
    if (label) {
      const strong = document.createElement('b');
      strong.textContent = `${label}  `;
      div.appendChild(strong);
    }
    div.appendChild(document.createTextNode(text));
    container.appendChild(div);
  }

  if (validation.kind === 'set-errors') {
    if (validation.triggerExpr) line('cond-expr', 'Sets error when:', validation.triggerExpr);
    else line('cond-expr', 'Sets error:', 'unconditionally while this element is reached');
    validation.errorMap.forEach((m) => line('cond-expr', `Error on ${m.element}:`, `“${m.message}”`));
    if (validation.message) line('cond-expr', 'Message:', `“${validation.message}”`);

    line('valid-note', '', 'Checked ' + (/^step$/i.test(validation.runsOn || 'step')
      ? 'when the user moves between steps.'
      : `on ${validation.runsOn}.`));
    line('valid-note', '', 'While the condition holds, the message is placed on the named ' +
      'element (often on an earlier step) and the user cannot advance; it clears ' +
      'once the condition no longer matches.');
  } else if (validation.kind === 'messaging') {
    if (validation.validateExpr) line('cond-expr', 'Expression:', validation.validateExpr);
    validation.messages.forEach((m) => {
      const suffix = m.condition ? `  —  when ${m.condition}`
        : (m.when === 'true' ? '  —  when the expression is true'
          : m.when === 'false' ? '  —  when the expression is false' : '');
      line('cond-expr', `${m.type || 'message'}:`, `“${m.text || ''}”${suffix}`);
    });
    line('valid-note', '',
      'The element evaluates its expression and shows the matching message in place; ' +
      'a Requirement or Error message also blocks step navigation.');
  }

  if (!container.childElementCount) {
    line('valid-note', '', 'Validation is configured on this element — see the raw definition below.');
  }
}

function renderDetailHead(element) {
  const head = document.createElement('div');
  head.className = 'detail-head';

  const title = document.createElement('div');
  title.className = 'detail-title';
  const shortLabel = element.label.length > 120 ? element.label.slice(0, 120) + '…' : element.label;
  title.textContent = element.name + (element.label ? ` (${shortLabel})` : '');
  if (shortLabel !== element.label) title.title = element.label;
  head.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  const bits = [element.type, `name: ${element.name}`];
  if (element.required) bits.push('required');
  if (element.conditional) bits.push('conditional');
  if (element.remote) bits.push(`calls ${element.remote}`);
  meta.textContent = bits.join(' · ');
  head.appendChild(meta);

  /* In a multi-language script the label is a custom-label key, not the text —
   * show it so it can be found and fixed in Custom Labels. */
  if (element.labelKey && (element.labelKey !== element.label || element.missingLabels.length)) {
    const labelKeyEl = document.createElement('div');
    labelKeyEl.className = 'detail-meta detail-labelkey';
    const kind = isTextBlock(element.node) && element.node.propSetMap && element.node.propSetMap.textKey
      ? 'text key: ' : 'label: ';
    labelKeyEl.textContent = kind + element.labelKey;
    head.appendChild(labelKeyEl);
  }

  /* One red line per custom-label key that is missing from allCustomLabels. */
  element.missingLabels.forEach((m) => {
    const missing = document.createElement('div');
    missing.className = 'detail-meta detail-labelkey is-broken';
    missing.textContent = `missing label · ${m.where}: ${m.key}`;
    head.appendChild(missing);
  });

  return head;
}

/* Everything the detail pane needs to know about which tabs exist and what
 * each one shows, resolved once per render so the tab strip, the disabled
 * reasons and the body all agree with each other. */
function detailTabsFor(element) {
  const currentValue = resolveElementValue(element, state.data);

  /* A Set Values element doesn't hold a value of its own — it writes into the
   * data JSON — so its second tab shows the assignments it makes instead. */
  const valueTab = element.isSetValues
    ? { label: 'Set values', data: element.setValues, on: !!element.setValues }
    : { label: 'Current value', data: currentValue, on: currentValue !== undefined };

  const hasValidation = !!(element.validation && element.validation.has);

  const bodyByTab = {
    definition: element.node,
    value: valueTab.data,
    conditions: element.show,
    validation: (element.validation && element.validation.raw) || null
  };

  const available = [
    ['definition', 'Definition', true],
    ['value', valueTab.label, valueTab.on],
    ['conditions', 'Visibility', !!element.conditional]
  ];
  if (hasValidation) available.push(['validation', 'Validation', true]);

  const disabledReason = {
    value: element.isSetValues ? 'This Set Values element has no assignments' : 'This element holds no value right now',
    conditions: 'This element has no show/hide conditions — it is always visible',
    validation: 'This element has no validation'
  };

  return { available, bodyByTab, disabledReason };
}

function renderDetailTools(element, tabs) {
  const { available, bodyByTab, disabledReason } = tabs;

  if (!available.some(([tabId, , enabled]) => tabId === state.detailTab && enabled)) {
    state.detailTab = 'definition';
  }

  const tools = document.createElement('div');
  tools.className = 'detail-tools';

  const tabStrip = document.createElement('div');
  tabStrip.className = 'seg';
  available.forEach(([tabId, tabLabel, enabled]) => {
    const button = document.createElement('button');
    button.className = `seg-btn${state.detailTab === tabId ? ' is-on' : ''}`;
    button.textContent = tabLabel;
    if (!enabled) {
      button.disabled = true;
      button.title = disabledReason[tabId] || '';
    } else {
      button.addEventListener('click', () => {
        state.detailTab = tabId;
        renderDetail();
      });
    }
    tabStrip.appendChild(button);
  });
  tools.appendChild(tabStrip);

  const shown = bodyByTab[state.detailTab];
  const treeable = isContainer(shown);

  const expand = document.createElement('button');
  expand.className = 'icon-btn tiny';
  expand.textContent = 'Expand all';
  expand.disabled = !treeable;
  expand.addEventListener('click', () => {
    const set = new Set();
    addAllPaths(shown, '', set, 0);
    state.expanded[state.detailTab] = set;
    renderDetail();
  });
  tools.appendChild(expand);

  const collapse = document.createElement('button');
  collapse.className = 'icon-btn tiny';
  collapse.textContent = 'Collapse all';
  collapse.disabled = !treeable;
  collapse.addEventListener('click', () => {
    state.expanded[state.detailTab] = new Set(['']);
    renderDetail();
  });
  tools.appendChild(collapse);

  const copy = document.createElement('button');
  copy.className = 'icon-btn tiny';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(shown, null, 2)).then(() => {
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1200);
    }, () => {});
  });
  tools.appendChild(copy);

  const find = document.createElement('input');
  find.type = 'search';
  find.className = 'detail-find';
  find.placeholder = 'Filter keys and values';
  find.spellcheck = false;
  find.value = state.detailFilter;
  let findTimer = null;
  find.addEventListener('input', () => {
    const value = find.value;
    clearTimeout(findTimer);
    findTimer = setTimeout(() => {
      state.detailFilter = value;
      renderDetail();
      const again = el.detail.querySelector('.detail-find');
      if (again) { again.focus(); again.setSelectionRange(value.length, value.length); }
    }, 150);
  });
  tools.appendChild(find);

  return tools;
}

function renderDetailBody(element, tabs) {
  const { bodyByTab } = tabs;
  const content = document.createElement('div');
  content.className = 'detail-body';

  if (state.detailTab === 'conditions' && element.showExpr) {
    const expr = document.createElement('div');
    expr.className = 'cond-expr';
    expr.textContent = `Visible when:  ${element.showExpr}`;
    content.appendChild(expr);
  }

  if (state.detailTab === 'validation') {
    renderValidationSummary(element.validation, content);
  }

  if (state.detailTab === 'value' && element.isSetValues) {
    const note = document.createElement('div');
    note.className = 'valid-note';
    note.textContent = 'Assignments this element writes into the OmniScript data ' +
      '(target field → value or formula). It holds no value of its own.';
    content.appendChild(note);
  }

  const shown = bodyByTab[state.detailTab];
  const treeable = isContainer(shown);

  if (!treeable) {
    const text = shown === undefined ? 'No value.'
      : (state.detailTab === 'value' ? displayValue(element, shown) : String(shown));
    content.appendChild(notice('', text, false));
    return content;
  }

  const result = renderJsonTree(content, state.detailTab, shown, {
    expanded: state.expanded[state.detailTab],
    expandedText: state.expandedText[state.detailTab],
    filter: state.detailFilter,
    onToggle: renderDetail
  });

  if (!result.matched) {
    content.appendChild(notice('', `Nothing here matches "${state.detailFilter}".`, false));
  }

  return content;
}

function renderDetail() {
  const pane = el.detail;
  pane.textContent = '';

  const element = selected();
  if (!element) {
    pane.appendChild(notice('Select an element', 'Its definition, current value and visibility conditions appear here.', false));
    return;
  }

  const tabs = detailTabsFor(element);
  const head = renderDetailHead(element);
  head.appendChild(renderDetailTools(element, tabs));
  pane.appendChild(head);
  pane.appendChild(renderDetailBody(element, tabs));
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

function renderStatus() {
  if (!state.active) return;
  const shown = visible().length;
  document.getElementById('status-left').textContent = state.elements.length
    ? `${shown} of ${state.elements.length} elements`
    : 'No definition loaded';
  const host = Targets.selected();
  const lang = state.header && state.header.bpLang ? ` · ${state.header.bpLang}` : '';
  const position = state.activeIndex === null
    ? ' · active step: unknown'
    : ` · asIndex ${state.activeIndex}`;
  document.getElementById('status-right').textContent = host ? `${state.defProp} · ${host.label}${lang}${position}` : '';
}

/* ----------------------------------------------------------- wiring */

/* Selects the step the OmniScript is on, scrolling it into view. Clears the
 * filters first if they would hide it. */
function goToCurrentStep() {
  const button = document.getElementById('struct-current');
  const current = state.elements.find((element) =>
    state.progress[element.key] === 'current' && element.category.key === 'step') ||
    state.elements.find((element) => state.progress[element.key] === 'current');

  if (!current) {
    button.textContent = state.elements.length ? 'No current step' : 'Nothing loaded';
    setTimeout(() => { button.textContent = 'Current step'; }, 1500);
    return;
  }

  if (!visible().some((element) => element.key === current.key)) {
    state.filter = '';
    state.actionsOnly = false;
    document.getElementById('struct-filter').value = '';
    document.getElementById('struct-actions-only').checked = false;
  }

  state.selectedKey = current.key;
  resetSelectionState();
  render();

  const row = el.list.querySelector('.log-row.is-selected');
  if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
}

function mount() {
  el.list = document.getElementById('struct-list');
  el.detail = document.getElementById('struct-detail');

  document.getElementById('struct-current').addEventListener('click', goToCurrentStep);

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
  Targets.subscribe(() => {
    state.selectedKey = null;
    state.collapsed = new Set();
    state.header = null;
    if (state.active) load();
  });
}

export const Structure = {
  mount,
  show: () => { state.active = true; load(); schedulePulse(); },
  hide: () => { state.active = false; clearTimeout(pulseTimer); },
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) { if (state.active) { load(); schedulePulse(); } } else clearTimeout(pulseTimer);
  }
};
