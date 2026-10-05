'use strict';

/* Remote actions tab.
 *
 * Listens to the DevTools network stream and decodes the Apex calls OmniStudio
 * makes. A remote action reaches the server as an Aura ApexAction wrapping
 * { sClassName, sMethodName, input, options }, so one HTTP request can carry
 * several actions — each becomes its own row.
 *
 * Everything is best-effort: when a shape is not recognised the entry still
 * appears with its raw request and response, so nothing is silently dropped.
 */

import {
  KIND_LABEL, classify, parseRequest, parseResponse, resultFor, isOmni,
  label, kindOf, optionFlags, displayName, failureReason, failed,
  matchesFilter, elementForCall, previousSimilar
} from '../core/actions-model.js';
import { diffValues } from '../core/diff.js';
import { diffLine } from './diff-lines.js';
import { isContainer, addAllPaths } from '../core/json-tree-model.js';
import { renderJsonTree } from './json-tree-view.js';
import { Mask } from './mask-setting.js';
import { Shared } from './shared.js';
import { Nav } from './nav.js';
import { Advanced } from './advanced.js';
import { copyWithToast, copyWithButton } from './clipboard.js';
import { toast } from './toast.js';

const MAX_ENTRIES = 500;

const state = {
  active: false,
  recording: true,
  preserve: true,
  onlyOmni: true,
  filter: '',
  errorsOnly: false,
  slowMs: 0, // 0 = no threshold
  compareId: null, // the baseline call the selected one is compared against
  entries: [],
  selectedId: null,
  detailTab: 'input',
  detailFilter: '',
  expanded: { input: new Set(['']), output: new Set(['']), options: new Set(['']) },
  expandedText: { input: new Set(), output: new Set(), options: new Set() },
  seq: 0
};

const el = {};

/* ---------------------------------------------------------- capture */

/* Turns one decoded action, plus the request/response it travelled in, into
 * the record every renderer below reads. Kept separate from
 * onRequestFinished so that function stays at one level of abstraction:
 * "for each action in this request, build and store its record." */
function buildActionRecord(kind, action, index, responseBody, request) {
  const result = resultFor(kind, responseBody, action, index);
  return {
    id: ++state.seq,
    kind,
    url: request.url,
    time: request.startedAt,
    duration: request.durationMs,
    httpStatus: request.httpStatus,
    size: request.bodySize,
    omni: isOmni(action),
    type: kindOf(action),
    flags: optionFlags(action),
    name: displayName(action),
    signature: label(action),
    action,
    state: result.state,
    output: result.output,
    error: result.error
  };
}

function onRequestFinished(networkEntry) {
  if (!state.recording) return;

  const request = networkEntry.request || {};
  const kind = classify(request.url || '', request.method);
  if (!kind) return;

  const postText = (request.postData && request.postData.text) || '';
  const actions = parseRequest(kind, postText);
  if (!actions.length) return;

  networkEntry.getContent((content) => {
    const responseBody = parseResponse(content);
    const requestMeta = {
      url: request.url,
      startedAt: new Date(networkEntry.startedDateTime || Date.now()),
      durationMs: Math.round(networkEntry.time || 0),
      httpStatus: (networkEntry.response && networkEntry.response.status) || 0,
      bodySize: (networkEntry.response && networkEntry.response.bodySize) || 0
    };

    actions.forEach((action, index) => {
      push(buildActionRecord(kind, action, index, responseBody, requestMeta));
    });

    if (state.active) renderList();
    updateBadge();
  });
}

function push(record) {
  state.entries.push(record);
  if (state.entries.length > MAX_ENTRIES) state.entries.shift();
}

function visibleEntries() {
  const opts = {
    onlyOmni: state.onlyOmni, query: state.filter,
    errorsOnly: state.errorsOnly, slowMs: state.slowMs
  };
  return state.entries.filter((entry) => matchesFilter(entry, opts));
}

/* --------------------------------------------------------- rendering */

function header() {
  const row = document.createElement('div');
  row.className = 'log-row log-head';
  const columns = [
    ['log-time', 'Started', 'Clock time the request left the browser'],
    ['tag', '', 'Call type'],
    ['log-name', 'Action', 'Data Mapper bundle, Integration Procedure key, or Apex class and method'],
    ['pill is-code', 'HTTP', 'HTTP status of the request'],
    ['pill', 'Result', 'Whether the response carried an error'],
    ['log-ms', 'Took', 'Round trip in milliseconds: request sent to response fully received']
  ];
  columns.forEach(([className, text, title]) => {
    const cellEl = document.createElement('span');
    cellEl.className = className;
    cellEl.textContent = text;
    cellEl.title = title;
    row.appendChild(cellEl);
  });
  return row;
}

function expandedSetFor(value) {
  const paths = new Set(['']);
  if (isContainer(value)) {
    try { addAllPaths(value, '', paths, 0); } catch { /* defensive: unexpected shape */ }
  }
  return paths;
}

function selectEntry(entry) {
  state.selectedId = entry.id;
  if (state.compareId === entry.id) state.compareId = null;
  // Expand the Input / Options / Output JSON trees by default for ease of inspection.
  state.expanded = {
    input: expandedSetFor(entry.action.input),
    output: expandedSetFor(entry.output),
    options: expandedSetFor(entry.action.options)
  };
  state.expandedText = { input: new Set(), output: new Set(), options: new Set() };
  renderList();
  renderDetail();
}

function renderRow(entry) {
  const row = document.createElement('div');
  row.className = 'log-row';
  if (entry.id === state.selectedId) row.classList.add('is-selected');
  if (failed(entry)) row.classList.add('is-failed');
  if (entry.id === state.compareId) row.classList.add('is-baseline');

  const why = failureReason(entry);

  const started = cell('log-time', entry.time.toLocaleTimeString());
  started.title = `Request started at ${entry.time.toLocaleTimeString()}`;
  row.appendChild(started);

  const tag = cell(`tag tag-${entry.type.toLowerCase()}`, entry.type === 'APEX' ? 'Apex' : entry.type);
  tag.title = KIND_LABEL[entry.type];
  row.appendChild(tag);

  const name = cell('log-name', entry.name);
  name.title = `${KIND_LABEL[entry.type]} — ${entry.signature}${why ? `\n\nMarked as failed: ${why}` : ''}`;
  row.appendChild(name);

  const flags = entry.flags || [];
  flags.slice(0, 3).forEach((flag) => {
    const pill = cell('tag tag-opt', flag.label);
    pill.title = flag.title;
    row.appendChild(pill);
  });
  if (flags.length > 3) {
    const more = cell('tag tag-opt', `+${flags.length - 3}`);
    more.title = flags.slice(3).map((flag) => flag.title).join('\n');
    row.appendChild(more);
  }

  /* Two separate facts, so they can never contradict each other: the HTTP
   * code describes the transport, the verdict describes the payload. The
   * verdict comes from the same check that colours the row, which is why
   * Aura's own "SUCCESS" is not shown here — it reports neither. */
  const code = cell('pill is-code', entry.httpStatus ? String(entry.httpStatus) : '—');
  if (entry.httpStatus >= 400) code.classList.add('is-bad');
  code.title = `HTTP ${entry.httpStatus || 'unknown'}${entry.state ? `\nAura state: ${entry.state}` : ''}`;
  row.appendChild(code);

  const verdict = cell('pill', why ? 'ERROR' : 'SUCCESS');
  verdict.classList.add(why ? 'is-bad' : 'is-good');
  verdict.title = why || 'No error found in the response';
  row.appendChild(verdict);

  const took = cell('log-ms', entry.duration ? `${entry.duration} ms` : '');
  if (state.slowMs > 0 && entry.duration >= state.slowMs) took.classList.add('is-slow');
  took.title = entry.duration
    ? `Round trip: ${entry.duration} ms from request sent to response received`
    : 'Duration unavailable';
  row.appendChild(took);

  row.addEventListener('click', (ev) => {
    /* Ctrl/Cmd-click picks the baseline the selected call is compared with. */
    if ((ev.ctrlKey || ev.metaKey) && state.selectedId && entry.id !== state.selectedId) {
      state.compareId = state.compareId === entry.id ? null : entry.id;
      if (state.compareId) state.detailTab = 'compare';
      renderList();
      return;
    }
    selectEntry(entry);
  });

  return row;
}

function renderList() {
  const list = el.list;
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
  list.textContent = '';

  const rows = visibleEntries();
  if (!rows.length) {
    list.appendChild(hint(state.entries.length
      ? 'Nothing matches the current filter.'
      : 'No remote actions captured yet. Interact with the OmniScript — calls appear here as they happen.'));
    renderDetail();
    return;
  }

  list.appendChild(header());
  rows.forEach((entry) => list.appendChild(renderRow(entry)));

  if (atBottom) list.scrollTop = list.scrollHeight;
  renderDetail();
  renderStatus();
}

function selected() {
  return state.entries.find((entry) => entry.id === state.selectedId) || null;
}

function renderDetailHead(entry) {
  const head = document.createElement('div');
  head.className = 'detail-head';

  const title = document.createElement('div');
  title.className = 'detail-title';
  title.textContent = entry.name;
  head.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  const bits = [KIND_LABEL[entry.type]];
  if (entry.signature !== entry.name) bits.push(entry.signature);
  meta.textContent = bits.concat([
    entry.time.toLocaleTimeString(),
    `${entry.duration} ms`,
    `HTTP ${entry.httpStatus || '?'}`,
    entry.state || 'state unknown'
  ]).join(' · ');
  head.appendChild(meta);

  const why = failureReason(entry);
  if (why) head.appendChild(renderFailureBanner(entry));

  const owner = elementForCall(entry, Shared.elements());
  if (owner) {
    const link = document.createElement('button');
    link.className = 'icon-btn tiny';
    link.textContent = `Show ${owner.name} in Structure`;
    link.title = 'Select the element of the script that makes this call';
    link.addEventListener('click', () => Nav.go('structure', { elementKey: owner.key }));
    head.appendChild(link);
  }

  return head;
}

function renderFailureBanner(entry) {
  const banner = document.createElement('div');
  banner.className = 'detail-error';
  banner.textContent = failureReason(entry, true);

  banner.addEventListener('click', () => {
    /* A message that fits is not interactive: no pointer, no tooltip. */
    if (!banner.classList.contains('is-clamped') && !banner.classList.contains('is-open')) return;

    const opening = !banner.classList.contains('is-open');
    banner.classList.toggle('is-open', opening);
    banner.classList.toggle('is-clamped', !opening);
    banner.title = opening ? 'Click to collapse' : 'Click to expand';
  });

  /* Measurable only once it is in the document. */
  setTimeout(() => {
    if (!clamped(banner)) return;
    banner.classList.add('is-clamped');
    banner.title = 'Click to expand';
  }, 0);

  return banner;
}

function renderDetailTools(entry) {
  const tools = document.createElement('div');
  tools.className = 'detail-tools';

  const available = tabsFor(entry);
  const usable = available.filter((tab) => tab[2]);
  if (!usable.some((tab) => tab[0] === state.detailTab)) state.detailTab = 'input';

  const tabStrip = document.createElement('div');
  tabStrip.className = 'seg';
  available.forEach(([tabId, tabLabel, enabled]) => {
    const button = document.createElement('button');
    button.className = `seg-btn${state.detailTab === tabId ? ' is-on' : ''}`;
    button.textContent = tabLabel;
    if (!enabled) {
      button.disabled = true;
      button.title = tabId === 'compare'
        ? 'Press d to compare with the previous call to the same place, or Ctrl/Cmd-click another call'
        : `This call carried no ${tabLabel.toLowerCase()}`;
    } else {
      button.addEventListener('click', () => {
        state.detailTab = tabId;
        renderDetail();
      });
    }
    tabStrip.appendChild(button);
  });
  tools.appendChild(tabStrip);

  const value = bodyFor(entry);
  const treeable = isContainer(value) && state.detailTab !== 'compare';

  const expand = document.createElement('button');
  expand.className = 'icon-btn tiny';
  expand.textContent = 'Expand all';
  expand.disabled = !treeable;
  expand.addEventListener('click', () => {
    const set = new Set();
    addAllPaths(value, '', set, 0);
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
    copyWithButton(JSON.stringify(copyBodyFor(entry), null, 2), copy, 'Copy');
  });
  tools.appendChild(copy);

  if (state.detailTab === 'compare') return tools;

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

function baselineFor() {
  return state.entries.find((entry) => entry.id === state.compareId) || null;
}

/* Input, options and output of the baseline against the selected call. */
function compareSections(entry, baseline) {
  return [
    ['Input', baseline.action.input, entry.action.input],
    ['Options', baseline.action.options, entry.action.options],
    ['Output', baseline.output, entry.output]
  ].map(([title, before, after]) => ({ title, ...diffValues(before, after) }));
}

function renderCompare(entry, baseline) {
  const body = document.createElement('div');
  body.className = 'detail-body';

  const intro = document.createElement('div');
  intro.className = 'valid-note';
  intro.textContent = `Changes from the call at ${baseline.time.toLocaleTimeString()} (${baseline.duration} ms) ` +
    `to this one at ${entry.time.toLocaleTimeString()} (${entry.duration} ms).`;
  body.appendChild(intro);

  compareSections(entry, baseline).forEach((section) => {
    const title = document.createElement('h3');
    title.className = 'diff-title';
    title.textContent = `${section.title} — ${section.changes.length ? `${section.changes.length}${section.truncated ? '+' : ''} difference(s)` : 'identical'}`;
    body.appendChild(title);

    section.changes.forEach((change) => body.appendChild(diffLine(change)));
  });
  return body;
}

function renderDetailBody(entry) {
  if (state.detailTab === 'compare') {
    const baseline = baselineFor();
    if (baseline) return renderCompare(entry, baseline);
    state.detailTab = 'input';
  }

  const body = document.createElement('div');
  body.className = 'detail-body';

  const value = bodyFor(entry);
  if (value === undefined) {
    body.appendChild(hint('Nothing captured for this section.'));
    return body;
  }
  if (!isContainer(value)) {
    body.appendChild(hint(String(value)));
    return body;
  }

  const result = renderJsonTree(body, state.detailTab, value, {
    expanded: state.expanded[state.detailTab],
    expandedText: state.expandedText[state.detailTab],
    filter: state.detailFilter,
    transform: Mask.apply,
    onToggle: renderDetail
  });

  if (!result.matched) {
    body.appendChild(hint(`Nothing here matches "${state.detailFilter}".`));
  }

  return body;
}

function renderDetail() {
  const pane = el.detail;
  pane.textContent = '';

  const entry = selected();
  if (!entry) {
    pane.appendChild(hint('Select a call to see its input and output.'));
    return;
  }

  const head = renderDetailHead(entry);
  head.appendChild(renderDetailTools(entry));
  pane.appendChild(head);
  pane.appendChild(renderDetailBody(entry));
}

/* What Copy puts on the clipboard: the tab's body, masked when the switch is
 * on. A comparison masks only the before and after values; its titles, paths
 * and kinds are what make it readable. */
function copyBodyFor(entry) {
  const body = bodyFor(entry);
  if (state.detailTab !== 'compare' || !Array.isArray(body)) return Mask.apply(body);
  return body.map((section) => ({
    ...section,
    changes: section.changes.map((change) => ({
      ...change, before: Mask.apply(change.before), after: Mask.apply(change.after)
    }))
  }));
}

function bodyFor(entry) {
  if (state.detailTab === 'compare') {
    const baseline = baselineFor();
    return baseline ? compareSections(entry, baseline) : undefined;
  }
  if (state.detailTab === 'output') return entry.output;
  if (state.detailTab === 'options') return entry.action.options;
  return entry.action.input; // 'input' is the default and only remaining tab
}

/* Options are worth their own tab — for a DataRaptor or Integration Procedure
 * that is where the bundle name and the chaining flags live — but only when
 * the call actually carried some. */
function hasOptions(entry) {
  const options = entry.action.options;
  if (options === undefined || options === null || options === '') return false;
  if (typeof options === 'object') return Object.keys(options).length > 0;
  return true;
}

/* Every tab is always rendered, so the strip does not reflow as the user
 * clicks down the list. A tab with nothing behind it is disabled instead of
 * hidden — "this call carried no options" is worth stating outright. */
function tabsFor(entry) {
  const tabs = [
    ['input', 'Input', true],
    ['output', 'Output', true],
    ['options', 'Options', hasOptions(entry)]
  ];
  /* Compare is started with d or Ctrl/Cmd-click, so its tab exists only while
   * there is something to compare. */
  const baseline = baselineFor();
  if (baseline && baseline.id !== entry.id) tabs.push(['compare', 'Compare', true]);
  return tabs;
}

function clamped(node) {
  return node.scrollHeight > node.clientHeight + 2;
}

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function hint(text) {
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = text;
  return div;
}

function updateBadge() {
  const count = visibleEntries().length;
  el.badge.textContent = String(count);
  el.badge.hidden = count === 0;
}

function renderStatus() {
  if (!state.active) return;
  const shown = visibleEntries().length;
  document.getElementById('status-left').textContent =
    `${shown}${shown === 1 ? ' call' : ' calls'}${state.entries.length !== shown ? ` of ${state.entries.length} captured` : ''}`;
  document.getElementById('status-right').textContent =
    `${state.recording ? 'Recording' : 'Paused'}${state.preserve ? ' · preserving log' : ''}`;
}

/* ----------------------------------------------------------- wiring */

function exportVisibleEntries() {
  const payload = visibleEntries().map((entry) => ({
    time: entry.time.toISOString(),
    action: entry.name,
    type: KIND_LABEL[entry.type],
    signature: entry.signature,
    options_flags: (entry.flags || []).map((flag) => flag.label),
    durationMs: entry.duration,
    httpStatus: entry.httpStatus,
    state: entry.state,
    input: Mask.apply(entry.action.input),
    options: hasOptions(entry) ? Mask.apply(entry.action.options) : undefined,
    output: Mask.apply(entry.output),
    error: Mask.apply(entry.error)
  }));
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `remote-actions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function mount() {
  el.list = document.getElementById('log-list');
  el.detail = document.getElementById('log-detail');
  el.badge = document.getElementById('actions-count');

  document.getElementById('log-record').addEventListener('click', (ev) => {
    state.recording = !state.recording;
    ev.currentTarget.textContent = state.recording ? 'Recording' : 'Record';
    ev.currentTarget.classList.toggle('is-on', state.recording);
    renderStatus();
  });

  document.getElementById('log-clear').addEventListener('click', () => {
    state.entries = [];
    state.selectedId = null;
    state.compareId = null;
    renderList();
    updateBadge();
  });

  const refilter = () => { renderList(); updateBadge(); };
  document.getElementById('log-errors-only').addEventListener('change', (ev) => {
    state.errorsOnly = ev.currentTarget.checked; refilter();
  });
  document.getElementById('log-slow').addEventListener('input', (ev) => {
    state.slowMs = Math.max(0, Number(ev.currentTarget.value) || 0); refilter();
  });

  Shared.setCalls(() => state.entries);

  /* Advanced filters are hidden when it is off, so none may stay in force. */
  Advanced.subscribe((on) => {
    if (on) return;
    state.errorsOnly = false;
    state.slowMs = 0;
    state.onlyOmni = true;
    document.getElementById('log-errors-only').checked = false;
    document.getElementById('log-slow').value = '';
    document.getElementById('log-only-omni').checked = true;
    refilter();
  });

  Nav.on('actions', ({ id }) => {
    const entry = state.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (!visibleEntries().includes(entry)) {
      state.onlyOmni = false; state.errorsOnly = false; state.slowMs = 0; state.filter = '';
      document.getElementById('log-only-omni').checked = false;
      document.getElementById('log-errors-only').checked = false;
      document.getElementById('log-slow').value = '';
      document.getElementById('log-filter').value = '';
    }
    selectEntry(entry);
    const row = el.list.querySelector('.log-row.is-selected');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
  });

  document.getElementById('log-only-omni').addEventListener('change', (ev) => {
    state.onlyOmni = ev.currentTarget.checked;
    renderList();
    updateBadge();
  });

  document.getElementById('log-preserve').addEventListener('change', (ev) => {
    state.preserve = ev.currentTarget.checked;
    renderStatus();
  });

  let filterTimer = null;
  document.getElementById('log-filter').addEventListener('input', (ev) => {
    const value = ev.currentTarget.value;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      state.filter = value;
      renderList();
      updateBadge();
    }, 120);
  });

  document.getElementById('log-export').addEventListener('click', exportVisibleEntries);

  chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);

  chrome.devtools.network.onNavigated.addListener(() => {
    if (state.preserve) return;
    state.entries = [];
    state.selectedId = null;
    state.compareId = null;
    if (state.active) renderList();
    updateBadge();
  });

  renderList();
}

function copySelected() {
  const entry = selected();
  if (!entry) { toast('Select a call first'); return; }
  copyWithToast(JSON.stringify(copyBodyFor(entry), null, 2), `Copied ${state.detailTab}`);
}

/* Keyboard d: diff the selected call against the last earlier call to the
 * same place. */
function compareWithPrevious() {
  const entry = selected();
  if (!entry) { toast('Select a call first'); return; }
  const earlier = previousSimilar(state.entries, entry);
  if (!earlier) { toast('No earlier call to the same place'); return; }
  state.compareId = earlier.id;
  state.detailTab = 'compare';
  renderList();
}

export const RemoteActions = {
  mount,
  compareWithPrevious,
  copySelected,
  focusFilter: () => document.getElementById('log-filter').focus(),
  show: () => { state.active = true; renderList(); renderStatus(); },
  hide: () => { state.active = false; }
};
