'use strict';

/* "Compare data": pick two of the last reads of the data and set them side by
 * side (src/ui/compare-view.js), or list what differs. */

import { decorateButton } from '../icons.js';
import { formatBytes } from '../../core/shared/targets-model.js';
import { createCompareView } from '../compare-view.js';
import { Mask } from '../mask-setting.js';
import { toast } from '../toast.js';
import { addImported, isJsonText, snapshotChoices, defaultPair, MAX_CHARS } from '../../core/shared/history.js';
import { sinceStepEntry, stepStamp } from '../../core/shared/step-stamp.js';
import { agoText, sinceStepReason } from '../../core/data/compare-text.js';

/* Step2 · 12:01:03 · 4.2 KB · 12 s ago: the step the script was on when it was
 * read comes first, since that is what tells two reads apart, then when and how
 * long ago. A loaded file has a name instead of a time. */
function snapshotLabel(snapshot, now = Date.now()) {
  const when = snapshot.label || snapshot.time.toLocaleTimeString();
  const step = snapshot.step && snapshot.step.name ? `${snapshot.step.name} · ` : '';
  const ago = snapshot.label ? '' : ` · ${agoText(now - snapshot.time.getTime())}`;
  return `${step}${when} · ${formatBytes(snapshot.raw.length)}${ago}`;
}

/* The options' text changes as time passes, but the picker itself must not be
 * rebuilt (an open list would close): only the words are rewritten. */
function paintLabels(panel) {
  const now = Date.now();
  panel.querySelectorAll('option').forEach((option) => {
    if (!option.__snapshot) return;
    const text = snapshotLabel(option.__snapshot, now) + option.__suffix;
    if (option.textContent !== text) option.textContent = text;
  });
}

function keepLabelsFresh(panel) {
  if (panel.__ago) return;
  panel.__ago = setInterval(() => {
    if (panel.hidden || !panel.isConnected) { clearInterval(panel.__ago); panel.__ago = null; return; }
    paintLabels(panel);
  }, 5000);
}

/* Everything the pickers offer: the reads, then the files loaded. */
function choices(state) {
  return snapshotChoices(state.history, state.imported);
}

/* From and To: what the user picked while it is still on offer, else the
 * default pair. */
function comparePair(state) {
  const all = choices(state);
  const [before, newest] = defaultPair(state.history, state.imported);
  return [
    all.includes(state.compareA) ? state.compareA : before,
    all.includes(state.compareB) ? state.compareB : newest
  ];
}

function parseSnapshot(snapshot) {
  try { return JSON.parse(snapshot.raw); } catch { return undefined; }
}

function pickerFor(state, labelText, chosen, onPick, title) {
  const label = document.createElement('label');
  label.className = 'field';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.appendChild(span);
  const select = document.createElement('select');
  select.title = title;
  select.setAttribute('data-help', 'Compare data');
  select.setAttribute('aria-label', labelText);
  const all = choices(state);
  all.forEach((snapshot, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.__snapshot = snapshot;
    option.__suffix = index === state.history.length - 1 ? ' (latest)' : '';
    option.textContent = snapshotLabel(snapshot) + option.__suffix;
    select.appendChild(option);
  });
  select.value = String(all.indexOf(chosen));
  select.addEventListener('change', () => onPick(all[Number(select.value)]));
  label.appendChild(select);
  return label;
}

/* A read as a pane title, without the "ago" that would go stale: the step,
 * then when it was read (or the file's name). */
function paneLabel(snapshot) {
  if (snapshot.label) return snapshot.label;
  const step = snapshot.step && snapshot.step.name ? `${snapshot.step.name} · ` : '';
  return `${step}read at ${snapshot.time.toLocaleTimeString()}`;
}

/* The two reads side by side, or the sentence that says why not. */
function comparison(before, after, a, b, all, on) {
  const box = document.createElement('div');
  box.className = 'compare-list';
  if (before === undefined || after === undefined) {
    box.textContent = 'One of these reads is not valid JSON, so it cannot be compared.';
  } else if (a === b) {
    box.textContent = 'Pick two different reads.';
  } else {
    createCompareView({
      host: box,
      before,
      after,
      identical: 'These two reads are identical.',
      titles: { before: `Before: ${paneLabel(a)}`, after: `After: ${paneLabel(b)}` },
      surface: 'data-compare',
      key: `${all.indexOf(a)}:${all.indexOf(b)}:${a.raw.length}:${b.raw.length}`,
      mask: Mask.apply,
      onCopy: on.copy ? (text, button) => on.copy(text, button) : null
    });
  }
  return box;
}

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

/* The "Load file…" button and its hidden file input. A picked file that is not
 * JSON (or too large) adds nothing and says so; a good one becomes From (or To
 * when From is already a file) so the diff shows at once. */
function loadFileControl(state, redraw) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.id = 'compare-file';

  const button = document.createElement('button');
  button.className = 'icon-btn tiny';
  button.id = 'compare-load';
  button.setAttribute('data-help', 'Compare data');
  decorateButton(button, 'upload', 'Load file…');
  button.title = 'Add a JSON file to compare against. It stays in memory and is never sent.';
  button.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const text = await readFileText(file);
    /* The size first: parsing a huge file only to refuse it would stall the panel. */
    if (text.length > MAX_CHARS) { toast(`${file.name} is too large to compare`); return; }
    if (!isJsonText(text)) { toast(`${file.name} is not valid JSON`); return; }
    state.imported = addImported(state.imported, file.name, text, new Date());
    const added = state.imported[state.imported.length - 1];
    state.compareA = added;
    state.compareB = null;
    redraw();
  });
  return [button, input];
}

/* "Since this step began": Before is the first read of the current visit to the
 * step the script is on, After the latest. Off, with the reason as its tooltip, when
 * that is not known. */
function sinceStepControl(state, redraw, step) {
  const pair = sinceStepEntry(state.history, step);
  const stamp = stepStamp(step);
  const button = document.createElement('button');
  button.className = 'icon-btn tiny';
  button.id = 'compare-since';
  button.setAttribute('data-help', 'Compare data');
  decorateButton(button, 'target', 'Since this step began');
  button.disabled = !pair;
  const reason = pair ? '' : sinceStepReason(stamp);
  if (pair) {
    button.title = `Compare from the first read since the script entered ${stamp.name} to the latest`;
  } else if (!stamp || stamp.visitFrom === null) {
    button.title = 'Needs the step the script is on: open the Structure tab and let the script reach a step.';
  } else {
    button.title = `Needs two different reads since the script entered ${stamp.name}.`;
  }
  button.addEventListener('click', () => {
    if (!pair) return;
    state.compareA = pair.from;
    state.compareB = pair.to;
    redraw();
  });
  /* A greyed button says nothing on its own: the reason sits beside it. */
  if (!reason) return [button];
  const note = document.createElement('span');
  note.className = 'bar-note since-reason';
  note.textContent = reason;
  return [button, note];
}

/* state: { history, imported, compareOpen, compareA, compareB, compareSig }
 * els: { panel, toggle }; on: { copy(text, button), step() } where step
 * gives the Structure tab's current step ({ key, name, visits }) or null */
export function renderComparePanel(els, state, on) {
  const { panel, toggle } = els;
  panel.hidden = !state.compareOpen;
  toggle.classList.toggle('is-on', state.compareOpen);
  toggle.setAttribute('aria-pressed', String(!!state.compareOpen));
  if (!state.compareOpen) {
    clearInterval(panel.__ago);
    panel.__ago = null;
    return;
  }

  if (!panel.hidden) keepLabelsFresh(panel);
  const [a, b] = comparePair(state);
  const all = choices(state);
  const step = on.step ? on.step() : null;
  const stamp = stepStamp(step);
  const signature = [stamp && stamp.name, stamp && stamp.visitFrom, state.history.length, state.imported.length, state.history.at(-1) && state.history.at(-1).raw.length,
    all.indexOf(a), all.indexOf(b), a && a.time.getTime(), b && b.time.getTime()].join('|');
  if (signature === state.compareSig && panel.childElementCount) { paintLabels(panel); return; }
  state.compareSig = signature;

  const redraw = () => { state.compareSig = ''; renderComparePanel(els, state, on); };

  panel.textContent = '';
  const head = document.createElement('div');
  head.className = 'bar';
  const title = document.createElement('span');
  title.className = 'bar-label';
  title.textContent = 'Compare data';
  title.title = 'Paths are written as in the OmniScript, Step:Rows|2:Field; positions count from 1, as in the OmniScript.';
  head.appendChild(title);

  if (all.length < 2) {
    const note = document.createElement('span');
    note.className = 'bar-note';
    note.textContent = 'Needs two different reads — change something in the OmniScript and it will appear here — or load a file.';
    head.appendChild(note);
    loadFileControl(state, redraw).forEach((node) => head.appendChild(node));
    panel.appendChild(head);
    return;
  }

  const before = parseSnapshot(a);
  const after = parseSnapshot(b);

  head.appendChild(pickerFor(state, 'Before', a, (snapshot) => { state.compareA = snapshot; redraw(); }, 'The older read: the changes are listed from this one'));
  head.appendChild(pickerFor(state, 'After', b, (snapshot) => { state.compareB = snapshot; redraw(); }, 'The newer read: the changes are listed up to this one'));
  sinceStepControl(state, redraw, step).forEach((node) => head.appendChild(node));

  loadFileControl(state, redraw).forEach((node) => head.appendChild(node));

  const close = document.createElement('button');
  close.className = 'icon-btn tiny compare-close';
  close.textContent = '×';
  close.title = 'Close Compare data';
  close.setAttribute('aria-label', 'Close Compare data');
  close.setAttribute('data-help', 'Compare data');
  close.addEventListener('click', () => { state.compareOpen = false; renderComparePanel(els, state, on); });
  head.appendChild(close);

  panel.appendChild(head);
  panel.appendChild(comparison(before, after, a, b, all, on));
}
