'use strict';

/* The Timeline, in the detail pane while no element is selected:
 * one row per visit to a step with when it began, how long the script stayed,
 * a thin bar for that time with a tick for every captured call that started
 * during it, and the size of the last payload read then. The numbers come from
 * core/structure/step-timeline.js timelineModel; this file only draws them.
 *
 * It is a table, so the figures are there for a screen reader and for copying;
 * the bar and ticks are the picture. The row being lived through grows every
 * pulse: it is painted in place, and the rows are rebuilt only when their
 * structure changes (a visit ended, a call or a payload arrived). */

import { timelineModel, timelineSignature } from '../../core/structure/step-timeline.js';
import { formatTime } from '../../core/shared/time-format.js';
import { formatBytes } from '../../core/shared/targets-model.js';
import { Shared } from '../shared.js';
import { PayloadHistory } from '../payload-history.js';
import { Settings } from '../settings.js';

const clock = (ms) => new Date(ms).toLocaleTimeString();

/* state: the tab's state (visits, detailTimeline). deps: jump(key) selects a step. */
export function createTimelineView({ state, jump }) {
  const build = () => timelineModel(state.visits, Shared.calls(), PayloadHistory.list(), Date.now());
  const signature = (model) => `${Settings.get('timeFormat')}|${timelineSignature(model)}`;

  /* Has the model changed in more than the length of the visit going on? */
  function changed() {
    return signature(build()) !== state.detailTimeline;
  }

  function cell(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function placeTicks(fill, row) {
    [...fill.children].forEach((tick, i) => { tick.style.left = `${(row.ticks[i].at * 100).toFixed(2)}%`; });
  }

  /* The parts of a row that move while the visit is on: the length and the bar. */
  function paint(tr, row) {
    const format = Settings.get('timeFormat');
    const time = tr.querySelector('.tl-time');
    const text = formatTime(row.ms, format);
    if (time.textContent !== text) time.textContent = text;
    const fill = tr.querySelector('.tl-fill');
    fill.style.setProperty('--w', `${(row.share * 100).toFixed(2)}%`);
    placeTicks(fill, row);
  }

  function drawRow(row) {
    const tr = document.createElement('tr');
    tr.className = `tl-row${row.open ? ' is-open' : ''}`;

    const name = cell('th', 'tl-name');
    name.scope = 'row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jump-link';
    button.textContent = row.name;
    button.title = 'Select this step';
    button.addEventListener('click', () => jump(row.key));
    name.appendChild(button);
    if (row.open) name.appendChild(cell('span', 'tl-now', ' (now)'));
    tr.appendChild(name);

    const start = cell('td', 'tl-start', clock(row.from));
    start.title = new Date(row.from).toLocaleString();
    tr.appendChild(start);
    tr.appendChild(cell('td', 'tl-time'));

    const barCell = cell('td', 'tl-barcell');
    const bar = cell('span', 'tl-bar');
    const fill = cell('span', 'tl-fill');
    row.ticks.forEach((tick) => {
      const mark = cell('span', 'tl-tick');
      mark.title = tick.name ? `Call: ${tick.name}` : 'A call started here';
      fill.appendChild(mark);
    });
    bar.appendChild(fill);
    barCell.appendChild(bar);
    if (row.callCount) {
      barCell.appendChild(cell('span', 'tl-count', `${row.callCount} ${row.callCount === 1 ? 'call' : 'calls'}`));
    }
    tr.appendChild(barCell);

    const size = cell('td', 'tl-size', row.bytes === null ? '–' : formatBytes(row.bytes));
    size.title = row.bytes === null
      ? 'No payload was read during this visit'
      : 'Size of the last payload read during this visit';
    tr.appendChild(size);

    paint(tr, row);
    return tr;
  }

  function render(pane) {
    const model = build();
    state.detailTimeline = signature(model);

    const head = cell('div', 'detail-head');
    head.appendChild(cell('div', 'detail-title', 'Timeline'));
    head.appendChild(cell('div', 'detail-meta',
      'Where the script has been, oldest first. Select an element in the list to see its details here.'));
    pane.appendChild(head);

    const body = cell('div', 'detail-body');
    if (model.hidden) {
      body.appendChild(cell('div', 'tab-lede', `${model.hidden} older ${model.hidden === 1 ? 'visit is' : 'visits are'} not listed.`));
    }

    const table = cell('table', 'tl-table');
    table.setAttribute('aria-label', 'Step timeline');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    [['Step', ''], ['Started', ''], ['Time', ''], ['Calls', 'Bar: time on the step, the longest visit full width. Ticks: calls that started during it.'],
      ['Payload', 'Size of the last payload read during the visit']].forEach(([text, title]) => {
      const th = cell('th', '', text);
      th.scope = 'col';
      if (title) th.title = title;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    model.rows.forEach((row) => tbody.appendChild(drawRow(row)));
    table.appendChild(tbody);
    body.appendChild(table);
    pane.appendChild(body);
  }

  /* The clock keeps running: repaint the lengths and bars in place. */
  function repaint(root) {
    const model = build();
    const rows = [...root.querySelectorAll('.tl-table tbody tr')];
    if (rows.length !== model.rows.length) return;
    rows.forEach((tr, i) => paint(tr, model.rows[i]));
  }

  return { render, changed, repaint };
}
