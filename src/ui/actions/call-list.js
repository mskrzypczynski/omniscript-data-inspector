'use strict';

/* The Calls tab's call list: a header, one row per call, the banner
 * that says when the filters leave nothing to show, and the empty state. */

import { decorateButton } from '../icons.js';
import { KIND_LABEL, CHAINABLE_LABEL, failureReason, failed, verdictOf } from '../../core/shared/actions-model.js';
import { markState } from '../../core/actions/actions-selection.js';
import { tookText, tookTitle, batchTag } from '../../core/shared/actions-timing.js';
import { formatTime } from '../../core/shared/time-format.js';
import { chainFailure, chainVerdict, chainTag, callPlace } from '../../core/actions/actions-chains.js';
import { repeatLabel, repeatTitle } from '../../core/actions/actions-repeats.js';
import { stepAt, payloadSnippet } from '../../core/shared/actions-search.js';
import { sessionText } from '../../core/actions/actions-import.js';
import { resultTitle } from '../../core/actions/actions-detail.js';
import { enhanceList } from '../listbox.js';
import { bundleHint } from '../notice.js';
import { noMatchNotice } from '../empty-notice.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { fitTags, tagsTitle, tookTail } from '../../core/actions/option-tags.js';
import { testTags } from '../../core/actions/test-calls.js';
import { Features } from '../features.js';
import { Page } from '../page.js';

/* What the filter box takes besides words, said on the card that shows when nothing matches. */
const FILTER_PREFIXES = 'The filter box also takes in:text (payload), url:text, step:text, slow:800 (calls that took at least 800 ms; slow: alone uses the threshold from Settings) and repeat:';
const FILTER_PREFIXES_FREE = 'The filter box also takes in:text (payload), url:text, step:text and repeat:';

/* The Action header's tooltip: what the name is, and what the small tags
 * around it stand for. */
const ACTION_LEGEND = 'Data Mapper bundle, Integration Procedure key, or Apex class and method\n' +
  'DR Data Mapper (DataRaptor) · IP Integration Procedure · RA Remote Action · chainable / queueable chain / no cache options · repeat ×N the same call again · chain · N calls a procedure that ran as several calls';

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

/* Nothing captured yet: a calm empty state with one way forward. Calls made
 * before DevTools opened are not visible, so reloading with the panel open is
 * the thing that helps most often; it is a plain button, not the primary one,
 * because waiting for the user's own clicks works just as well. */
function firstRunNotice(recording, session) {
  const box = document.createElement('div');
  box.className = 'notice is-empty';
  const heading = document.createElement('h2');
  if (session) {
    // A file with no calls: reloading the page would not change it.
    heading.textContent = sessionText(session.name);
    box.appendChild(heading);
    const line = document.createElement('p');
    line.textContent = 'This file holds no calls.';
    box.appendChild(line);
    return box;
  }
  heading.textContent = recording ? 'No calls captured yet' : 'Recording is paused';
  box.appendChild(heading);
  (recording ? [
    'Calls are captured only while DevTools is open, as the page makes them.',
    'Reload with the panel open to capture what happens while the page loads.',
  ] : [
    'No calls are being captured. Click Paused in the toolbar to start again.'
  ]).forEach((text) => {
    const line = document.createElement('p');
    line.textContent = text;
    box.appendChild(line);
  });
  if (!recording) return box;
  const reload = document.createElement('button');
  reload.className = 'icon-btn';
  reload.id = 'log-reload';
  decorateButton(reload, 'refresh', 'Reload page to capture from the start');
  reload.title = 'Reloads the inspected page. Captured calls are kept unless Clear on reload is on.';
  reload.addEventListener('click', () => Page.reload());
  box.appendChild(reload);
  /* Only where debug bundles exist: the Free build has none to point at. */
  if (Features.has('shell.bundle')) box.appendChild(bundleHint());
  return box;
}

/* The cell of option tags: as wide as its tags (up to a limit) and right-aligned,
 * so the name takes the room that is left and the cells after it start at one
 * x in every row. It holds two sets of tags, a wider and a two-tag one, and the
 * stylesheet shows the one that fits the panel (neither below 560 px, where the
 * row says a repeat after its time instead). The whole cell's tooltip names
 * every tag. tags: [{ label, title, tone, extra? }]. */
function tagsCell(tags, selectTag) {
  const box = document.createElement('span');
  box.className = 'log-tags';
  if (!tags.length) return box;
  box.title = tagsTitle(tags);
  [['tags-wide', fitTags(tags)], ['tags-narrow', fitTags(tags, { maxTags: 3, maxChars: 20 })]].forEach(([className, fit]) => {
    const set = document.createElement('span');
    set.className = className;
    fit.shown.forEach((tag) => {
      const pill = cell(`${tagClasses(tag.tone)} tag-opt${tag.extra ? ` ${tag.extra}` : ''}`, tag.label);
      pill.title = tag.title;
      /* The tag of a re-run selects the call it was sent again from: a button
       * in the cell, out of the Tab order like the row's other controls. */
      if (tag.select !== null && tag.select !== undefined && selectTag) {
        const link = document.createElement('button');
        link.type = 'button';
        link.tabIndex = -1;
        link.className = `${pill.className} tag-link`;
        link.textContent = tag.label;
        link.title = tag.title;
        link.addEventListener('click', (ev) => { ev.stopPropagation(); selectTag(tag.select); });
        set.appendChild(link);
        return;
      }
      set.appendChild(pill);
    });
    if (fit.more) {
      const more = cell(`${tagClasses('neutral')} tag-opt tag-more`, `+${fit.more}`);
      more.title = fit.moreTitle;
      set.appendChild(more);
    }
    box.appendChild(set);
  });
  return box;
}

/* The checkbox at the start of a row or of the header. It is out of the Tab
 * order on rows (the row is the one stop; x marks it from the keyboard). */
function checkbox(label, tabbable) {
  /* Without Select calls the cell stays, empty, because the list's grid has a column for it. */
  if (!Features.has('calls.select')) {
    const gap = document.createElement('span');
    gap.className = 'log-check-gap';
    gap.setAttribute('aria-hidden', 'true');
    return gap;
  }
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'log-check';
  box.setAttribute('aria-label', label);
  if (!tabbable) box.tabIndex = -1;
  return box;
}

/* The list is a grid: a row of cells. Every child of a row is a cell, and a
 * control (the tick box, a chain's chevron) sits inside one, so the controls
 * are not "inside" an option, where a screen reader cannot reach them. The
 * wrapper takes no space of its own (display: contents in the CSS). */
function asCells(row, role) {
  Array.from(row.children).forEach((child) => {
    if (/^(INPUT|BUTTON)$/.test(child.tagName)) {
      const wrap = document.createElement('span');
      wrap.className = 'cell-wrap';
      wrap.setAttribute('role', role);
      row.replaceChild(wrap, child);
      wrap.appendChild(child);
    } else {
      child.setAttribute('role', role);
    }
  });
  return row;
}

function header(onMarkAll) {
  const row = document.createElement('div');
  row.className = 'list-row list-head log-row log-head';
  const all = checkbox('Select all visible calls', true);
  if (Features.has('calls.select')) {
    all.title = 'Select every visible call, or clear the selection.';
    all.addEventListener('click', (ev) => { ev.stopPropagation(); onMarkAll(all.checked); });
  }
  row.appendChild(all);
  const columns = [
    ['log-time', 'Started', 'Clock time the request left the browser'],
    ['tag', '', 'Call type'],
    ['list-name log-name', 'Call', ACTION_LEGEND],
    ['log-tags', '', 'Options the call was made with, and repeat or stopped early'],
    ['log-ms', 'Took', 'Round trip: request sent to response fully received, in milliseconds unless Time format in Settings says seconds. Hover a figure for where the time went.'],
    ['log-result tag pill', 'Result', 'Whether the response carried an error: ✓ succeeded, ✕ failed, – nothing useful came back. Hover a result for the word and the HTTP status.']
  ];
  columns.forEach(([className, text, title]) => {
    row.appendChild(Object.assign(cell(className, text), { title }));
  });
  asCells(row, 'columnheader');
  return row;
}

/* state: the tab's state. el: { list, notes }.
 * deps: onRowClick(entry, ev) a click on a row, showAll() clears every filter,
 * onMark(entry, shift) a click on a row's checkbox, onMarkAll(on) the header
 * checkbox, onMarkKey(id) the x key on a row, onBaselineKey(id) the b key,
 * onContext(entry, ev) the right-click menu of a row,
 * onChainClick(group, ev) a click on a chain's row, onChainToggle(group) its
 * chevron (or the arrow keys), onMarkChain(group) its checkbox (or x),
 * isOpen(group) whether its calls are showing, hiddenNotice() the line for a
 * call the panel sent that a filter hides ({ text, onShowAll }) or null,
 * afterDraw() runs once the rows are in (the tab refreshes the detail pane and
 * the status bar there), context() what a draw depends on besides the rows:
 * { visits, mask, masked, parsed } (the step timeline, the function that masks
 * a value or undefined, whether masking is on, the parsed filter box, and the
 * repeats: Map of call id -> { ofId, count }). */
export function createCallList({
  state, el, onRowClick, showAll, onMark, onMarkAll, onMarkKey, onBaselineKey, onContext, afterDraw, context,
  onChainClick, onChainToggle, onMarkChain, isOpen, onTagSelect, hiddenNotice = () => null
}) {
  let listbox = null;
  let shown = []; // the calls drawn last
  const chainsDrawn = new Map(); // chain id -> its row of the model, for the ticks and the keys

  /* Calls were captured but the filters show none: one line in the list's
   * place, as the other tabs draw it, with a button that clears every filter
   * (text, failed only and All Apex calls off). */
  function noMatchLine() {
    return noMatchNotice({ things: 'calls', query: state.filter, onClear: showAll, hint: Features.has('calls.analysis') ? FILTER_PREFIXES : FILTER_PREFIXES_FREE });
  }

  function renderRow(entry, ctx, hop = null) {
    const row = document.createElement('div');
    row.className = 'list-row log-row';
    if (hop) row.classList.add('is-hop');
    row.dataset.rowKey = String(entry.id);
    if (entry.id === state.selectedId) row.classList.add('is-selected');
    if (failed(entry)) row.classList.add('is-failed');
    if (entry.id === state.compareId) row.classList.add('is-baseline');
    if (entry.id === state.menuRow) row.classList.add('is-menu');

    const mark = checkbox(`Select call ${entry.name}`, false);
    if (Features.has('calls.select')) {
      mark.title = 'Select this call to add up its time (Shift-click for a range)';
      mark.addEventListener('click', (ev) => { ev.stopPropagation(); onMark(entry, ev.shiftKey); });
    }
    row.appendChild(mark);

    const why = failureReason(entry, false, ctx.mask);
    const visit = stepAt(ctx.visits, entry.time.getTime());
    const stepName = visit ? (visit.name || visit.key) : '';

    const started = cell('log-time', entry.time.toLocaleTimeString());
    started.title = `Request started at ${entry.time.toLocaleTimeString()}`;
    row.appendChild(started);

    const tag = cell(`${tagClasses(entry.type.toLowerCase())} tag-${entry.type.toLowerCase()}`, entry.type === 'APEX' ? 'Apex' : entry.type);
    tag.title = KIND_LABEL[entry.type];
    row.appendChild(tag);

    /* A call of a chain says which one it is and when, not the chain's name
     * again (the row above it has that; the tooltip keeps it). The clock shows
     * here only where the Started column is gone (a narrow list). */
    const name = cell('list-name log-name', hop ? '' : entry.name);
    if (hop) {
      const total = hop.group.hops.length;
      const number = cell('hop-no', callPlace(hop.number, total));
      number.title = `Call ${hop.number} of the ${total} this chained procedure ran as`;
      name.append(number, cell('hop-clock', entry.time.toLocaleTimeString()));
    }
    const startedLine = hop ? `Started at ${entry.time.toLocaleTimeString()}\n` : '';
    /* A long name is cut with … in the cell; the tooltip has all of it. */
    name.title = `${startedLine}${entry.signature.includes(entry.name) ? '' : `${entry.name}\n`}${KIND_LABEL[entry.type]} — ${entry.signature}` +
      `${stepName ? `\nStep: ${stepName}` : ''}${why ? `\n\nMarked as failed: ${why}` : ''}`;
    if (ctx.parsed.inPayload) {
      const snippet = payloadSnippet(entry, ctx.parsed.inPayload, ctx.masked);
      if (snippet) name.appendChild(Object.assign(cell('log-snippet', snippet), { title: snippet }));
    }
    row.appendChild(name);

    const tags = [];
    const repeat = ctx.repeats && ctx.repeats.get(entry.id);
    const original = repeat && ctx.byId && ctx.byId.get(repeat.ofId);
    if (repeat && original) {
      tags.push({ label: repeatLabel(repeat), title: repeatTitle(original.time.toLocaleTimeString()), tone: 'warn', extra: 'tag-repeat' });
    }
    /* A call the panel sent says so, and a re-run says which call it was. */
    if (Features.has('calls.test')) {
      testTags(entry, { clock: (time) => new Date(time).toLocaleTimeString(), byId: ctx.byId, short: true }).forEach((tag) => {
        tags.push({ ...tag, extra: 'tag-test' });
      });
    }
    /* The chain tag belongs on the chain's own row, not on its calls. */
    (entry.flags || []).forEach((flag) => {
      if (hop && flag.label === CHAINABLE_LABEL) return;
      tags.push({ label: flag.label, title: flag.title, tone: 'neutral' });
    });
    /* A request that carried several actions: the time is the request's, said
     * here instead of in the Took cell, which holds only the time. */
    const batch = batchTag(entry);
    if (batch) tags.push(batch);
    row.appendChild(tagsCell(tags, onTagSelect));
    if (tags.length) name.title += `\n\nOptions:\n${tagsTitle(tags)}`;

    const took = cell('log-ms', tookText(entry, state.timeFormat));
    /* A shared request's ×N, said after the time when the list is too narrow for
     * the tag column. */
    const tail = tookTail(tags);
    if (tail) took.dataset.tail = tail;
    if (state.slowMs > 0 && entry.duration >= state.slowMs) took.classList.add('is-slow');
    took.title = tookTitle(entry, state.timeFormat);
    row.appendChild(took);

    /* The Result is its glyph (✓ green, ✕ red, – grey), at every width: a column
     * that needs only a glyph is narrow and the Took column gets the room. The
     * word (SUCCESS, ERROR, No response, No body) stays in the pill's text, for
     * whatever reads it, and heads its tooltip with the HTTP status, a second
     * fact that cannot contradict the verdict: the code describes the transport,
     * the verdict describes the payload. The verdict comes from the same check
     * that colours the row, which is why Aura's own "SUCCESS" is not shown here:
     * it reports neither. */
    const result = verdictOf(entry, why);
    const verdict = cell(`${tagClasses(result.tone)} pill`, result.text);
    verdict.classList.add(`is-${result.tone}`);
    verdict.title = resultTitle(entry, result.text, why);
    const resultCell = document.createElement('span');
    resultCell.className = 'log-result';
    resultCell.appendChild(verdict);
    row.appendChild(resultCell);

    row.addEventListener('click', (ev) => onRowClick(entry, ev));
    row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onContext(entry, ev); });
    return asCells(row, 'gridcell');
  }

  /* A chained Integration Procedure as one row: its first visible call's time,
   * the result of the last call (red when any failed), the calls' round trips
   * added up, and the "chain · 3 calls" tag. The chevron opens its calls below it. */
  function renderChain(item, ctx, byId) {
    const { group, hops, total } = item;
    const hopEntries = group.hops.map((id) => byId.get(id)).filter(Boolean);
    const open = isOpen(group);
    const row = document.createElement('div');
    row.className = 'list-row log-row log-chain';
    row.dataset.rowKey = group.id;
    row.dataset.chain = group.id;
    if (group.id === state.selectedId) row.classList.add('is-selected');
    if (group.failed) row.classList.add('is-failed');

    const mark = checkbox(`Select the ${total} calls of ${group.name}`, false);
    if (Features.has('calls.select')) {
      mark.title = 'Select every call of this chain to add up its time (or press x on the row)';
      mark.addEventListener('click', (ev) => { ev.stopPropagation(); onMarkChain(group); });
    }
    row.appendChild(mark);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chain-toggle';
    toggle.tabIndex = -1;
    toggle.textContent = open ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} the ${total} calls of ${group.name}`);
    toggle.title = `${open ? 'Hide' : 'Show'} the calls (${open ? 'Left' : 'Right'} arrow)`;
    toggle.addEventListener('click', (ev) => { ev.stopPropagation(); onChainToggle(group); });

    const first = hops[0] || hopEntries[0];
    row.appendChild(Object.assign(cell('log-time', first.time.toLocaleTimeString()), {
      title: `First call started at ${first.time.toLocaleTimeString()}`
    }));

    const tag = cell(`${tagClasses('ip')} tag-ip`, 'IP');
    tag.title = KIND_LABEL.IP;
    row.appendChild(tag);

    const name = cell('list-name log-name', '');
    const glyph = cell('chain-glyph', '⛓');
    glyph.setAttribute('aria-hidden', 'true');
    name.append(toggle, glyph, document.createTextNode(` ${group.name}`));
    name.title = `Chained ${KIND_LABEL.IP} — ${group.key}\n${total} calls to the same procedure, each continuing the last`;
    row.appendChild(name);

    const stoppedTitle = 'The last call\'s answer says the chain goes on, but no further call followed within 30 seconds';
    row.appendChild(tagsCell([chainTag(group), ...(group.stoppedEarly ? [{ label: 'stopped early', title: stoppedTitle, tone: 'warn' }] : [])]));
    if (group.stoppedEarly) name.title += `\n\nStopped early: ${stoppedTitle}`;

    const took = cell('log-ms', formatTime(group.durationMs, state.timeFormat));
    if (state.slowMs > 0 && group.durationMs >= state.slowMs) took.classList.add('is-slow');
    took.title = `The ${total} calls' round trips added up. From the first start to the last end: ${formatTime(group.spanMs, state.timeFormat)}.`;
    row.appendChild(took);

    const why = chainFailure(hopEntries, ctx.mask);
    const result = chainVerdict(group, hopEntries);
    const verdict = cell(`${tagClasses(result.tone)} pill is-${result.tone}`, result.text);
    verdict.title = `${result.text}\n${why || 'No error found in the last call\'s response'}`;
    const resultCell = document.createElement('span');
    resultCell.className = 'log-result';
    resultCell.appendChild(verdict);
    row.appendChild(resultCell);

    row.addEventListener('click', (ev) => onChainClick(group, ev));
    return asCells(row, 'gridcell');
  }

  /* One line above the rows: a call the panel sent is listed, but a filter
   * keeps it out. Same style as the other notices; the button clears the
   * filters, as the jump from another tab does. */
  function hiddenLine(found) {
    const box = document.createElement('div');
    box.className = 'notice is-one-line sent-hidden-card';
    box.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = found.text;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn tiny';
    button.textContent = 'Show all';
    button.title = 'Clear every filter, so the call you sent has a row';
    button.setAttribute('data-help', 'Filter');
    button.addEventListener('click', found.onShowAll);
    box.append(text, button);
    return box;
  }

  /* The notices sit in #log-notes, which is the first thing inside the list
   * pane (not above the split), so they never run over the detail beside it. */
  function draw(rows, model) {
    const list = el.list;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
    list.textContent = '';
    el.notes.textContent = '';
    list.appendChild(el.notes);

    shown = rows;
    if (!rows.length) {
      el.notes.appendChild(state.entries.length ? noMatchLine() : firstRunNotice(state.recording, state.session));
      afterDraw();
      return;
    }

    const sentHidden = hiddenNotice();
    if (sentHidden) el.notes.appendChild(hiddenLine(sentHidden));

    const ctx = context();
    const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
    ctx.byId = byId;
    chainsDrawn.clear();
    list.appendChild(header(onMarkAll));
    model.forEach((item) => {
      if (item.kind === 'chain') {
        chainsDrawn.set(item.group.id, item);
        list.appendChild(renderChain(item, ctx, byId));
      } else {
        list.appendChild(renderRow(item.entry, ctx, item.kind === 'hop' ? item : null));
      }
    });
    paintMarks();

    if (atBottom) list.scrollTop = list.scrollHeight;
    afterDraw();
  }

  /* Puts the marks into the rows already drawn, so ticking a box changes the
   * boxes and nothing else: no rebuild, no lost focus or scroll. */
  function paintMarks() {
    // With any call ticked every box shows, so ticking more is one click each.
    el.list.classList.toggle('has-marks', state.marked.size > 0);
    const rows = el.list.querySelectorAll('.log-row:not(.log-head)');
    rows.forEach((row) => {
      /* A chain is ticked when all of its shown hops are, and half-ticked when some are. */
      const chain = chainsDrawn.get(row.dataset.chain);
      const hops = chain ? markState(chain.hops.map((hop) => hop.id), state.marked) : null;
      const on = chain ? hops === 'all' : state.marked.has(Number(row.dataset.rowKey));
      row.classList.toggle('is-marked', on);
      // A marked row is part of the multiple selection, whether or not it is the open one.
      // Ticked, half-ticked: that is the tick box's own state, which it exposes itself.
      row.setAttribute('aria-selected', String(on || row.classList.contains('is-selected')));
      const box = row.querySelector('.log-check');
      if (!box) return;
      box.checked = on;
      box.indeterminate = hops === 'some';
    });

    const all = el.list.querySelector('.log-head .log-check');
    if (!all) return;
    const now = markState(shown.map((entry) => entry.id), state.marked);
    all.checked = now === 'all';
    all.indeterminate = now === 'some';
  }

  /* x on a row, Space on its checkbox: the keyboard way to mark. b sets the
   * row as the baseline the open call is compared with. */
  function onKey(ev, row) {
    const chain = chainsDrawn.get(row.dataset.chain);
    /* Right opens a chain's calls and Left closes them (the tree convention). */
    if (chain && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      if ((ev.key === 'ArrowRight') === isOpen(chain.group)) return false;
      onChainToggle(chain.group);
      return true;
    }
    if (ev.key === 'b') {
      if (chain || !Features.has('calls.compare')) return false;
      onBaselineKey(Number(row.dataset.rowKey));
      return true;
    }
    const onBox = ev.target.classList && ev.target.classList.contains('log-check');
    if (!Features.has('calls.select') || (ev.key !== 'x' && !(onBox && ev.key === ' '))) return false;
    if (chain) onMarkChain(chain.group);
    else onMarkKey(Number(row.dataset.rowKey));
    return true;
  }

  function mount() {
    listbox = enhanceList(el.list, { role: 'listbox', label: 'Calls', onKey, multiselectable: true });
    el.list.setAttribute('role', 'grid');
  }

  /* enhanceList makes every row an option; this list is a grid (see asCells), so
   * its rows are rows, and its header is a row too, with the column headers
   * and the select-all box in it, in reach of a screen reader. */
  function gridRows() {
    el.list.querySelectorAll('.log-row').forEach((row) => {
      row.setAttribute('role', 'row');
      row.removeAttribute('aria-checked');
    });
    const head = el.list.querySelector('.log-head');
    if (head) {
      head.removeAttribute('aria-hidden');
      head.removeAttribute('aria-selected');
    }
  }

  /* rows: the calls the filters let through, worked out once by the caller.
   * model: what to draw for them (core chainRows: calls, chains and hops). */
  function render(rows, model = rows.map((entry) => ({ kind: 'call', entry }))) {
    listbox.around(() => draw(rows, model));
    gridRows();
    paintMarks();
  }

  return { mount, render, paintMarks };
}
