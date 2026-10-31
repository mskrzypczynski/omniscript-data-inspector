'use strict';

/* The Calls tab's Debug tab: what happened inside a debug run (a designer
 * preview of an Integration Procedure or a DataRaptor, or an Integration
 * Procedure a page called with isDebug in its options), read from the answer. A head line, the steps of an Integration Procedure with
 * their time and a bar for their share, the response and the original input,
 * the output and errors of a DataRaptor, and the debug log. What each of them
 * contains (the model, the offsets, the masking, which section is open by
 * default) is decided in src/core/actions/debug-run.js; this module draws it.
 *
 * A View picker at the top chooses what the tab shows: the Overview (all of the
 * above), the whole data as one tree, the response, the original input, the
 * debug log with chips, or one element's input, options, output and debug.
 * What the pane's filter box, Expand all, Collapse all and Copy act on is the
 * view shown (the decisions are in src/core/actions/debug-views.js).
 *
 * What is open (the view, steps, sections, the state of each tree, the log
 * chips) is kept per call in state.debugOpen, so a redraw caused by a poll
 * keeps it. A step or a section opens in place, without redrawing the pane, so
 * the keyboard stays where it was. */

import { Mask } from '../mask-setting.js';
import { copyWithToast } from '../clipboard.js';
import { renderJsonTree } from '../json-tree-view.js';
import { isContainer, addAllPaths } from '../../core/shared/json-tree-model.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { formatTime } from '../../core/shared/time-format.js';
import { openTreeMenu } from '../tree-menu.js';
import { toast } from '../toast.js';
import {
  debugModelOf, debugHeadParts, debugOutcome, offsetText, queryOf, lineShown, maskQuery, logSummary, logStats, logStatsText, LOG_FOLD_AT,
  blankOpen, sectionOpen, stepKey, stepTone, statusTone, shareLabel, barPercent, isSkipped, isPlainSuccess, knownWordOrMasked
} from '../../core/actions/debug-run.js';
import {
  debugViews, resolveView, viewValue, logChips, visibleLog, slowestStep, stepsMarkdown, stepMatches, viewCopyText, viewCopyTitle,
  stepViewId, nothingToCopy, leftNothing, visibleSteps, fullDataLabel, OVERVIEW
} from '../../core/actions/debug-views.js';
import { compareDebugRuns, comparableRuns, showCompareStatus, rowName, presenceNote, rowDiffers, compareHeading, deltaText } from '../../core/actions/debug-compare.js';

function node(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

const maskNow = () => (Mask.on() ? Mask.apply : undefined);

/* The paths of every container in a value: what a tree starts expanded to. */
function allPaths(value) {
  const paths = new Set(['']);
  if (isContainer(value)) {
    try { addAllPaths(value, '', paths, 0); } catch { /* defensive: unexpected shape */ }
  }
  return paths;
}

/* state: the tab's state (debugOpen is a Map of call id -> open sections).
 * paint(): draws the detail pane again. */
export function createDebugView({ state, paint }) {
  /* The model of a call is worked out once: its answer never changes. */
  const models = new WeakMap();
  /* The trees drawn by the last render, id -> { value, host }, for Expand and
   * Collapse (those whose host is still in the pane are the open ones). */
  let drawn = new Map();

  function cacheOf(entry) {
    const cached = models.get(entry);
    if (cached && cached.output === entry.output) return cached;
    const model = debugModelOf(entry);
    const made = { output: entry.output, model, views: debugViews(model, entry) };
    models.set(entry, made);
    return made;
  }

  const modelOf = (entry) => cacheOf(entry).model;

  /* The view the picker is on: the one chosen, when the run still offers it. */
  const viewIdOf = (entry) => resolveView(cacheOf(entry).views, openFor(entry).view);

  const openFor = (entry) => {
    if (!state.debugOpen.has(entry.id)) state.debugOpen.set(entry.id, blankOpen());
    return state.debugOpen.get(entry.id);
  };

  /* ------------------------------------------------------------ trees */

  /* A tree starts open all the way down, except the whole data of a run, which
   * can be large: that one starts at its top level. */
  function treeState(open, id, value, collapsed = false) {
    if (!open.trees[id]) open.trees[id] = { expanded: collapsed ? new Set(['']) : allPaths(value), expandedText: new Set(), filterOpen: new Map() };
    return open.trees[id];
  }

  /* A redraw that keeps the pane where the user was reading. */
  function repaintInPlace(host) {
    const body = host.closest('.debug-body');
    const top = body ? body.scrollTop : 0;
    paint();
    const again = document.querySelector('#log-detail .debug-body');
    if (again) again.scrollTop = top;
  }

  function tree(host, entry, id, label, value, { filter = '', collapsed = false } = {}) {
    const open = openFor(entry);
    host.className = 'debug-tree';
    if (value === undefined) {
      host.appendChild(node('div', 'notice', 'Nothing in the answer for this section.'));
      return;
    }
    if (!isContainer(value)) {
      const text = node('pre', 'raw-response', String(Mask.apply(value)));
      host.appendChild(text);
      return;
    }
    drawn.set(id, { value, host });
    const own = treeState(open, id, value, collapsed);
    const result = renderJsonTree(host, label, value, {
      expanded: own.expanded,
      expandedText: own.expandedText,
      filterOpen: own.filterOpen,
      filter,
      transform: Mask.apply,
      onToggle: () => repaintInPlace(host),
      onContext: (ev, info) => openTreeMenu(ev, info, {
        root: value,
        tree: own,
        filtering: () => !!filter.trim(),
        copy: (text, what) => copyWithToast(text, what ? `Copied ${what}` : 'Copied'),
        rerender: () => repaintInPlace(host)
      })
    });
    if (filter.trim() && !result.matched) host.appendChild(node('div', 'notice', `Nothing here matches "${filter}".`));
  }

  /* ---------------------------------------------------------- sections */

  /* A <details> section whose content is built when it is open. The user's
   * choice is kept; the default is `fallback`. */
  function section(entry, id, title, fallback, fill, { count } = {}) {
    const open = openFor(entry);
    const details = node('details', `debug-section debug-${id}`);
    const summary = node('summary', undefined, title);
    summary.title = count === undefined ? `Show or hide ${title.toLowerCase()}` : `Show or hide the ${count} lines of the debug log`;
    details.appendChild(summary);
    const content = node('div', 'debug-section-body');
    details.appendChild(content);
    const build = () => { content.textContent = ''; fill(content); };
    details.open = sectionOpen(open, id, fallback);
    if (details.open) build();
    details.addEventListener('toggle', () => {
      if (details.open === sectionOpen(open, id, fallback)) return; // set by the redraw itself
      open.sections[id] = details.open;
      if (details.open) build(); else content.textContent = '';
    });
    return details;
  }

  function treeSection(entry, id, title, label, value, fallback) {
    return section(entry, id, title, fallback, (content) => {
      const host = node('div');
      content.appendChild(host);
      tree(host, entry, id, label, value);
    });
  }

  /* ------------------------------------------------------------- head */

  function headLine(entry, model) {
    const line = node('div', 'debug-head');
    const parts = debugHeadParts(entry, model, state.timeFormat);
    // The first part is the outcome unless the answer holds no debug information and the call did not fail.
    const outcome = debugOutcome(entry, model);
    parts.forEach((text, index) => {
      if (index) line.appendChild(document.createTextNode(' · '));
      const isOutcome = index === 0 && outcome !== null;
      const span = node('span', isOutcome ? `meta-part debug-outcome ${tagClasses(model.ok ? 'good' : 'bad')}` : 'meta-part', text);
      if (isOutcome) {
        span.title = model.ok
          ? 'The call finished without a failed step or a reported error'
          : 'The call failed: see its reason in the call\'s Result, or a failed step below';
      }
      line.appendChild(span);
    });
    line.title = 'Outcome, total time, CPU time and what the run was made of';
    return line;
  }

  /* ------------------------------------------------------------ steps */

  const timeText = (ms) => (ms === null || ms === undefined ? '' : formatTime(ms, state.timeFormat));

  function stepDetail(entry, step, index) {
    const row = node('tr', 'debug-step-detail');
    const cell = node('td');
    cell.colSpan = 7;
    [['input', 'Input', step.input], ['options', 'Options', step.options], ['output', 'Output', step.output]].forEach(([part, title, value]) => {
      if (value === undefined) return;
      const block = node('div', 'debug-step-part');
      block.appendChild(node('div', 'debug-step-label', title));
      const host = node('div');
      block.appendChild(host);
      tree(host, entry, stepKey(index, part), title.toLowerCase(), value);
      cell.appendChild(block);
    });
    if (!cell.children.length) cell.appendChild(node('div', 'notice', 'This step left no input, options or output.'));
    row.appendChild(cell);
    return row;
  }

  /* Switches the picker to a view and draws the pane again; the picker keeps
   * the keyboard focus it had. */
  function showView(entry, id) {
    openFor(entry).view = id;
    paint();
    const again = document.getElementById('debug-view-select');
    if (again) again.focus();
  }

  function stepRow(entry, step, index, open, slowest) {
    const tone = statusTone(step.status);
    const skipped = isSkipped(step);
    const row = node('tr', `debug-step${tone === 'bad' && step.status ? ' is-failed' : ''}${skipped ? ' is-skipped' : ''}`);
    row.dataset.step = step.name;

    // The number is the button that opens the step's trees in place (the whole row does as well).
    const no = node('td', 'debug-no');
    const toggle = node('button', 'debug-step-btn', String(index + 1));
    toggle.type = 'button';
    toggle.title = `Show the input, options and output of ${step.name} here`;
    toggle.setAttribute('aria-label', `Step ${index + 1}, ${step.name}: show its input, options and output`);
    no.appendChild(toggle);
    row.appendChild(no);

    // The name is the way to the element's own view.
    const name = node('td', 'debug-name');
    const jump = node('button', 'debug-name-btn', step.name);
    jump.type = 'button';
    jump.title = "Show this step's input, options, output and debug";
    jump.addEventListener('click', (ev) => { ev.stopPropagation(); showView(entry, stepViewId(index)); });
    name.appendChild(jump);
    row.appendChild(name);

    const type = node('td', 'debug-type');
    if (step.type) {
      const tag = node('span', tagClasses(stepTone(step.type)), step.type);
      tag.title = step.type;
      type.appendChild(tag);
    }
    row.appendChild(type);

    const status = node('td', 'debug-status');
    if (isPlainSuccess(step.status)) {
      // Most rows succeed: say nothing, and keep the word in the tooltip.
      status.title = step.status;
    } else if (step.status) {
      const tag = node('span', tagClasses(tone), step.status);
      if (tone === 'bad') {
        tag.setAttribute('role', 'img');
        tag.setAttribute('aria-label', `${step.status}, failed`);
        tag.title = 'This step failed';
      } else if (skipped) {
        tag.title = 'This step did not run: its condition was false, or a block before it did not let it run';
      }
      status.appendChild(tag);
    }
    row.appendChild(status);

    const time = node('td', 'debug-time');
    if (index === slowest) {
      const mark = node('span', `${tagClasses('warn')} debug-slowest`, 'slowest');
      mark.title = 'The slowest step of this run';
      time.appendChild(mark);
      time.appendChild(document.createTextNode(' '));
    }
    // A step that did not run has no time and no bar.
    time.appendChild(document.createTextNode(skipped ? '' : timeText(step.elapsedMs)));
    row.appendChild(time);
    row.appendChild(node('td', 'debug-cpu', skipped ? '' : timeText(step.cpuMs)));

    const bar = node('td', 'debug-barcell');
    if (!skipped) {
      const track = node('span', 'debug-bar');
      const fill = node('span', 'debug-bar-fill');
      fill.style.width = `${barPercent(step.share)}%`;
      track.title = shareLabel(step);
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', shareLabel(step));
      track.appendChild(fill);
      bar.appendChild(track);
    }
    row.appendChild(bar);

    let detail = null;
    const paintOpen = (isOpen) => {
      toggle.setAttribute('aria-expanded', String(isOpen));
      row.classList.toggle('is-open', isOpen);
    };
    const flip = () => {
      const isOpen = !open.steps.has(index);
      if (isOpen) open.steps.add(index); else open.steps.delete(index);
      paintOpen(isOpen);
      if (isOpen) {
        detail = stepDetail(entry, step, index);
        row.after(detail);
      } else if (detail) {
        detail.remove();
        detail = null;
      }
    };
    row.addEventListener('click', (ev) => {
      // A click inside the opened trees is theirs; the row and its button open and close the step.
      if (ev.target.closest('.debug-step-detail')) return;
      flip();
    });
    paintOpen(false);
    return { row, open: () => { if (open.steps.has(index)) { paintOpen(true); detail = stepDetail(entry, step, index); row.after(detail); } } };
  }

  function stepsTable(entry, model) {
    const open = openFor(entry);
    const wrap = node('div', 'debug-steps-wrap');
    if (!model.steps.length) {
      wrap.appendChild(node('div', 'notice', 'The answer lists no steps.'));
      return wrap;
    }
    const table = node('table', 'debug-steps');
    const head = node('tr');
    [['#', 'Position in the run order'], ['Element', 'The element of the procedure'], ['Type', 'What kind of element it is'],
      ['Status', 'How the element ended'], ['Elapsed', 'Time the element took'], ['CPU', 'CPU time the element used'],
      ['Share', 'Time as a share of the slowest step']].forEach(([title, tip], index) => {
      const cell = node('th', index === 6 ? 'debug-barcell' : undefined, title);
      cell.title = tip;
      head.appendChild(cell);
    });
    const thead = node('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const body = node('tbody');
    const slowest = slowestStep(model.steps);
    const filter = state.detailFilter;
    const rows = model.steps.map((step, index) => (stepMatches(step, filter) ? stepRow(entry, step, index, open, slowest) : null)).filter(Boolean);
    if (!rows.length) {
      wrap.appendChild(node('div', 'notice', `No step matches "${filter}".`));
      return wrap;
    }
    rows.forEach((made) => { body.appendChild(made.row); made.open(); });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  /* -------------------------------------------------------------- log */

  function logLine(line) {
    const item = node('li', `debug-line is-${line.kind}`);
    const at = node('span', 'debug-at', offsetText(line, state.timeFormat));
    if (line.at) at.title = line.at;
    item.appendChild(at);
    item.appendChild(node('span', 'debug-text', lineShown(line, Mask.on())));
    if (line.kind === 'query') {
      const copy = node('button', 'debug-copy', 'Copy');
      copy.type = 'button';
      copy.title = 'Copy this query (the SOQL). Honours Mask values.';
      copy.setAttribute('aria-label', 'Copy query');
      copy.addEventListener('click', () => {
        const soql = queryOf(line);
        copyWithToast(Mask.on() ? maskQuery(soql) : soql, 'Copied query');
      });
      item.appendChild(copy);
    }
    return item;
  }

  function logSection(entry, model) {
    if (!model.log.length) return null;
    return section(entry, 'log', logSummary(model.log.length), model.log.length <= LOG_FOLD_AT, (content) => {
      const list = node('ol', 'debug-lines');
      model.log.forEach((line) => list.appendChild(logLine(line)));
      content.appendChild(list);
    }, { count: model.log.length });
  }

  /* The Debug log view: the whole log at full height, a line of totals, and
   * chips that narrow it by the kind of line (none pressed shows all). The
   * pane's filter box narrows it by text. A chip changes the list in place. */
  function logView(entry, model) {
    const open = openFor(entry);
    const wrap = node('div', 'debug-log-view');
    const stats = node('div', 'debug-log-stats', logStatsText(logStats(model.log), state.timeFormat));
    stats.title = 'Lines, queries and the time the queries took, from the log';
    wrap.appendChild(stats);

    const list = node('ol', 'debug-lines');
    const note = node('div', 'notice');
    const paintList = () => {
      list.textContent = '';
      const shown = visibleLog(model.log, open.chips, state.detailFilter, Mask.on());
      shown.forEach((line) => list.appendChild(logLine(line)));
      note.hidden = shown.length > 0;
      note.textContent = shown.length ? '' : 'No line of the log matches.';
    };

    const chips = logChips(model.log);
    if (chips.length) {
      const bar = node('div', 'debug-chips');
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Kinds of log line to show');
      chips.forEach((chip) => {
        const button = node('button', 'debug-chip');
        button.type = 'button';
        button.append(chip.label, node('span', 'debug-chip-count', ` ${chip.count}`));
        button.title = `${chip.title}. Press again to show every line.`;
        button.setAttribute('aria-pressed', String(open.chips.has(chip.id)));
        button.addEventListener('click', () => {
          if (open.chips.has(chip.id)) open.chips.delete(chip.id); else open.chips.add(chip.id);
          button.setAttribute('aria-pressed', String(open.chips.has(chip.id)));
          paintList();
        });
        bar.appendChild(button);
      });
      wrap.appendChild(bar);
    }
    wrap.append(list, note);
    paintList();
    return wrap;
  }

  /* ----------------------------------------------------------- views */

  /* The steps in view as a Markdown table, with the count when the filter
   * left some out; a filter that shows none says there is nothing to copy. */
  function copyTable(model) {
    const filter = state.detailFilter;
    const text = stepsMarkdown(model, state.timeFormat, { masked: Mask.on(), filter });
    if (!text) { toast('Nothing to copy'); return; }
    const shown = visibleSteps(model, filter).length;
    copyWithToast(text, filter.trim() ? `Copied table (${shown} of ${model.steps.length} rows)` : 'Copied table');
  }

  /* The picker, and the button that copies the steps as a table. */
  function viewBar(entry, model, views, current) {
    const bar = node('div', 'debug-viewbar');
    const label = node('label', 'debug-view-label', 'View');
    label.htmlFor = 'debug-view-select';
    const select = node('select', 'debug-view-select');
    select.id = 'debug-view-select';
    select.title = 'Which part of the debug run to show';
    const addOption = (parent, view) => {
      const option = node('option', undefined, view.label);
      option.value = view.id;
      option.selected = view.id === current;
      parent.appendChild(option);
    };
    views.filter((view) => view.kind !== 'element').forEach((view) => addOption(select, view));
    const elements = views.filter((view) => view.kind === 'element');
    if (elements.length) {
      const group = node('optgroup');
      group.label = 'Elements, in run order';
      elements.forEach((view) => addOption(group, view));
      select.appendChild(group);
    }
    select.addEventListener('change', () => showView(entry, select.value));
    bar.append(label, select);

    if (current === OVERVIEW && entry.debug === 'ip' && model.steps.length) {
      const table = node('button', 'debug-table-btn', 'Copy as table');
      table.type = 'button';
      table.title = 'Copy the steps in view as a Markdown table. Honours Mask values.';
      table.addEventListener('click', () => copyTable(model));
      bar.appendChild(table);
    }
    return bar;
  }

  /* The sections under the steps: what the Overview has always shown. */
  function overview(body, entry, model) {
    body.appendChild(headLine(entry, model));
    if (entry.debug === 'dr') {
      body.appendChild(treeSection(entry, 'output', 'Output', 'output', model.output, true));
      if (Object.keys(model.errors).length) body.appendChild(treeSection(entry, 'errors', 'Errors', 'errors', model.errors, true));
      if (Object.keys(model.created).length) body.appendChild(treeSection(entry, 'created', 'Created objects', 'created', model.created, false));
    } else {
      body.appendChild(stepsTable(entry, model));
      body.appendChild(treeSection(entry, 'response', 'Response', 'response', model.response, true));
      body.appendChild(treeSection(entry, 'input', 'Original input', 'input', model.originalInput, false));
    }
    const log = logSection(entry, model);
    if (log) body.appendChild(log);
  }

  /* The name of a tree view's root row. */
  function rootLabel(entry, view) {
    if (view.id === 'full') return fullDataLabel(entry);
    if (view.kind === 'element') return view.label;
    return { response: 'response', original: 'originalInput', output: 'output', errors: 'errors', created: 'created' }[view.id] || view.id;
  }

  /* ----------------------------------------------------------- render */

  function render(entry) {
    drawn = new Map();
    const body = node('div', 'detail-body debug-body');
    const { model, views } = cacheOf(entry);
    if (!model) {
      body.appendChild(node('div', 'notice', 'This call has no debug run to show.'));
      return body;
    }
    const open = openFor(entry);
    // A new filter text drops the toggles made while the last one was in force, as the other trees do.
    if (open.filter !== undefined && open.filter.trim().toLowerCase() !== state.detailFilter.trim().toLowerCase()) {
      Object.values(open.trees).forEach((own) => { own.filterOpen = new Map(); });
    }
    open.filter = state.detailFilter;

    const current = viewIdOf(entry);
    const view = views.find((one) => one.id === current);
    if (views.length > 1) body.appendChild(viewBar(entry, model, views, current));
    if (view.kind === 'overview') {
      overview(body, entry, model);
    } else if (view.kind === 'log') {
      body.appendChild(logView(entry, model));
    } else if (view.kind === 'element' && leftNothing(viewValue(entry, model, current))) {
      body.appendChild(node('div', 'notice', 'This element left nothing.'));
    } else {
      const host = node('div');
      body.appendChild(host);
      tree(host, entry, `view:${current}`, rootLabel(entry, view), viewValue(entry, model, current), { filter: state.detailFilter, collapsed: current === 'full' });
    }
    return body;
  }

  /* ----------------------------------------------- toolbar and copying */

  /* What Copy puts on the clipboard: the view shown, masked while the switch
   * is on. */
  function copyText(entry) {
    const model = modelOf(entry);
    if (!model) return '';
    const open = openFor(entry);
    return viewCopyText(entry, model, viewIdOf(entry), maskNow(), { chips: open.chips, filter: state.detailFilter, format: state.timeFormat });
  }

  const copyTitle = (entry) => viewCopyTitle(viewIdOf(entry));

  /* Whether Copy has nothing to copy on the view shown (the tab says so in a toast). */
  function copyEmpty(entry) {
    const model = modelOf(entry);
    return nothingToCopy(entry, model, viewIdOf(entry), { chips: openFor(entry).chips, filter: state.detailFilter });
  }

  /* Whether the view shown has trees to expand and collapse. */
  const hasTrees = (entry) => viewIdOf(entry) !== 'log';

  /* [id, value] of the trees on show. */
  const openTrees = () => [...drawn].filter(([, made]) => made.host.isConnected).map(([id, made]) => [id, made.value]);

  /* Expand and Collapse act on the trees that are open (drawn). */
  function expandAll(entry) {
    const open = openFor(entry);
    openTrees().forEach(([id, value]) => {
      const own = treeState(open, id, value);
      own.expanded = allPaths(value);
      own.filterOpen = new Map();
    });
    paint();
  }

  function collapseAll(entry) {
    const open = openFor(entry);
    openTrees().forEach(([id, value]) => {
      const own = treeState(open, id, value);
      own.expanded = new Set(['']);
      own.filterOpen = new Map([...allPaths(value)].filter((path) => path !== '').map((path) => [path, false]));
    });
    paint();
  }

  /* ---------------------------------------------------------- compare */

  const ranIn = (row, side) => (side === 'a' ? row.presence !== 'b-only' : row.presence !== 'a-only');

  const MISSING = 'This element did not run in this run';

  /* A status as the table shows it: with Mask values on, only a known word. */
  const statusText = (status) => (Mask.on() ? knownWordOrMasked(status) : status);

  function statusCell(status, present, show = true) {
    const cell = node('td', 'debug-cmp-status');
    if (!present) { cell.textContent = '—'; cell.title = MISSING; return cell; }
    if (!show) { cell.title = statusText(status); return cell; }
    if (status) cell.appendChild(node('span', tagClasses(statusTone(status)), statusText(status)));
    return cell;
  }

  function timeCell(ms, present = true) {
    if (!present) {
      const cell = node('td', 'debug-cmp-time', '—');
      cell.title = MISSING;
      return cell;
    }
    return node('td', 'debug-cmp-time', ms === null || ms === undefined ? '' : timeText(ms));
  }

  const RAN_TAGS = {
    ran: ['info', 'Skipped before, ran after'],
    skipped: ['neutral', 'Ran before, skipped after']
  };

  function deltaCell(delta, verdict, ranChange = '') {
    const cell = node('td', 'debug-cmp-delta');
    const text = deltaText(delta, state.timeFormat);
    cell.appendChild(document.createTextNode(text));
    const tag = (tone, word, title) => {
      const mark = node('span', tagClasses(tone), word);
      mark.title = title;
      if (cell.textContent) cell.append(' ');
      cell.append(mark);
    };
    if (verdict) {
      tag(verdict === 'slower' ? 'warn' : 'good', verdict,
        verdict === 'slower' ? 'After took at least 20% and 10 ms longer than before' : 'After took at least 20% and 10 ms less than before');
    }
    if (ranChange) tag(RAN_TAGS[ranChange][0], ranChange, RAN_TAGS[ranChange][1]);
    return cell;
  }

  /* The steps of two debug runs side by side, for the top of the Compare tab:
   * a row per element and a totals row. null unless both calls are debug runs of one kind. */
  function compareTable(entry, baseline) {
    if (!comparableRuns(entry, baseline)) return null;
    const first = modelOf(baseline);
    const second = modelOf(entry);
    if (!first || !second) return null;
    const result = compareDebugRuns(first, second);

    const wrap = node('div', 'debug-compare');
    wrap.appendChild(node('h3', 'diff-title', compareHeading(result, entry.debug)));

    // A table that scrolls sideways has to be reachable and named for the keyboard and a screen reader.
    const scroller = node('div', 'debug-steps-wrap');
    scroller.tabIndex = 0;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', 'Steps before and after');
    const table = node('table', 'debug-cmp');
    const head = node('tr');
    [['Element', 'The element of the procedure'], ['Status before', 'How the element ended in the baseline run'], ['Status after', 'How the element ended in this call'],
      ['Elapsed before', 'Time the element took in the baseline run'], ['Elapsed after', 'Time the element took in this call'],
      ['Delta', 'After minus before; slower or faster when it is at least 20% and 10 ms'], ['CPU delta', 'CPU time after minus before']].forEach(([title, tip]) => {
      const cell = node('th', undefined, title);
      cell.title = tip;
      head.appendChild(cell);
    });
    const thead = node('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    const body = node('tbody');
    result.rows.forEach((row) => {
      const tr = node('tr', `debug-cmp-row${rowDiffers(row) ? ' is-changed' : ''}`);
      tr.dataset.step = row.name;
      const name = node('td', 'debug-cmp-name', rowName(row));
      const note = presenceNote(row);
      if (note) name.title = `This element ran ${note}`;
      tr.appendChild(name);
      const showStatus = showCompareStatus(row.statusA, row.statusB);
      tr.appendChild(statusCell(row.statusA, ranIn(row, 'a'), showStatus));
      tr.appendChild(statusCell(row.statusB, ranIn(row, 'b'), showStatus));
      tr.appendChild(timeCell(row.elapsedA, ranIn(row, 'a')));
      tr.appendChild(timeCell(row.elapsedB, ranIn(row, 'b')));
      tr.appendChild(deltaCell(row.deltaMs, row.verdict, row.ranChange));
      tr.appendChild(node('td', 'debug-cmp-delta', deltaText(row.cpuDeltaMs, state.timeFormat)));
      body.appendChild(tr);
    });
    const totals = result.totals;
    const total = node('tr', 'debug-cmp-total');
    total.appendChild(node('td', 'debug-cmp-name', 'Total'));
    const showTotal = showCompareStatus(totals.statusA, totals.statusB);
    [totals.statusA, totals.statusB].forEach((status) => {
      const cell = node('td', 'debug-cmp-status');
      if (showTotal) cell.appendChild(node('span', tagClasses(status === 'Failed' ? 'bad' : 'good'), status));
      else cell.title = status;
      total.appendChild(cell);
    });
    total.appendChild(timeCell(totals.elapsedA));
    total.appendChild(timeCell(totals.elapsedB));
    total.appendChild(deltaCell(totals.deltaMs, totals.verdict));
    total.appendChild(node('td', 'debug-cmp-delta', deltaText(totals.cpuDeltaMs, state.timeFormat)));
    body.appendChild(total);
    table.appendChild(body);
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
  }

  /* What the Compare tab sets side by side under the steps of two
   * Integration Procedure runs: the procedure's Original input and its
   * Response, read from the runs, rather than the whole answers, whose debug
   * logs differ in every time. null for anything else (a Data Mapper run
   * compares as any call does). */
  function compareValues(entry, baseline) {
    if (!comparableRuns(entry, baseline) || entry.debug !== 'ip') return null;
    const first = modelOf(baseline);
    const second = modelOf(entry);
    if (!first || !second) return null;
    return [
      { title: 'Original input', before: first.originalInput, after: second.originalInput },
      { title: 'Response', before: first.response, after: second.response }
    ];
  }

  return { render, copyText, copyTitle, copyEmpty, hasTrees, expandAll, collapseAll, modelOf, viewIdOf, compareTable, compareValues };
}
