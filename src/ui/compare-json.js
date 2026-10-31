'use strict';

/* Compare JSON (the button at the end of the tab strip, and Settings, Tools):
 * two boxes, Before and After, for any two JSON texts the user pastes, and the
 * side by side comparison of them (src/ui/compare-view.js) under the boxes.
 * Each box is read as Text, Tree or Form and has its tools (paste, load a
 * file, take the data or a call, format, sort, minify, copy, clear). Nothing is
 * sent or stored: the texts are kept in memory while DevTools is open, so
 * reopening the dialog shows them again. */

import { createOverlay } from './overlay.js';
import { createCompareView } from './compare-view.js';
import { renderJsonTree } from './json-tree-view.js';
import { renderForm } from './structure/value-views.js';
import { openContextMenu } from './context-menu.js';
import { copyWithToast } from './clipboard.js';
import { decorateButton } from './icons.js';
import { toast } from './toast.js';
import { debounce } from './util.js';
import { Mask } from './mask-setting.js';
import { Shared } from './shared.js';
import { parseJsonText } from '../core/actions/test-calls.js';
import { inputText } from '../core/actions/actions-apex.js';
import { formRows } from '../core/structure/form-rows.js';
import { subtreeBranches, isContainer } from '../core/shared/json-tree-model.js';
import { parseLoose } from '../core/shared/loose-json.js';
import {
  pastedSummary, canCompare, sideReading, looseNote, sortKeysDeep, callOutputText, recentCalls,
  boxStatus, errorCaret, sideToFix, compareAnnouncement
} from '../core/shared/compare-json.js';

/* What was pasted, whether it is compared (the boxes are folded then) and
 * whether a comparison was asked for (an empty box says so then). `accepted`
 * is the text of each box the user chose to read loosely: change a character
 * and the choice lapses. `view` is how each box is shown (Text, Tree, Form);
 * `trees` and `forms` are what is open in them. */
const kept = {
  before: '', after: '', compared: false, asked: false,
  accepted: { before: '', after: '' },
  view: { before: 'text', after: 'text' },
  trees: {}, forms: { before: new Set(), after: new Set() }
};

const SIDES = [['before', 'Before'], ['after', 'After']];
const VIEWS = [['text', 'Text'], ['tree', 'Tree'], ['form', 'Form']];
/* Typing is checked this long after the last key, so a half-typed value is not
 * called invalid on every letter. */
const CHECK_DELAY_MS = 250;
const MAX_FILE_CHARS = 8 * 1024 * 1024;
const CALLS_OFFERED = 8;

let overlay = null;
let mountedOn = null;
let maskBox = null;
let alertNode = null;
/* The last reading of each box, so typing in the other one does not read it again. */
const memo = {};
/* The pending check of each box after typing (see CHECK_DELAY_MS). */
const checkTimers = {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, title) {
  const node = el('button', className, text);
  node.type = 'button';
  node.title = title;
  node.setAttribute('data-help', 'Compare JSON');
  return node;
}

/* What a box holds, read strictly and, when that fails, loosely. */
function read(side) {
  const text = kept[side];
  const accepted = text !== '' && kept.accepted[side] === text;
  const hit = memo[side];
  if (hit && hit.text === text && hit.accepted === accepted) return hit.result;
  const strict = parseJsonText(text);
  const loose = strict.ok ? null : parseLoose(text);
  const result = { strict, reading: sideReading(strict, loose, accepted), text };
  memo[side] = { text, accepted, result };
  return result;
}

/* A box's status, from what it holds and whether Compare was just pressed. */
function statusOf(side) {
  const { strict, reading } = read(side);
  return boxStatus({ strict, reading, asked: kept.asked, text: kept[side] });
}

/* The screen-reader announcement (role="alert"): only when Compare is pressed
 * and cannot compare, never while typing. Emptied first so the same sentence
 * said twice is read twice. */
function announce(text) {
  if (!alertNode) return;
  alertNode.textContent = '';
  if (text) alertNode.textContent = text;
}

const treeOf = (side) => kept.trees[side] || (kept.trees[side] = { expanded: new Set(['']), filterOpen: new Map(), expandedText: new Set(), filter: '' });
const forgetOpen = (side) => { delete kept.trees[side]; kept.forms[side] = new Set(); };

/* A box's text changed by a tool or the keyboard: the comparison is off, and a
 * Tree or Form that has nothing to show goes back to the text. */
function setText(side, text, { keepOpen = false } = {}) {
  kept[side] = text;
  kept.compared = false;
  kept.asked = false;
  if (!keepOpen) forgetOpen(side);
  const { reading } = read(side);
  if (kept.view[side] !== 'text' && (!reading.ok || reading.empty)) kept.view[side] = 'text';
  paint();
}

/* ------------------------------------------------------ the dialog */

function paint() {
  const body = document.getElementById('compare-json-body');
  if (!body) return;
  const focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : '';
  body.textContent = '';
  if (maskBox) {
    maskBox.input.checked = Mask.on();
    maskBox.label.classList.toggle('is-on', Mask.on());
  }

  const readings = { before: read('before').reading, after: read('after').reading };
  const ready = canCompare(readings.before, readings.after);
  const folded = kept.compared && ready;

  const boxes = el('div', `cj-boxes${folded ? ' is-folded' : ''}`);
  SIDES.forEach(([side, name]) => boxes.appendChild(box(side, name, folded)));
  body.appendChild(boxes);

  const actions = el('div', 'cj-actions');
  const compare = button('primary cj-compare', 'Compare', 'Compare the two boxes side by side (Ctrl/Cmd+Enter)');
  compare.id = 'cj-compare';
  compare.addEventListener('click', run);
  const swap = button('icon-btn tiny cj-swap', 'Swap', 'Exchange Before and After');
  swap.id = 'cj-swap';
  swap.addEventListener('click', () => {
    [kept.before, kept.after] = [kept.after, kept.before];
    [kept.accepted.before, kept.accepted.after] = [kept.accepted.after, kept.accepted.before];
    [kept.trees.before, kept.trees.after] = [kept.trees.after, kept.trees.before];
    [kept.forms.before, kept.forms.after] = [kept.forms.after, kept.forms.before];
    SIDES.forEach(([side]) => {
      const { reading } = read(side);
      if (kept.view[side] !== 'text' && (!reading.ok || reading.empty)) kept.view[side] = 'text';
    });
    paint();
  });
  const clear = button('icon-btn tiny cj-clear-both', 'Clear', 'Empty both boxes and start over');
  clear.id = 'cj-clear';
  clear.addEventListener('click', () => {
    SIDES.forEach(([side]) => resetSide(side));
    kept.compared = false;
    kept.asked = false;
    announce('');
    paint();
    const again = document.getElementById('cj-before');
    if (again) again.focus();
  });
  actions.append(compare, swap, clear);
  if (Mask.on()) actions.appendChild(el('span', 'bar-note cj-mask', 'Mask values does not apply to what you paste'));
  body.appendChild(actions);

  if (folded) {
    const result = el('div', 'cj-result');
    body.appendChild(result);
    createCompareView({
      host: result,
      before: readings.before.value,
      after: readings.after.value,
      titles: { before: 'Before', after: 'After' },
      surface: 'compare-json',
      key: `${kept.before.length}:${kept.after.length}:${kept.before.slice(0, 64)}:${kept.after.slice(0, 64)}`,
      identical: 'These two are identical.',
      mask: Mask.apply
    });
  }

  if (focused) {
    const again = document.getElementById(focused);
    if (again) again.focus();
  }
}

/* ------------------------------------------------------ one box */

/* Text | Tree | Form for a box. Tree and Form need a value: they are disabled
 * while the text does not parse (or says nothing), and Form needs keys. */
function viewSwitch(side, name) {
  const strip = el('div', 'seg cj-views');
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', `How ${name} is shown`);
  VIEWS.forEach(([view, label]) => {
    const choice = button('seg-btn', label, '');
    choice.id = `cj-${side}-view-${view}`;
    choice.dataset.view = view;
    choice.addEventListener('click', () => {
      if (choice.disabled) return;
      kept.view[side] = view;
      paint();
    });
    strip.appendChild(choice);
  });
  return strip;
}

function updateSwitch(strip, side, reading) {
  const shown = kept.view[side];
  const why = {
    text: `The text of ${side === 'before' ? 'Before' : 'After'}, to edit`,
    tree: 'The value as a tree, as in Data: every key with its type, with a filter and Expand all',
    form: 'The value as a form: a label and a read-only field for each key, lists open in place'
  };
  const usable = reading.ok && !reading.empty;
  strip.querySelectorAll('.seg-btn').forEach((choice) => {
    const view = choice.dataset.view;
    let needs = '';
    if (view !== 'text' && !usable) needs = reading.empty ? 'Paste or type JSON first' : 'Fix the JSON first';
    else if (view === 'form' && !isContainer(reading.value)) needs = 'Only an object or a list has keys to list';
    choice.disabled = !!needs;
    choice.title = needs || why[view];
    choice.classList.toggle('is-on', shown === view);
    choice.setAttribute('aria-pressed', String(shown === view));
  });
}

/* The status in the header line: "1 key ✓", "empty", "⚠ invalid" (the line and
 * column lead the quiet line under the box). It is always there and one line long, so it never moves the
 * boxes. A text that is not JSON also marks its box (aria-invalid, a thin red
 * bar on the left edge); an empty box is not an error and is not marked. */
function updateStatus(node, area, side) {
  const status = statusOf(side);
  node.textContent = status.text;
  node.className = `cj-status is-${status.tone}`;
  node.title = status.hint ? `${status.plain}. ${status.hint}` : status.plain;
  if (area) {
    if (status.tone === 'error') area.setAttribute('aria-invalid', 'true');
    else area.removeAttribute('aria-invalid');
  }
}

/* The quiet line under a box (its room is always kept): the note that the text
 * was read loosely, or, for text that is not JSON, one sentence on what is
 * wrong with Read loosely beside it when the text could be read that way. */
function updateNote(line, side, name) {
  const { reading } = read(side);
  line.textContent = '';
  line.classList.toggle('is-note', reading.kind === 'loose');
  if (reading.kind === 'loose') {
    line.textContent = looseNote(reading.words);
  } else {
    const { where, hint } = statusOf(side);
    const problem = [where, hint].filter(Boolean).join(': ');
    if (problem) line.appendChild(el('span', 'cj-problem-text', problem));
    if (reading.kind === 'offer') {
      const loosely = button('icon-btn tiny cj-loose', 'Read loosely',
        `Accept ${reading.words.length ? reading.words.join(', ') : 'what is nearly JSON'} in ${name} and compare its value. The text stays as you typed it; Format rewrites it as JSON`);
      loosely.id = `cj-${side}-loose`;
      loosely.addEventListener('click', () => {
        kept.accepted[side] = kept[side];
        paint();
        const again = document.getElementById(`cj-${side}`);
        if (again) again.focus();
      });
      line.appendChild(loosely);
    }
  }
  line.title = line.textContent;
}

/* Empty a box and open it for editing (the Clear tool, and the clear button in
 * a folded box's header). */
function resetSide(side) {
  kept[side] = '';
  kept.accepted[side] = '';
  kept.view[side] = 'text';
  forgetOpen(side);
}

function clearSide(side) {
  resetSide(side);
  kept.compared = false;
  kept.asked = false;
  announce('');
  paint();
  const again = document.getElementById(`cj-${side}`);
  if (again) again.focus();
}

/* A box folded to one line once compared, with a small clear button for it. */
function foldedBox(side, name, wrap) {
  const { reading } = read(side);
  wrap.classList.add('is-folded');
  const summary = button('cj-summary', '', `Edit ${name}`);
  summary.id = `cj-${side}-edit`;
  const how = reading.kind === 'loose' ? ' · read loosely' : '';
  summary.append(el('b', undefined, name), document.createTextNode(` · ${pastedSummary(reading.value)}${how} · `), el('span', 'cj-edit', 'edit'));
  summary.addEventListener('click', () => {
    kept.compared = false;
    paint();
    const area = document.getElementById(`cj-${side}`) || document.getElementById(`cj-${side}-view-text`);
    if (area) area.focus();
  });
  const clear = button('icon-btn tiny cj-fold-clear', 'Clear', `Empty ${name} and edit it again`);
  clear.id = `cj-${side}-clear`;
  decorateButton(clear, 'clear', 'Clear');
  clear.title = `Empty ${name} and edit it again`;
  clear.setAttribute('aria-label', `Clear ${name}`);
  clear.addEventListener('click', () => clearSide(side));
  wrap.append(summary, clear);
  return wrap;
}

function box(side, name, folded) {
  const wrap = el('div', `cj-box cj-${side}`);
  if (folded) return foldedBox(side, name, wrap);

  const head = el('div', 'cj-box-head');
  const label = el('label', 'cj-label', name);
  label.htmlFor = `cj-${side}`;
  const switcher = viewSwitch(side, name);
  const status = el('span', 'cj-status');
  status.id = `cj-${side}-status`;
  head.append(label, status, switcher);
  const view = kept.view[side];
  if (view !== 'text') label.removeAttribute('for');

  const area = view === 'text' ? el('textarea', 'cj-text') : null;
  const problem = el('div', 'cj-problem');
  problem.id = `cj-${side}-problem`;

  head.append(...toolButtons(side, name, area));
  wrap.appendChild(head);

  if (area) {
    area.id = `cj-${side}`;
    area.spellcheck = false;
    area.value = kept[side];
    area.placeholder = 'Paste or type JSON';
    area.setAttribute('data-help', 'Compare JSON');
    area.setAttribute('aria-describedby', `${status.id} ${problem.id}`);
    wrap.appendChild(area);
  } else {
    wrap.appendChild(view === 'tree' ? treePane(side, name) : formPane(side));
  }
  wrap.appendChild(problem);

  const check = () => {
    updateStatus(status, area, side);
    updateNote(problem, side, name);
    updateSwitch(switcher, side, read(side).reading);
  };
  check();

  clearTimeout(checkTimers[side]);
  if (area) {
    /* Typing keeps the text at once; the status, the note and the switch follow
     * it a moment after the last key. Nothing is announced meanwhile. */
    area.addEventListener('input', () => {
      kept[side] = area.value;
      kept.asked = false;
      forgetOpen(side);
      announce('');
      clearTimeout(checkTimers[side]);
      checkTimers[side] = setTimeout(check, CHECK_DELAY_MS);
    });
    /* Leaving the box checks it at once, without waiting for the pause. */
    area.addEventListener('change', () => {
      clearTimeout(checkTimers[side]);
      check();
    });
    area.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); run(); }
    });
  }
  return wrap;
}

/* ------------------------------------------------------ Tree and Form */

function treePane(side, name) {
  const { reading } = read(side);
  const tree = treeOf(side);
  const pane = el('div', 'cj-pane cj-tree-pane');

  const bar = el('div', 'cj-tree-bar');
  const find = el('input', 'detail-find');
  find.type = 'search';
  find.id = `cj-${side}-find`;
  find.placeholder = 'Filter keys and values';
  find.spellcheck = false;
  find.value = tree.filter;
  find.title = `Show only the rows of ${name} that contain this text`;
  find.setAttribute('aria-label', `Filter ${name}`);
  find.setAttribute('data-help', 'Compare JSON');
  const expand = button('icon-btn tiny', '', 'Expand everything');
  decorateButton(expand, 'expand', 'Expand all');
  const collapse = button('icon-btn tiny', '', 'Collapse to the top level');
  decorateButton(collapse, 'collapse', 'Collapse all');
  expand.title = 'Expand everything';
  collapse.title = 'Collapse to the top level';
  bar.append(find, expand, collapse);

  const host = el('div', 'viewport cj-tree');
  host.id = `cj-${side}-tree`;
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', `${name} as a tree`);
  const filtering = () => tree.filter.trim() !== '';

  const draw = () => {
    host.textContent = '';
    const result = renderJsonTree(host, name, reading.value, {
      expanded: tree.expanded,
      filterOpen: tree.filterOpen,
      expandedText: tree.expandedText,
      filter: tree.filter,
      transform: Mask.apply,
      sticky: true,
      onToggle: draw
    });
    if (!result.matched) host.appendChild(el('div', 'valid-note', `Nothing here matches "${tree.filter.trim()}".`));
  };
  const typed = debounce(() => {
    if (tree.filter.trim().toLowerCase() !== find.value.trim().toLowerCase()) tree.filterOpen = new Map();
    tree.filter = find.value;
    draw();
  }, 120);
  find.addEventListener('input', typed);
  expand.addEventListener('click', () => {
    if (filtering()) tree.filterOpen = new Map();
    else tree.expanded = new Set(['', ...subtreeBranches(reading.value, '').paths]);
    draw();
  });
  collapse.addEventListener('click', () => {
    const branches = subtreeBranches(reading.value, '').paths;
    if (filtering()) tree.filterOpen = new Map(branches.filter((path) => path !== '').map((path) => [path, false]));
    else tree.expanded = new Set(['']);
    draw();
  });
  pane.append(bar, host);
  draw();
  return pane;
}

function formPane(side) {
  const { reading } = read(side);
  const open = kept.forms[side];
  const pane = el('div', 'cj-pane cj-form-pane');
  pane.id = `cj-${side}-form`;
  const draw = () => {
    pane.textContent = '';
    renderForm(formRows(null, reading.value, [], (id) => open.has(id)), pane, (id) => {
      if (open.has(id)) open.delete(id); else open.add(id);
      draw();
    });
  };
  draw();
  return pane;
}

/* ------------------------------------------------------ the tools */

async function readClipboard() {
  try {
    return navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : null;
  } catch {
    return null;
  }
}

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/* The value of a box as the tools see it, or null (and a word on why). */
function valueOf(side) {
  const { reading } = read(side);
  if (reading.ok && !reading.empty) return { value: reading.value };
  if (reading.kind === 'offer') toast('Not JSON yet: press Read loosely first');
  else if (reading.empty) toast('Nothing there: paste or type JSON first');
  else toast('Fix the JSON first');
  return null;
}

function callMenu(side, anchor) {
  const clock = (time) => new Date(time).toLocaleTimeString();
  const calls = recentCalls(Shared.calls(), CALLS_OFFERED);
  const items = [];
  calls.forEach((entry) => {
    const name = `${clock(entry.time)} · ${entry.name || entry.type || 'call'}`;
    items.push({ label: `${name} · input`, action: () => setText(side, inputText(entry)) });
    const output = callOutputText(entry);
    items.push({ label: `${name} · output`, disabled: output === null, action: () => setText(side, output) });
  });
  if (!items.length) items.push({ label: 'No captured calls', disabled: true, action: () => {} });
  const at = anchor.getBoundingClientRect();
  openContextMenu({ clientX: at.left, clientY: at.bottom, type: 'click', detail: 1 }, items);
}

/* Every tool of a box: [id, label, icon, title, run]. Paste and Format are
 * always in the row; the others fold into the … menu in a narrow box. */
function toolList(side, name) {
  return [
    { id: 'paste', label: 'Paste', fixed: true, title: `Put the clipboard's text in ${name}`,
      run: async () => {
        const pasted = await readClipboard();
        if (pasted === null) {
          const line = document.getElementById(`cj-${side}-problem`);
          if (line) line.textContent = 'Paste with Ctrl/Cmd+V instead';
          const again = document.getElementById(`cj-${side}`);
          if (again) again.focus();
          return;
        }
        setText(side, pasted);
      } },
    { id: 'load', label: 'Load file…', icon: 'upload', title: `Read a .json file from disk into ${name}. It is never sent anywhere`,
      run: () => { const input = document.getElementById(`cj-${side}-file`); if (input) input.click(); } },
    { id: 'data', label: 'From the data', icon: 'data', title: `Put the Data JSON of the selected script in ${name}`,
      run: () => {
        const payload = Shared.payload();
        if (!payload || payload.data === undefined) { toast('No data to take: select a script with data first'); return; }
        setText(side, JSON.stringify(payload.data, null, 2));
      } },
    { id: 'call', label: 'From a call…', icon: 'calls', title: `Put the input or the output of a captured call in ${name}, newest first`,
      run: (node) => callMenu(side, node) },
    { id: 'format', label: 'Format', fixed: true, title: `Indent the JSON in ${name}. Text read loosely is rewritten as JSON`,
      run: () => { const got = valueOf(side); if (got) setText(side, JSON.stringify(got.value, null, 2), { keepOpen: true }); } },
    { id: 'sort', label: 'Sort keys', icon: 'timeline', title: `Put the keys of ${name} in order, at every depth, and indent it`,
      run: () => { const got = valueOf(side); if (got) setText(side, JSON.stringify(sortKeysDeep(got.value), null, 2), { keepOpen: true }); } },
    { id: 'minify', label: 'Minify', icon: 'collapse', title: `Write ${name} on one line, without spaces`,
      run: () => { const got = valueOf(side); if (got) setText(side, JSON.stringify(got.value), { keepOpen: true }); } },
    { id: 'copy', label: 'Copy', icon: 'copy', title: `Copy the text of ${name}. Honours Mask values`,
      run: () => {
        if (!kept[side].trim()) { toast('Nothing to copy'); return; }
        if (!Mask.on()) { copyWithToast(kept[side], `Copied ${name}`); return; }
        const got = valueOf(side);
        if (got) copyWithToast(JSON.stringify(Mask.apply(got.value), null, 2), `Copied ${name}, masked`);
      } },
    { id: 'clear', label: 'Clear', icon: 'clear', title: `Empty ${name}`,
      run: () => clearSide(side) }
  ];
}

/* The buttons of a box's header after the switch, the … button that stands for
 * the folded ones, and the hidden file input. `run(node)` gets the button the
 * tool was started from, for a menu to open under. */
function toolButtons(side, name, area) {
  const tools = toolList(side, name, area);
  const more = button('icon-btn tiny cj-more', '…', `More tools for ${name}: load a file, take the data or a call, sort, minify, copy, clear`);
  more.id = `cj-${side}-more`;
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-label', `More tools for ${name}`);
  more.addEventListener('click', () => {
    const at = more.getBoundingClientRect();
    openContextMenu({ clientX: at.left, clientY: at.bottom, type: 'click', detail: 1 },
      tools.filter((tool) => !tool.fixed).map((tool) => ({ label: tool.label, title: tool.title, action: () => tool.run(more) })));
  });

  const file = el('input', 'cj-file');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  file.id = `cj-${side}-file`;
  file.setAttribute('data-help', 'Compare JSON');
  file.setAttribute('aria-label', `A .json file for ${name}`);
  file.addEventListener('change', async () => {
    const chosen = file.files && file.files[0];
    file.value = '';
    if (!chosen) return;
    if (chosen.size > MAX_FILE_CHARS) { toast(`${chosen.name} is too large to open`); return; }
    const loaded = await readFileText(chosen);
    if (loaded === null) { toast(`Could not read ${chosen.name}`); return; }
    setText(side, loaded);
    toast(`Loaded ${chosen.name}`);
  });

  const nodes = [];
  tools.forEach((tool) => {
    const node = button(`icon-btn tiny cj-tool cj-${tool.id}${tool.fixed ? '' : ' cj-folds'}`, tool.label, tool.title);
    node.id = `cj-${side}-${tool.id}`;
    if (tool.icon) {
      decorateButton(node, tool.icon, tool.label);
      node.title = tool.title;
    }
    node.addEventListener('click', () => tool.run(node));
    nodes.push(node);
    /* The … sits beside Paste and Format and shows only where the others are folded. */
    if (tool.id === 'format') nodes.push(more);
  });
  nodes.push(file);
  return nodes;
}

/* ------------------------------------------------------ comparing */

function run() {
  kept.asked = true;
  const readings = { before: read('before').reading, after: read('after').reading };
  kept.compared = canCompare(readings.before, readings.after);
  const fix = sideToFix(readings.before, readings.after);
  paint();
  if (!fix) {
    announce('');
    const result = document.querySelector('#compare-json-body .cmp-body');
    if (result) result.focus();
    return;
  }
  /* Nothing to compare: the keyboard goes to the first box that needs a value,
   * at the place its text stops being JSON, and the reason is announced. The
   * status in its header says the same, calmly. */
  announce(compareAnnouncement(SIDES.map(([side, name]) => ({ name, status: statusOf(side) }))));
  const area = document.getElementById(`cj-${fix}`) || document.getElementById(`cj-${fix}-view-text`);
  if (!area) return;
  area.focus();
  const caret = errorCaret(read(fix).strict, kept[fix]);
  if (caret !== null && area.setSelectionRange) area.setSelectionRange(caret, caret);
}

/* ------------------------------------------------------ mounting */

/* Mask values, in the header: the panel's own switch shown a second time.
 * Ticking either is ticking both; the top bar's change event is what carries
 * the state (so Mask values at start and a reset are followed too, on opening). */
function mountMaskBox(card) {
  const top = document.getElementById('mask-values');
  const label = el('label', 'field checkbox cj-mask-switch');
  label.setAttribute('data-help', 'Compare JSON');
  label.title = 'Hides values in the comparison and in copies. Pasted text is kept as typed.';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'cj-mask-values';
  label.append(input, el('span', undefined, 'Mask values'));
  card.insertBefore(label, document.getElementById('compare-json-close'));
  maskBox = { label, input };
  if (!top) return;
  input.addEventListener('change', () => {
    top.checked = input.checked;
    top.dispatchEvent(new Event('change', { bubbles: true }));
  });
  /* Registered after the switch's own handler, so Mask.on() is current. */
  top.addEventListener('change', () => { if (overlay && overlay.isOpen()) paint(); });
}

function mount() {
  const root = document.getElementById('compare-json-overlay');
  if (overlay && mountedOn === root) return overlay;
  mountedOn = root;
  const card = root.querySelector('.compare-json-card');
  /* The panel's one-key shortcuts (1-3, c, d, h) act on what is behind the
   * dialog: inside it they are only keys. Esc closes the dialog and nothing
   * behind it. */
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); return; }
    if (ev.key === 'Tab' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    ev.stopPropagation();
  });
  mountMaskBox(card);
  /* Said aloud only when Compare is pressed and cannot compare. */
  alertNode = el('div', 'sr-only');
  alertNode.id = 'cj-announce';
  alertNode.setAttribute('role', 'alert');
  card.appendChild(alertNode);
  overlay = createOverlay({
    overlay: root,
    card,
    closeButton: document.getElementById('compare-json-close'),
    onOpen: (wasOpen) => { if (!wasOpen) paint(); },
    initialFocus: () => document.querySelector('#compare-json-body .cmp-body, #cj-before') || card
  });
  return overlay;
}

/* Open the dialog, with what was pasted before. */
export function openCompareJson() {
  mount().open();
}

/* For the tests: what a fresh DevTools would hold. */
export function forgetCompareJson() {
  kept.before = '';
  kept.after = '';
  kept.compared = false;
  kept.asked = false;
  kept.accepted = { before: '', after: '' };
  kept.view = { before: 'text', after: 'text' };
  kept.trees = {};
  kept.forms = { before: new Set(), after: new Set() };
  Object.keys(memo).forEach((key) => delete memo[key]);
  SIDES.forEach(([side]) => clearTimeout(checkTimers[side]));
  announce('');
  if (overlay && overlay.isOpen()) overlay.close({ restoreFocus: false });
}
