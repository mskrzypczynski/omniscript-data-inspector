'use strict';

/* The settings dialog, opened by the gear in the top bar (or the comma key),
 * in sections: General (Text size, Mask values at start, Remember my
 * settings, Show tours again), Data (Refresh rate and a fold, Reading another
 * page), Calls, Sending and Open in Designer;
 * then which settings differ from their defaults (each with its own Reset),
 * Restore default settings with an inline confirmation, and the Tools row
 * (Save a debug bundle, Open bundle…, Compare JSON…, Copy report). The gear carries a count
 * while a setting differs. The decision of what differs lives in
 * core/shared/custom-settings.js. */

import { decorateButton } from './icons.js';
import { createOverlay } from './overlay.js';
import { customSettings, keptViewsDiffer, SETTING_SPECS, readingDiffers } from '../core/shared/custom-settings.js';
import { Settings, DEFAULTS } from './settings.js';
import { toast } from './toast.js';
import { saveDebugBundle } from './debug-bundle.js';
import { copyReport } from './copy-report.js';
import { bundleOpenControl } from './session-mode.js';
import { openCompareJson } from './compare-json.js';
import { TextSize } from './text-size.js';
import { TEXT_SIZES, textSizeName, zoomOf } from '../core/shared/text-size.js';
import { restartTour } from './tour.js';
import { attachPropPicker } from './prop-picker.js';
import { Targets } from './targets.js';
import { seenNamespaces } from './designer-button.js';
import { normalizeNamespace, DESIGNER_MODE_LABELS } from '../core/shared/designer-link.js';
import { REFRESH_RATES, REFRESH_LABELS } from '../core/shared/refresh-rate.js';
import { pollIntervals } from '../core/data/poll-rate.js';
import { Features } from './features.js';
import { settingsPointer } from './pointers.js';

const customRows = () => customSettings(Settings.current(), Settings.defaults(), SETTING_SPECS,
  { remembered: Settings.get('rememberSettings') === true });

/* A view you last chose differs from its default, though it is no row (Remember
 * my settings is off): Restore default settings has something to put back. */
const viewsDiffer = () => keptViewsDiffer(Settings.current(), Settings.defaults());

/* The dialog's body on screen, so a setting changed under it (the Ctrl/Cmd + = key
 * while the dialog is open) shows at once. It redraws only when what it shows
 * differs: a change that leaves it as it was must not drop the focus. */
let live = null;
const shownSignature = () => JSON.stringify([
  customRows(), viewsDiffer(), TextSize.current(), Settings.get('rememberSettings'),
  Settings.get('logShowAll'), Settings.get('clearOnReload'), Settings.get('timeFormat'), Settings.get('logSlowMs'),
  Settings.get('maskAtStart'), Settings.get('refreshRate')
]);

/* True while a control of the dialog stores its own value and takes care of
 * drawing what depends on it, so the general redraw below stays out of it. */
let quiet = false;

Settings.onChange(() => {
  if (quiet || !live || !live.host.isConnected || live.host.closest('[hidden]') || live.signature === shownSignature()) return;
  live.repaint();
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function cell(tag, content) {
  const node = document.createElement(tag);
  if (content instanceof Node) node.appendChild(content); else node.textContent = content;
  return node;
}

function settingsTable(rows, onReset) {
  const table = element('table', undefined, 'settings-list');
  const head = document.createElement('tr');
  ['Setting', 'Now', 'Default', ''].forEach((text) => {
    const th = cell('th', text);
    th.scope = 'col';
    if (!text) th.className = 'sr-only';
    head.appendChild(th);
  });
  table.appendChild(head);

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.setting = row.key;
    const name = element('th', row.label);
    name.scope = 'row';

    const reset = element('button', 'Reset', 'icon-btn tiny');
    reset.type = 'button';
    reset.setAttribute('aria-label', `Reset ${row.label} to ${row.default}`);
    reset.title = `Put ${row.label} back to ${row.default}`;
    reset.addEventListener('click', () => onReset(row.key));

    tr.append(name, cell('td', row.current), cell('td', row.default), cell('td', reset));
    table.appendChild(tr);
  });
  return table;
}

/* A row of the Settings section that is a choice of one: a caption and a
 * segmented switch (buttons that say aria-pressed, as the view switches do).
 * options: [{ value, label, title, disabled }]; a disabled one only shows (it
 * is pressed when it is the value) and cannot be picked. A button's data-seg lets a redraw put
 * the keyboard back on it. No data-help: the Text size entry is in the help, and
 * the right-click help is off while this dialog is open. */
function choiceRow({ id, label, title, options, value, onPick, after = [] }) {
  const row = element('div', undefined, 'settings-choice');
  row.id = id;
  const caption = element('span', label, 'settings-choice-label');
  const group = element('div', undefined, 'seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  group.title = title;
  options.forEach((option) => {
    const on = option.value === value;
    const button = element('button', option.label, `seg-btn${on ? ' is-on' : ''}`);
    button.type = 'button';
    button.title = option.title;
    button.dataset.seg = `${id}:${option.value}`;
    button.setAttribute('aria-pressed', String(on));
    if (option.disabled) button.setAttribute('aria-disabled', 'true');
    else button.addEventListener('click', () => onPick(option.value));
    group.appendChild(button);
  });
  row.append(caption, group, ...after);
  return row;
}

/* Text size: S / M / L / XL, applied at once to the whole panel. */
function textSizeRow(onPick) {
  return choiceRow({
    id: 'settings-text-size',
    label: 'Text size',
    title: 'Make the text and controls of every tab smaller or larger (Ctrl/Cmd+= / - / 0)',
    options: TEXT_SIZES.map((size) => ({
      value: size, label: size, title: `${textSizeName(size)} text (${Math.round(zoomOf(size) * 100)}%)`
    })),
    value: TextSize.current(),
    onPick
  });
}

/* Calls: the options that used to crowd the tab's toolbar. The
 * tab keeps Failed only; these four decide which calls are listed, when the
 * list starts over, how times read and how slow is slow (what slow: in the
 * filter box keeps when it has no number). Each stores itself through
 * Settings.apply, which the tab listens to, so the list follows at once. */
export const DEFAULT_SLOW_LABEL = '2000 ms';

function checkboxRow({ id, label, text, title, key, hint, help }) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = id;
  box.dataset.seg = id;
  box.checked = Settings.get(key) === true;
  box.addEventListener('change', () => Settings.apply({ [key]: box.checked }));
  const row = element('label', undefined, `field checkbox ${label}`);
  row.title = title;
  if (help) row.setAttribute('data-help', help);
  row.append(box, element('span', text));
  if (!hint) return [row];
  return [row, element('p', hint, 'settings-note')];
}

function slowField(afterChange) {
  const row = element('div', undefined, 'settings-choice settings-slow');
  const caption = element('label', 'Slow call threshold', 'settings-choice-label');
  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'settings-slow-ms';
  input.min = '0';
  input.step = '100';
  input.className = 'narrow';
  input.placeholder = '2000';
  input.dataset.seg = 'settings-slow-ms';
  const current = Number(Settings.get('logSlowMs')) || 0;
  input.value = current > 0 ? String(current) : '';
  input.title = 'Milliseconds before a call counts as slow. Empty or 0 uses 2000.';
  caption.htmlFor = input.id;
  caption.title = input.title;
  input.addEventListener('change', () => {
    const value = Math.max(0, Math.floor(Number(input.value) || 0));
    input.value = value > 0 ? String(value) : '';
    /* The field keeps the focus: only the parts that quote the setting are drawn again. */
    quiet = true;
    try { Settings.apply({ logSlowMs: value }); } finally { quiet = false; }
    afterChange();
  });
  const unit = element('span', `ms (${DEFAULT_SLOW_LABEL} when empty)`, 'settings-note');
  row.append(caption, input, unit);
  return row;
}

function remoteActionsSection(repaint, afterQuiet) {
  const format = Settings.get('timeFormat');
  const analysis = Features.has('calls.analysis');
  return [
    element('h3', 'Calls'),
    choiceRow({
      id: 'settings-time-format',
      label: 'Time format',
      title: 'How call times are shown: exact milliseconds, or seconds and minutes. Milliseconds by default.',
      options: [
        { value: 'ms', label: 'ms', title: 'Exact milliseconds, "1,240 ms"' },
        { value: 'human', label: 's', title: 'Seconds and minutes, "1.2 s" and "1m 12s"; under a second stays in milliseconds' }
      ],
      value: format,
      onPick: (value) => {
        if (value === Settings.get('timeFormat')) return; // already so: nothing to redraw
        Settings.apply({ timeFormat: value });
        repaint(`settings-time-format:${value}`);
      }
    }),
    ...(analysis ? [slowField(afterQuiet)] : []),
    ...checkboxRow({
      id: 'settings-clear-on-reload', label: 'settings-remote', text: 'Clear on reload', key: 'clearOnReload', help: 'Clear on reload',
      title: 'Empty the list of calls when the page reloads.'
    })
  ];
}

/* Reading another page: which element property the Data and Structure tabs read, for a page
 * where the script keeps its data or definition somewhere else (the Designer
 * preview does). The same click-to-list picker as always. A change is stored
 * through Settings.apply, which both tabs listen to: each commits the name,
 * rescans and shows it. The field keeps the focus: only the parts that quote
 * the setting are drawn again. Left empty it goes back to the default. */
const PROP_FIELDS = [
  {
    key: 'dataProp', id: 'settings-data-prop', help: 'Data property', label: 'Data property',
    title: 'The element property the Data tab reads (default jsonDataStr). Click to list the properties.'
  },
  {
    key: 'defProp', id: 'settings-def-prop', help: 'Definition property', label: 'Definition property',
    title: 'The element property holding the definition (default jsonDef). Click to list the properties.'
  }
];

let detachPickers = [];

function propField({ key, id, help, label, title }, afterChange) {
  const row = element('label', undefined, 'settings-choice settings-prop');
  row.setAttribute('data-help', help);
  row.title = title;
  const caption = element('span', label, 'settings-choice-label');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.spellcheck = false;
  input.size = 12;
  input.value = Settings.get(key).trim() || DEFAULTS[key];
  input.dataset.seg = id;
  input.title = title;
  caption.title = title;
  detachPickers.push(attachPropPicker(input, (done) => Targets.listProps(done)));
  input.addEventListener('change', () => {
    const value = input.value.trim() || DEFAULTS[key];
    input.value = value;
    quiet = true;
    try { Settings.apply({ [key]: value }); } finally { quiet = false; }
    afterChange();
  });
  row.append(caption, input);
  return row;
}

/* Show the Frame row: the top bar's second row (Frame, Embedded scripts) stays
 * on screen, for someone who works across frames. A class on
 * the page does it (see panel.css); Inspect element is in that row too. */
export function paintFrameRow() {
  document.body.classList.toggle('has-frame-row', Settings.get('showFrameRow') === true);
}

/* Refresh rate: how often the Data tab reads while Auto-refresh is on. The
 * period stretches while nothing changes (up to the second number) and snaps
 * back at the first change or touch; the Structure and Calls tabs
 * keep their own pace. */
const RATE_WORDS = Object.freeze({
  fast: 'about twice a second, easing to every 2 seconds while nothing changes',
  normal: 'about once a second, easing to every 4 seconds while nothing changes',
  gentle: 'about every 3 seconds, easing to every 8 seconds while nothing changes'
});

function refreshRateRow(repaint) {
  return choiceRow({
    id: 'settings-refresh-rate',
    label: 'Refresh rate',
    title: 'Choose how often the Data tab re-reads the script.',
    options: REFRESH_RATES.map((rate) => {
      const { fast, slow } = pollIntervals(rate);
      return {
        value: rate, label: REFRESH_LABELS[rate],
        title: `${REFRESH_LABELS[rate]}: ${RATE_WORDS[rate]} (${fast} ms, up to ${slow} ms)`
      };
    }),
    value: REFRESH_RATES.includes(Settings.get('refreshRate')) ? Settings.get('refreshRate') : DEFAULTS.refreshRate,
    onPick: (value) => {
      if (value === Settings.get('refreshRate')) return; // already so: nothing to redraw
      Settings.apply({ refreshRate: value });
      repaint(`settings-refresh-rate:${value}`);
    }
  });
}

/* Data: Refresh rate, then one fold, "Reading another page", with the settings
 * that matter only when the script is not where the panel looks first (Data
 * property, Definition property, Show the Frame row). A native <details>, so the
 * keyboard (Enter or Space on the summary) and screen readers get the expanded
 * state for free. It opens by itself while any of them differs from its default
 * (core/shared/custom-settings.js readingDiffers); a click opens or closes it
 * otherwise, and the dialog remembers that while it is open. */
let readingOpened = false;

function readingFold(afterChange) {
  detachPickers.forEach((detach) => detach());
  detachPickers = [];
  const fold = element('details', undefined, 'settings-fold');
  fold.id = 'settings-reading';
  fold.open = readingOpened || readingDiffers(Settings.current(), Settings.defaults());
  const summary = element('summary', 'Reading another page', 'settings-fold-summary');
  summary.dataset.seg = 'settings-reading-summary';
  summary.title = 'Settings for a page where the script is not found at first: the property names and the Frame row.';
  summary.addEventListener('click', () => { readingOpened = !fold.open; });
  fold.append(
    summary,
    ...PROP_FIELDS.map((field) => propField(field, afterChange)),
    element('p', 'Change these only when the script keeps its data or definition on another property, as the Designer preview can. Click a field to list what the selected element exposes.', 'settings-note'),
    ...checkboxRow({
      id: 'settings-frame-row', label: 'settings-remote', text: 'Show the Frame row', key: 'showFrameRow', help: 'Show the Frame row',
      title: 'Show the top bar\'s second row: Frame, Embedded scripts, Inspect element.'
    })
  );
  return fold;
}

function dataSection(afterChange, repaint) {
  return [element('h3', 'Data'), refreshRateRow(repaint), readingFold(afterChange)];
}

/* Mask values at start: the Mask values switch is on each time the panel opens. The
 * switch itself is still per session and can be turned off; this is only
 * where it starts. The flag is kept on its own entry, so the line under the
 * box says that Remember my settings does not decide it. */
export const START_MASKED_NOTE = 'Kept in this browser even with Remember my settings off; turning it off deletes it.';

function startMaskedRow() {
  return checkboxRow({
    id: 'settings-mask-at-start', label: 'settings-remote', text: 'Mask values at start', key: 'maskAtStart', help: 'Mask values at start',
    title: 'Turn Mask values on every time DevTools opens.',
    hint: START_MASKED_NOTE
  });
}

/* Sending: the one setting that lets the panel send something. Test calls run
 * in the org as the user, through the page's own session, so the first time
 * the switch is turned on it stays off until the notice is accepted with
 * "I understand", right beside the sentence (no dialog on top of a dialog). */
export const SENDING_SENTENCE = 'Test calls run in your org as your user, through the page\'s own session. An Integration Procedure or a Data Mapper Load can create or change records.';

function sendingSection(repaint) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'settings-allow-test-calls';
  box.dataset.seg = 'settings-allow-test-calls';
  box.checked = Settings.get('allowTestCalls') === true;
  const label = element('label', undefined, 'field checkbox settings-sending');
  label.title = 'Let Calls send a call you compose to this page\'s org. Off by default.';
  label.append(box, element('span', 'Allow test calls'));

  const note = element('p', SENDING_SENTENCE, 'settings-note');
  note.id = 'settings-sending-note';
  box.setAttribute('aria-describedby', note.id);
  const understand = element('button', 'I understand', 'icon-btn tiny');
  understand.type = 'button';
  understand.id = 'settings-test-ack';
  understand.title = 'Accept this notice and allow test calls';
  understand.hidden = true;
  understand.addEventListener('click', () => {
    Settings.set('testCallsAck', true);
    Settings.set('allowTestCalls', true);
    repaint('settings-allow-test-calls');
  });
  note.append(' ', understand);

  box.addEventListener('change', () => {
    if (box.checked && Settings.get('testCallsAck') !== true) {
      // Not yet: the notice has to be accepted first.
      box.checked = false;
      understand.hidden = false;
      understand.focus();
      return;
    }
    Settings.set('allowTestCalls', box.checked);
  });
  /* The notice comes before the box, so what a tick means is read first. */
  return [element('h3', 'Sending'), note, label];
}

/* Open in Designer: which designer the top bar button opens. Auto is a best
 * guess from the host element, the definition, the calls and the page address;
 * the other two override it. Managed also takes the package's namespace, with
 * the ones this script shows offered first, and anything typed is accepted if
 * it can be a namespace. */
const DESIGNER_CHOICES = [
  { value: 'auto', label: DESIGNER_MODE_LABELS.auto, title: 'Guess from the host element, the definition, the calls and the page address' },
  { value: 'native', label: DESIGNER_MODE_LABELS.native, title: 'Always open the OmniStudio Builder of core OmniStudio' },
  { value: 'managed', label: DESIGNER_MODE_LABELS.managed, title: 'Always open the OmniScript Designer of a managed package, with the namespace below' }
];

/* What the field takes, said under it when it refuses a entry. */
const NAMESPACE_RULE = 'Letters, digits and single underscores, up to 15';

function namespaceField(onChange) {
  const row = element('div', undefined, 'settings-choice settings-designer-ns');
  const caption = element('label', 'Namespace', 'settings-choice-label');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'settings-designer-ns';
  input.setAttribute('list', 'settings-designer-ns-list');
  input.setAttribute('autocomplete', 'off');
  input.spellcheck = false;
  input.placeholder = 'from the page';
  input.value = Settings.get('designerNs');
  input.dataset.seg = 'settings-designer-ns';
  input.title = 'The managed package\'s namespace. Empty uses the one seen on the page, else omnistudio.';
  caption.htmlFor = input.id;
  const list = document.createElement('datalist');
  list.id = 'settings-designer-ns-list';
  seenNamespaces().forEach((name) => { const option = document.createElement('option'); option.value = name; list.appendChild(option); });
  /* Always in the page, hidden until a bad entry: the field points at it. */
  const note = element('p', NAMESPACE_RULE, 'settings-note settings-field-error');
  note.id = 'settings-designer-ns-note';
  note.hidden = true;
  input.setAttribute('aria-describedby', note.id);
  input.addEventListener('change', () => {
    const typed = input.value.trim();
    const clean = normalizeNamespace(typed);
    const refused = typed !== '' && clean === '';
    input.setAttribute('aria-invalid', String(refused));
    note.hidden = !refused;
    if (refused) return; // not a namespace: keep what was set
    /* The field stays as it is, with the focus in it: only the parts of the
     * dialog that quote the setting are drawn again (see onChange). */
    quiet = true;
    try { Settings.set('designerNs', clean); } finally { quiet = false; }
    onChange();
  });
  row.append(caption, input, list, note);
  return row;
}

function designerSection(onPick, onNamespace) {
  const mode = Settings.get('designerMode');
  const after = [];
  if (mode === 'managed') after.push(namespaceField(onNamespace));
  after.push(element('p',
    'Auto is a best guess; this setting overrides it. The tooltip of Open in Designer says which designer it will open and why.',
    'settings-note profile-sentence'));
  return [element('h3', 'Open in Designer'), choiceRow({
    id: 'settings-designer',
    label: 'Open with',
    title: 'Which designer the Open in Designer button (next to the script picker) opens.',
    options: DESIGNER_CHOICES,
    value: mode,
    onPick: (value) => { Settings.set('designerMode', value); onPick(value); },
    after
  })];
}

/* Keep settings between DevTools sessions (on by default). The decision of what
 * is kept is in core/shared/remembered-settings.js; Settings does the storing. */
function rememberSwitch() {
  const wrap = element('div', undefined, 'remember-block');
  wrap.id = 'settings-remember';
  const label = element('label', undefined, 'field checkbox settings-remote remember-setting');
  label.title = 'Keep your settings and chosen views between DevTools sessions. On by default; unticking deletes what was kept.';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'remember-settings';
  box.checked = Settings.get('rememberSettings');
  box.addEventListener('change', () => Settings.set('rememberSettings', box.checked));
  label.append(box, element('span', 'Remember my settings'));
  wrap.append(label, element('p', Features.has('data.watch')
    ? 'On by default. Keeps the settings, the views you last chose and the watch list of each script in this browser, on this computer, until you untick it, which deletes them. Filters that hide rows and the property names start fresh. Never values or data; nothing leaves this computer. Mask values at start is kept either way.'
    : 'On by default. Keeps the settings and the views you last chose in this browser, on this computer, until you untick it, which deletes them. Filters that hide rows and the property names start fresh. Never values or data; nothing leaves this computer. Mask values at start is kept either way.',
  'settings-note'));
  return wrap;
}

/* Save a debug bundle: the way to hand the developer everything the panel
 * shows. It lives here, not in the top bar, because it is for when
 * something is wrong. */
function bundleButton() {
  const button = element('button', undefined, 'icon-btn');
  button.type = 'button';
  button.id = 'settings-debug-bundle';
  button.setAttribute('data-icon', 'bundle');
  button.title = 'Save everything the panel shows as one JSON file.';
  decorateButton(button, 'bundle', 'Save a debug bundle');
  button.addEventListener('click', saveDebugBundle);
  return button;
}

/* Copy report: a few Markdown lines for a ticket or a chat. */
function reportButton() {
  const button = element('button', undefined, 'icon-btn');
  button.type = 'button';
  button.id = 'settings-copy-report';
  button.setAttribute('data-icon', 'copy');
  button.title = Features.has('structure.problems')
    ? 'Copy a short Markdown report: the script, the step it is on, what may stop Next there, the last failed calls, the size of the data and the Problems count. Honours Mask values.'
    : 'Copy a short Markdown report: the script, the step it is on, the last failed calls and the size of the data. Honours Mask values.';
  decorateButton(button, 'copy', 'Copy report');
  button.addEventListener('click', copyReport);
  return button;
}

/* Compare JSON…: two texts the user pastes, side by side. It opens its own
 * dialog in place of this one. */
function compareJsonButton(closeSettings) {
  const button = element('button', undefined, 'icon-btn');
  button.type = 'button';
  button.id = 'settings-compare-json';
  button.setAttribute('data-icon', 'compare');
  button.setAttribute('data-help', 'Compare JSON');
  button.title = 'Compare any two JSON texts side by side (Ctrl/Cmd+Shift+L)';
  decorateButton(button, 'compare', 'Compare JSON…');
  button.addEventListener('click', () => {
    closeSettings();
    openCompareJson();
  });
  return button;
}

/* Show tours again: the same as the link at the end of Start here in the help.
 * The dialog closes first, so the tour card is not behind it. */
function toursButton(closeSettings) {
  const button = element('button', 'Show tours again', 'icon-btn');
  button.type = 'button';
  button.id = 'settings-show-tours';
  button.title = 'Close Settings and show all the tours again.';
  button.addEventListener('click', () => { closeSettings(); restartTour(); });
  const row = element('div', undefined, 'settings-actions');
  row.appendChild(button);
  return row;
}

/* Builds the dialog's body into `host` (an empty element) and keeps it
 * current: it redraws itself after a reset. Called each time the dialog opens,
 * so the list is always fresh. */
export function renderSettingsSection(host, { afterOpen = () => {} } = {}) {
  let confirming = false;
  readingOpened = false;

  const paint = (focusAfter, seg) => {
    host.textContent = '';

    /* General first: how the panel looks (Text size), where it starts (Mask
     * values at start) and whether it remembers. */
    host.append(
      element('h3', 'General'),
      textSizeRow((size) => { TextSize.set(size); paint(false, `settings-text-size:${size}`); }),
      ...startMaskedRow(),
      rememberSwitch(),
      toursButton(afterOpen)
    );

    /* The list of what differs and the Restore button quote the settings, so
     * they can be drawn again on their own (fillDiffer): a field that stores
     * its value itself uses that and keeps the focus where it is. */
    let differNodes = [];
    const actions = element('div', undefined, 'settings-actions');
    const fillDiffer = () => {
      const rows = customRows();
      const fresh = [element('h3', 'Settings that differ')];
      fresh.push(rows.length
        ? settingsTable(rows, (key) => {
          Settings.resetKey(key);
          paint(true);
        })
        : element('p', viewsDiffer()
          ? 'Everything is at its default except the views you last chose'
          : 'Everything is at its default', 'settings-none'));
      if (differNodes.length) {
        differNodes[0].before(...fresh);
        differNodes.forEach((node) => node.remove());
      } else {
        host.append(...fresh);
      }
      differNodes = fresh;

      actions.textContent = '';
      if (confirming) {
        const confirm = element('button', 'Confirm restore', 'icon-btn');
        confirm.type = 'button';
        confirm.id = 'settings-confirm';
        confirm.title = 'Put every setting back to its default now';
        confirm.addEventListener('click', () => {
          confirming = false;
          Settings.reset();
          toast('Settings restored to defaults');
          paint(true);
        });
        const cancel = element('button', 'Cancel', 'icon-btn');
        cancel.type = 'button';
        cancel.id = 'settings-cancel';
        cancel.title = 'Keep the settings as they are';
        cancel.addEventListener('click', () => { confirming = false; paint(true); });
        actions.append(confirm, cancel);
      } else {
        const restore = element('button', 'Restore default settings', 'icon-btn');
        restore.type = 'button';
        restore.id = 'settings-restore';
        const something = rows.length > 0 || viewsDiffer();
        restore.disabled = !something;
        restore.title = something ? 'Put every setting back to its default (asks to confirm first)' : 'Nothing to restore';
        restore.addEventListener('click', () => { confirming = true; paint(true); });
        actions.appendChild(restore);
      }
    };

    const afterQuiet = () => { fillDiffer(); if (live) live.signature = shownSignature(); };
    host.append(...dataSection(afterQuiet, (id) => paint(false, id)));
    host.append(...remoteActionsSection((id) => paint(false, id), afterQuiet));
    if (Features.has('calls.test')) host.append(...sendingSection((id) => paint(false, id)));
    host.append(...designerSection((value) => paint(false, value ? `settings-designer:${value}` : null), afterQuiet));
    fillDiffer();
    host.appendChild(actions);

    host.appendChild(element('h3', 'Tools'));
    const tools = element('div', undefined, 'settings-actions settings-tools');
    if (Features.has('shell.bundle')) {
      tools.appendChild(bundleButton());
      tools.append(...bundleOpenControl(afterOpen));
    }
    if (Features.has('shell.compare-json')) tools.appendChild(compareJsonButton(afterOpen));
    tools.appendChild(reportButton());
    host.appendChild(tools);
    host.append(...settingsPointer());

    // Redrawing drops the pressed button: keep the keyboard where it was.
    live = {
      host, signature: shownSignature(),
      repaint: () => {
        const inside = host.contains(document.activeElement) ? document.activeElement.dataset.seg : null;
        paint(false, inside);
      }
    };
    const pressed = seg && Array.from(host.querySelectorAll('[data-seg]')).find((node) => node.dataset.seg === seg);
    if (pressed) { pressed.focus(); return; }
    if (focusAfter && host.contains(document.activeElement) === false) {
      const target = host.querySelector('#settings-confirm, #settings-restore:not(:disabled)') || host;
      target.focus();
    }
  };

  host.className = 'settings-sections';
  host.tabIndex = -1;
  paint(false);
}

/* The gear in the top bar: always there, with a small count badge once a
 * setting differs from its default. The text label stays for screen readers
 * and the count is spelled out in the aria-label and the tooltip. */
function mountGear(button) {
  const badge = document.createElement('span');
  badge.className = 'custom-count';
  badge.setAttribute('aria-hidden', 'true');
  button.appendChild(badge);

  const update = () => {
    const count = customRows().length;
    badge.hidden = count === 0;
    badge.textContent = String(count);
    const differs = count === 1 ? '1 setting differs from its default' : `${count} settings differ from their defaults`;
    button.setAttribute('aria-label', count ? `Settings: ${differs}` : 'Settings');
    button.title = count ? `${differs}. Open Settings (,)` : 'Settings (,)';
  };
  Settings.onChange(update);
  update();
}

/* Wires the dialog and the gear; returns the overlay so the shell can open it
 * from the comma key. */
export function mountSettingsOverlay() {
  const body = document.getElementById('settings-body');
  const card = document.querySelector('#settings-overlay .settings-card');
  const gear = document.getElementById('settings');
  mountGear(gear);
  Settings.provide(() => ({ showFrameRow: Settings.get('showFrameRow') === true, maskAtStart: Settings.get('maskAtStart') === true }));
  Settings.onChange(paintFrameRow);
  paintFrameRow();
  const overlay = createOverlay({
    overlay: document.getElementById('settings-overlay'),
    card,
    button: gear,
    closeButton: document.getElementById('settings-close'),
    onOpen: () => renderSettingsSection(body, { afterOpen: () => overlay.close() }),
    initialFocus: () => card
  });
  return overlay;
}
