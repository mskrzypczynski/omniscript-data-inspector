'use strict';

/* "Compare payloads": pick two of the last payloads read and list what differs
 * between them. */

import { formatBytes } from '../../core/targets-model.js';
import { diffValues } from '../../core/diff.js';
import { diffLine } from '../diff-lines.js';
import { Mask } from '../mask-setting.js';

function snapshotLabel(snapshot) {
  return `${snapshot.time.toLocaleTimeString()} · ${formatBytes(snapshot.raw.length)}`;
}

/* From and To: what the user picked while it is still in the history, else the
 * last two reads. */
function comparePair(state) {
  const { history } = state;
  const newest = history[history.length - 1];
  const before = history[history.length - 2];
  return [
    history.includes(state.compareA) ? state.compareA : before,
    history.includes(state.compareB) ? state.compareB : newest
  ];
}

function parseSnapshot(snapshot) {
  try { return JSON.parse(snapshot.raw); } catch { return undefined; }
}

function pickerFor(state, labelText, chosen, onPick) {
  const label = document.createElement('label');
  label.className = 'field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.appendChild(span);
  const select = document.createElement('select');
  state.history.forEach((snapshot, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = snapshotLabel(snapshot) + (index === state.history.length - 1 ? ' (latest)' : '');
    select.appendChild(option);
  });
  select.value = String(state.history.indexOf(chosen));
  select.addEventListener('change', () => onPick(state.history[Number(select.value)]));
  label.appendChild(select);
  return label;
}

function diffList(result, a, b) {
  const list = document.createElement('div');
  list.className = 'compare-list';
  if (!result) {
    list.textContent = 'One of these reads is not valid JSON, so it cannot be compared.';
  } else if (!result.changes.length) {
    list.textContent = a === b ? 'Pick two different reads.' : 'These two reads are identical.';
  } else {
    result.changes.forEach((change) => list.appendChild(diffLine(change)));
    if (result.truncated) {
      const more = document.createElement('div');
      more.className = 'bar-note';
      more.textContent = 'Showing the first differences only.';
      list.appendChild(more);
    }
  }
  return list;
}

/* state: { history, compareOpen, compareA, compareB, compareSig }
 * els: { panel, toggle }; on: { copy(text, button, label) } */
export function renderComparePanel(els, state, on) {
  const { panel, toggle } = els;
  panel.hidden = !state.compareOpen;
  toggle.classList.toggle('is-on', state.compareOpen);
  if (!state.compareOpen) return;

  const [a, b] = comparePair(state);
  const signature = [state.history.length, state.history.at(-1) && state.history.at(-1).raw.length,
    a && a.time.getTime(), b && b.time.getTime()].join('|');
  if (signature === state.compareSig && panel.childElementCount) return;
  state.compareSig = signature;

  const redraw = () => { state.compareSig = ''; renderComparePanel(els, state, on); };

  panel.textContent = '';
  const head = document.createElement('div');
  head.className = 'bar';
  const title = document.createElement('span');
  title.className = 'bar-label';
  title.textContent = 'Compare payloads';
  head.appendChild(title);

  if (state.history.length < 2) {
    const note = document.createElement('span');
    note.className = 'bar-note';
    note.textContent = 'Needs two different reads — change something in the OmniScript and it will appear here.';
    head.appendChild(note);
    panel.appendChild(head);
    return;
  }

  head.appendChild(pickerFor(state, 'From', a, (snapshot) => { state.compareA = snapshot; redraw(); }));
  head.appendChild(pickerFor(state, 'To', b, (snapshot) => { state.compareB = snapshot; redraw(); }));

  const before = parseSnapshot(a);
  const after = parseSnapshot(b);
  const result = before === undefined || after === undefined ? null : diffValues(before, after);

  const copy = document.createElement('button');
  copy.className = 'icon-btn tiny';
  copy.textContent = 'Copy diff';
  copy.disabled = !result || !result.changes.length;
  copy.addEventListener('click', () => {
    const changes = result.changes.map((change) => ({
      ...change, before: Mask.apply(change.before), after: Mask.apply(change.after)
    }));
    on.copy(JSON.stringify(changes, null, 2), copy, 'Copy diff');
  });
  head.appendChild(copy);

  const close = document.createElement('button');
  close.className = 'icon-btn tiny';
  close.textContent = 'Close';
  close.addEventListener('click', () => { state.compareOpen = false; renderComparePanel(els, state, on); });
  head.appendChild(close);

  panel.appendChild(head);
  panel.appendChild(diffList(result, a, b));
}
