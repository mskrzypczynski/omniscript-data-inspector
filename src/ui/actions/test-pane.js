'use strict';

/* The Calls tab's Test call form. It takes the detail pane's place
 * (the list stays), is opened from Re-run… or New test call…, and sends one call to
 * the org of the page, the way the page itself would, through Targets.send.
 * What a draft is, whether it may be sent and which request it makes is
 * decided in src/core/actions/test-calls.js and call-wire.js; this module
 * draws it and keeps the one rule: nothing is sent without a press on Send (or
 * on the Send of the question Re-run as it was… asks).
 *
 * The page hands the answer back and it is listed at once as a call carrying
 * the test tag; the form then closes onto it. Closing the form never cancels a
 * call already sent, and the draft of a re-run is kept for the life of the tab. */

import { decorateButton } from '../icons.js';
import { Settings } from '../settings.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { Targets } from '../targets.js';
import { toast } from '../toast.js';
import { actionToast } from './action-toast.js';
import { openContextMenu } from '../context-menu.js';
import { inputText } from '../../core/actions/actions-apex.js';
import { maskedName, failed } from '../../core/shared/actions-model.js';
import { tookText } from '../../core/shared/actions-timing.js';
import { flavourForOrigin, callsForOrigin } from '../../core/shared/designer-link.js';
import {
  sendGate, gateWords, canRerun, parseJsonText, errorLine, formatJsonText, optionsSummary, draftFromEntry, draftNew, applyName, applyUrl,
  requestOfDraft, modelFor, headLine, pickableCalls, newToken, signatureOfDraft, dropStale, markGaveUp, textOfValue, formPhase, isRest,
  hiddenBy, hiddenToastWords, landedWords, sentWords, confirmWords, closeTitle, draftKey,
  KIND_WORDS, NAME_LABEL, NEW_KINDS, MASK_WORDS, GAVE_UP_WORDS, REST_OPTIONS_NOTE, isDebugDraft, formTitle, DEBUG_NOTE
} from '../../core/actions/test-calls.js';
import {
  listRows, valueAt, suggestName, originalInput, emptyMemory, remember, recall, addPicked, replacePicked, pickStatus, normalName,
  addedWords, moreWords, REPLACED_WORDS, NO_DATA_WORDS, WHOLE_LABEL
} from '../../core/actions/data-picker.js';
import { tagClasses } from '../../core/shared/tag-tone.js';

const clock = (time) => new Date(time).toLocaleTimeString();

function node(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

function button(label, title, onClick, { icon, className = 'icon-btn tiny' } = {}) {
  const made = node('button', className);
  made.type = 'button';
  if (icon) decorateButton(made, icon, label); else made.textContent = label;
  made.title = title;
  made.addEventListener('click', onClick);
  return made;
}

/* state: the tab's state. el: { detail, list, newCall }. paint(): draws the
 * detail pane again. showCall(id): selects a call. recordSent(sent): lists the
 * answer the page handed back and returns the ids of its rows. filterOpts():
 * the filters in force, for telling when a filter hides the call just sent.
 * showAll(): clears every filter. redraw(): the tab's redraw. onToggle(open,
 * isNew): the form opened or closed. */
export function createTestPane({
  state, el, paint, showCall, recordSent = () => [], filterOpts = () => ({}), showAll = () => {}, redraw = () => {}, onToggle = () => {}
}) {
  let seq = 0;
  const asItWasBusy = new Set(); // calls Re-run as it was has sent and not yet seen land
  // The names given to picked nodes, per procedure, while DevTools is open: never stored.
  let pickMemory = emptyMemory();
  let pickerView = null; // the open picker's in-place updates (its foot follows the Input box)

  const allowed = () => Settings.get('allowTestCalls') === true;
  const gateNow = () => ({ allowed: allowed(), session: !!state.session, recording: state.recording });
  const isOpen = () => !!state.testDraft;
  const paused = () => state.recording === false;

  /* ------------------------------------------------- opening and closing */

  /* The edits of a re-run are kept under the call, so opening Re-run… on it
   * again brings them back. */
  function keepDraft(form) {
    const key = draftKey(form.draft);
    if (key) state.testDrafts.set(key, form.draft);
  }

  /* Closing never cancels a call already sent: it is on its way, and lands in
   * the list. `restore` puts the keyboard back where the form was opened from. */
  function close({ restore = false } = {}) {
    const form = state.testDraft;
    if (!form) return;
    keepDraft(form);
    state.testDraft = null;
    onToggle(false, !form.draft.rerun);
    paint();
    if (restore) returnFocus(form);
  }

  function returnFocus(form) {
    const target = (form.from === 'new' ? el.newCall : null) ||
      (form.from === 'detail' ? el.detail.querySelector('#detail-rerun') : null) ||
      el.list.querySelector('.log-row.is-selected');
    if (target && target.focus) target.focus();
  }

  /* from: 'detail' (the Re-run… button), 'menu' (the row menu) or 'new'
   * (New test call…): where the keyboard goes back to when the form closes. */
  function open(draft, from, original = null) {
    state.testDraft = {
      id: ++seq, draft, status: 'idle', message: '', token: '', optionsOpen: false, wireOpen: draft.guess, from, original, picker: null
    };
    onToggle(true, !draft.rerun);
    paint();
    // A New test call needs its name first; anything else starts at the input.
    const name = el.detail.querySelector('#test-name');
    const box = name && !draft.name.trim() ? name : el.detail.querySelector('.test-input');
    if (box) box.focus();
  }

  /* Re-run…: the form, prefilled from the call, or from the edits kept for it. */
  function openRerun(entry, from = 'detail') {
    if (!sendGate(gateNow()).ok || !canRerun(entry)) return;
    open(state.testDrafts.get(`rerun:${entry.id}`) || draftFromEntry(entry), from, originalInput(entry));
  }

  /* What flavour the org's calls say, for the namespace of a guess. */
  function namespaceGuess(origin) {
    const found = flavourForOrigin({
      hosts: Targets.hosts(), calls: callsForOrigin(state.entries, origin), setting: { mode: Settings.get('designerMode'), namespace: Settings.get('designerNs') }
    });
    return found.flavour === 'managed' ? found.namespace : 'omnistudio';
  }

  /* New test call…: from the latest call of the kind. */
  function openNew(kind = 'IP') {
    if (!sendGate(gateNow()).ok) return;
    Targets.sendOrigin((origin) => {
      open(draftNew(kind, { entries: state.entries, envelopes: state.envelopes, origin, namespace: namespaceGuess(origin) }), 'new');
    });
  }

  /* ------------------------------------------------------------- sending */

  /* Builds the request and hands it to the page. report(message, status,
   * token, info) says how it went: status 'failed' (nothing is on its way),
   * 'sent' (waiting for the answer), 'gaveup' (the panel stopped waiting; the
   * call may still be running) or 'listed' (the answer is a row; info has its
   * ids and the HTTP status). */
  function transmit(draft, origin, report, form = null) {
    const model = modelFor(draft, state.envelopes, origin);
    const gate = sendGate({
      ...gateNow(), live: !!origin, envelope: model.reason !== 'no-model', kind: model.reason !== 'no-kind'
    }, true);
    if (!gate.ok) { report(gateWords(gate.reason, origin), 'failed'); return; }
    const token = newToken(++state.testSeq, Math.random());
    const made = requestOfDraft(draft, state.envelopes, origin, token);
    if (!made.ok) { report(made.why, 'failed'); return; }
    const sentAt = Date.now();
    state.pendingTests = dropStale(state.pendingTests, sentAt).concat([{
      token, rerunOf: draft.rerun ? draft.rerun.id : null, rerunTime: draft.rerun ? draft.rerun.time : null,
      signature: signatureOfDraft(draft), sentAt
    }]);
    if (form) form.token = token;
    report('Sent · waiting for the answer…', 'sent');
    Targets.send(made.request, (outcome) => {
      if (outcome.gaveUp) {
        /* The call is not cancelled and may still answer: its pending entry
         * stays, so a late row is still told for the test it was. */
        state.pendingTests = markGaveUp(state.pendingTests, token);
        report(GAVE_UP_WORDS, 'gaveup', token);
        return;
      }
      if (outcome.ok || outcome.status > 0) {
        /* The server answered: the page handed the answer back, so the call is
         * listed from it at once (the network stream, when it also sees it, is
         * deduplicated by the token). */
        const ids = recordSent({
          kind: made.kind, request: made.request, token, status: outcome.status, text: outcome.text, truncated: outcome.truncated, ms: outcome.ms, sentAt
        });
        report('', 'listed', token, { ids, status: outcome.status });
        return;
      }
      state.pendingTests = state.pendingTests.filter((item) => item.token !== token);
      report(`The page could not send it: ${outcome.error || 'no answer'}`, 'failed', token);
    });
  }

  function send() {
    const form = state.testDraft;
    if (!form) return;
    const phase = formPhase(form.status);
    // One press, one call: a second press while one is going out or waiting does nothing.
    if (phase.busy || phase.locked || paused()) return;
    form.status = 'sending';
    form.message = '';
    refreshControls();
    refreshStatus();
    Targets.sendOrigin((origin) => {
      // Closing the form while the origin is read does not cancel the send: it goes, and lands in the list.
      transmit(form.draft, origin, (message, status, token, info) => {
        if (state.testDraft !== form || (token && token !== form.token)) return;
        if (status === 'listed') {
          settle();
          // Still open: the row is not in the list (the cap dropped it).
          if (state.testDraft === form) { form.status = 'idle'; form.message = `Sent · the server answered HTTP ${info.status}`; }
        } else {
          form.message = message;
          form.status = status;
        }
        refreshControls();
        refreshStatus();
      }, form);
    });
  }

  /* After a redraw of the list: the answer to the open form's send may be
   * there. The form closes onto it. */
  function settle() {
    const form = state.testDraft;
    if (!form || !form.token) return;
    const answer = state.entries.find((entry) => entry.test && entry.test.token === form.token);
    if (!answer) return;
    keepDraft(form);
    state.testDraft = null;
    onToggle(false, !form.draft.rerun);
    announce(answer);
  }

  /* Selects the call just sent. If a filter keeps it out of the list, the list
   * says so (and how to see it) instead of leaving the detail without a row.
   * Returns the name of the filter, or ''. */
  function announce(entry, { select = true } = {}) {
    const by = hiddenBy(entry, filterOpts());
    if (!select) return by;
    state.hiddenSent = by ? entry.id : null;
    // The answer to a debug run opens on what happened inside it.
    if (entry.debug) state.detailTab = 'debug';
    showCall(entry.id);
    if (by) redraw();
    return by;
  }

  /* Re-run as it was…: asks first, every time; the question's Send sends. */
  function rerunAsItWas(entry) {
    if (!sendGate(gateNow()).ok || !canRerun(entry) || paused()) return;
    if (asItWasBusy.has(entry.id)) { toast('This call is already being sent'); return; }
    const name = maskedName(entry, Mask.apply);
    actionToast(confirmWords(name, Mask.on()), 'Send', 'Send this call again exactly as it was, to the org of this page, as your user',
      () => sendAsItWas(entry));
  }

  function sendAsItWas(entry) {
    if (asItWasBusy.has(entry.id)) return;
    asItWasBusy.add(entry.id);
    const release = () => asItWasBusy.delete(entry.id);
    Targets.sendOrigin((origin) => {
      transmit(draftFromEntry(entry), origin, (message, status, token, info) => {
        if (status === 'sent') { toast(sentWords(Mask.on())); return; }
        release();
        if (status !== 'listed') { toast(message); return; }
        const row = state.entries.find((candidate) => info.ids.includes(candidate.id));
        if (!row) { toast(`Sent · the server answered HTTP ${info.status}`); return; }
        // Another form is open: its edits are not taken away for a call sent from the menu.
        const by = announce(row, { select: !state.testDraft });
        if (by) {
          actionToast(hiddenToastWords(by), 'Show all', 'Clear every filter so the call you sent has a row', showAll, { ms: 8000 });
        } else {
          toast(landedWords({
            status: row.httpStatus, took: tookText(row, state.timeFormat), failed: failed(row), truncated: !!(row.test && row.test.truncated)
          }));
        }
      });
    });
  }

  /* -------------------------------------------------------------- drawing */

  const dirtyLine = (box, line, parsed) => {
    box.classList.toggle('is-invalid', !parsed.ok);
    box.setAttribute('aria-invalid', String(!parsed.ok));
    line.hidden = parsed.ok;
    line.textContent = parsed.ok ? '' : errorLine(parsed);
  };

  /* A JSON box: the text area, the red line under it, and the draft key it edits. */
  function jsonBox(form, key, { label, id, rows }) {
    const box = node('textarea', 'test-text');
    box.id = id;
    box.rows = rows;
    box.spellcheck = false;
    box.value = form.draft[key];
    box.setAttribute('aria-label', label);
    const line = node('div', 'test-error');
    line.id = `${id}-error`;
    line.setAttribute('role', 'alert');
    box.setAttribute('aria-describedby', line.id);
    dirtyLine(box, line, parseJsonText(box.value));
    box.addEventListener('input', () => {
      form.draft[key] = box.value;
      dirtyLine(box, line, parseJsonText(box.value));
      edited(form);
      refreshControls();
    });
    return { box, line };
  }

  let controls = null; // what refreshControls and refreshStatus update in place

  /* A new edit after a failure, or after the panel gave up waiting, starts the
   * form over: Send is there again. */
  function edited(form) {
    if (form.status !== 'failed' && form.status !== 'gaveup') return;
    form.status = 'idle';
    form.message = '';
    refreshStatus();
  }

  function valid(form) {
    return parseJsonText(form.draft.input).ok && parseJsonText(form.draft.options).ok &&
      (!['IP', 'DR'].includes(form.draft.kind) || isDebugDraft(form.draft) || form.draft.name.trim() !== '');
  }

  function refreshControls() {
    const form = state.testDraft;
    if (!controls || !form) return;
    const phase = formPhase(form.status);
    const holdUp = paused();
    controls.send.disabled = !valid(form) || phase.busy || phase.locked || holdUp;
    if (holdUp) controls.send.title = gateWords('paused');
    else if (phase.busy) controls.send.title = 'Waiting for the answer to the call just sent';
    else if (phase.locked) controls.send.title = 'The call just sent may still be running. Edit the call to send it again, or close the form.';
    else if (valid(form)) controls.send.title = 'Send this call to the org of this page, as your user (Ctrl/Cmd+Enter)';
    else controls.send.title = 'Fix the input first: it is not valid JSON, or the name is empty';
    controls.close.title = closeTitle(form.status);
    controls.closeTop.title = `${closeTitle(form.status)} (Esc)`;
    controls.format.disabled = !parseJsonText(form.draft.input).ok;
    controls.optionsSummary.textContent = optionsSummary(form.draft.options, isRest(form.draft));
    if (pickerView) pickerView.refresh();
    refreshStatus();
  }

  function refreshStatus() {
    const form = state.testDraft;
    if (!controls || !form) return;
    const phase = formPhase(form.status);
    // With Recording paused the form says why Send is out of use.
    const hint = paused() && !phase.busy ? `${gateWords('paused')}: resume it to send this call` : '';
    controls.status.textContent = form.message || hint;
    controls.status.classList.toggle('is-bad', phase.bad || (!form.message && !!hint));
  }

  function field(labelText, input, hintText) {
    const wrap = node('label', 'test-field');
    wrap.append(node('span', 'test-label', labelText), input);
    if (hintText) wrap.title = hintText;
    return wrap;
  }

  function textField(form, key, labelText, title, { after, id } = {}) {
    const input = node('input', 'test-line');
    if (id) input.id = id;
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = form.draft[key];
    input.title = title;
    input.addEventListener('input', () => {
      form.draft = after ? after(form.draft, input.value) : { ...form.draft, [key]: input.value };
      edited(form);
      if (key === 'name') {
        // A Data Mapper's name travels in a box: keep that box in step.
        const options = el.detail.querySelector('.test-options');
        const inputBox = el.detail.querySelector('.test-input');
        if (options) options.value = form.draft.options;
        if (inputBox) inputBox.value = form.draft.input;
        const head = el.detail.querySelector('.test-meta');
        if (head) head.textContent = headLine(form.draft, clock);
      }
      refreshControls();
    });
    return field(labelText, input, title);
  }

  /* Takes another call's input, picked from the calls of the same kind. */
  function pickFromCall(ev, form, inputBox) {
    // The call the form came from is in the list too: it is the way back to its own input.
    const calls = pickableCalls(state.entries, form.draft);
    const items = calls.length
      ? calls.map((entry) => ({
        label: `${clock(entry.time)} · ${entry.name}`,
        action: () => { form.draft.input = inputText(entry); inputBox.value = form.draft.input; inputBox.dispatchEvent(new Event('input')); }
      }))
      : [{ label: 'No other call of this kind', disabled: true, action: () => {} }];
    const box = ev.currentTarget.getBoundingClientRect();
    openContextMenu({ clientX: box.left, clientY: box.bottom, type: ev.type, detail: ev.detail }, items);
  }

  /* ------------------------------------------------ From the data… picker */

  const dataNow = () => {
    const read = Shared.payload();
    return read ? read.data : undefined;
  };

  /* The picker's state lives in the form (so it survives a redraw and comes
   * back on reopening) and goes with it when the form closes. */
  function pickerOf(form) {
    if (!form.picker) form.picker = { open: false, query: '', picks: new Map(), whole: false, seeded: false, pinned: [] };
    return form.picker;
  }

  /* The nodes this procedure was given names for the last time, ticked again. */
  function seedPicks(form, picker, data) {
    if (picker.seeded || data === undefined) return;
    picker.seeded = true;
    const kept = recall(pickMemory, signatureOfDraft(form.draft), data);
    picker.pinned = kept.map((pick) => pick.path);
    const rows = new Map(listRows(data, '', { first: picker.pinned }).rows.map((row) => [row.path, row]));
    kept.forEach((pick) => { if (rows.has(pick.path)) picker.picks.set(pick.path, { name: pick.name, row: rows.get(pick.path) }); });
  }

  const originalOf = (form) => form.original || originalInput(state.entries.find((entry) => form.draft.rerun && entry.id === form.draft.rerun.id));

  /* Opens or closes the picker under the Input bar. */
  function togglePicker(form, slot, inputBox, fromButton) {
    const picker = pickerOf(form);
    if (picker.open) { closePicker(form, slot, fromButton, true); return; }
    picker.open = true;
    fromButton.setAttribute('aria-expanded', 'true');
    drawPicker(form, slot, inputBox, fromButton);
    const first = slot.querySelector('.test-picker-filter') || slot.querySelector('.test-picker-close');
    if (first) first.focus();
  }

  function closePicker(form, slot, fromButton, restore) {
    const picker = pickerOf(form);
    picker.open = false;
    pickerView = null;
    slot.textContent = '';
    fromButton.setAttribute('aria-expanded', 'false');
    if (restore) fromButton.focus();
  }

  function drawPicker(form, slot, inputBox, fromButton) {
    const picker = pickerOf(form);
    const data = dataNow();
    seedPicks(form, picker, data);
    slot.textContent = '';
    pickerView = null;

    const section = node('section', 'test-picker');
    section.id = 'test-picker';
    section.setAttribute('aria-label', 'Pick nodes from the data');
    slot.appendChild(section);
    const quit = () => closePicker(form, slot, fromButton, true);

    const closeButton = button('Close', 'Close the picker; what you ticked is kept while the form is open (Esc)', quit, { className: 'icon-btn tiny test-picker-close' });
    closeButton.id = 'test-picker-close';
    if (data === undefined) {
      const empty = node('div', 'test-picker-empty');
      empty.append(node('span', 'test-picker-none', NO_DATA_WORDS), closeButton);
      section.appendChild(empty);
      section.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); quit(); }
      });
      return;
    }

    const original = originalOf(form);
    const filter = node('input', 'test-line test-picker-filter');
    filter.id = 'test-picker-filter';
    filter.type = 'text';
    filter.spellcheck = false;
    filter.autocomplete = 'off';
    filter.placeholder = 'Filter nodes by path or value';
    filter.title = 'Narrow the list: every word must be in the node\'s path or value.';
    filter.setAttribute('aria-label', 'Filter the nodes of the data');
    filter.value = picker.query;

    const list = node('div', 'test-picker-list');
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Nodes of the data JSON');
    const more = node('div', 'test-picker-more');
    const words = node('span', 'test-picker-words');
    words.setAttribute('role', 'status');
    words.setAttribute('aria-live', 'polite');
    const add = button('Add to input', 'Merge the ticked nodes into the JSON in the Input box (Ctrl/Cmd+Enter)', () => applyPick('add'),
      { className: 'icon-btn tiny test-picker-add' });
    add.id = 'test-picker-add';
    const replace = button('Replace input', 'Make the Input box an object of the ticked nodes alone', () => applyPick('replace'),
      { className: 'icon-btn tiny test-picker-replace' });
    replace.id = 'test-picker-replace';
    const foot = node('div', 'test-picker-foot');
    foot.append(words, add, replace, closeButton);
    section.append(filter, list, more, foot);

    const rowEls = () => [...list.querySelectorAll('.test-pick-row')];

    /* The ticked nodes in the order they were ticked, as the core wants them. */
    const named = () => [...picker.picks.values()].map((pick) => ({ name: pick.name }));

    function syncRow(rowEl) {
      const path = rowEl.dataset.path;
      const pick = picker.picks.get(path);
      const whole = path === '' && rowEl.classList.contains('is-whole');
      const ticked = whole ? picker.whole : !!pick;
      rowEl.querySelector('.test-pick-check').checked = ticked;
      rowEl.classList.toggle('is-ticked', ticked);
      const as = rowEl.querySelector('.test-pick-as');
      if (!as) return;
      as.hidden = !pick;
      if (!pick) return;
      const nameBox = rowEl.querySelector('.test-pick-name');
      if (nameBox.value !== pick.name) nameBox.value = pick.name;
      const suggested = suggestName(pick.row, original);
      const note = rowEl.querySelector('.test-pick-sent');
      note.hidden = !(suggested.sentAs && normalName(pick.name) === suggested.name);
      note.textContent = `sent as ${suggested.name}`;
    }

    /* The foot, Add and Replace, and the marks on rows whose names clash or are already in the input. */
    function refresh() {
      const status = pickStatus(form.draft.input, named(), { whole: picker.whole });
      words.textContent = status.words;
      words.className = `test-picker-words${status.tone ? ` is-${status.tone}` : ''}`;
      add.disabled = !status.canAdd;
      replace.disabled = !status.canReplace;
      rowEls().forEach((rowEl) => {
        const pick = picker.picks.get(rowEl.dataset.path);
        const name = pick ? normalName(pick.name) : '';
        const clash = !!pick && status.clash.includes(name);
        rowEl.classList.toggle('is-clash', clash);
        rowEl.classList.toggle('is-replace', !!pick && !clash && status.replaced.includes(name));
        const nameBox = rowEl.querySelector('.test-pick-name');
        if (nameBox) nameBox.setAttribute('aria-invalid', String(clash));
      });
    }
    pickerView = { refresh };

    function tick(rowEl, row, on) {
      if (row.whole) {
        picker.whole = on;
        if (on) picker.picks.clear();
      } else if (on) {
        picker.whole = false;
        if (!picker.picks.has(row.path)) picker.picks.set(row.path, { name: suggestName(row, original).name, row });
      } else {
        picker.picks.delete(row.path);
      }
      rowEls().forEach(syncRow);
      refresh();
    }

    function rowFor(row) {
      const el = node('div', `test-pick-row${row.whole ? ' is-whole' : ''}${row.context ? ' is-context' : ''}${row.depth > 1 && !picker.query ? ' is-child' : ''}`);
      el.setAttribute('role', 'listitem');
      el.tabIndex = -1;
      el.dataset.path = row.path;
      const main = node('label', 'test-pick-main');
      const check = node('input', 'test-pick-check');
      check.type = 'checkbox';
      check.tabIndex = -1;
      check.title = row.whole ? 'Use the whole data JSON as the input' : 'Put this node in the input';
      check.setAttribute('aria-label', row.whole ? WHOLE_LABEL : `Pick ${row.label}`);
      check.addEventListener('change', () => tick(el, row, check.checked));
      const path = node('span', 'test-pick-path', row.label);
      path.title = row.whole ? 'The data JSON as the Data tab reads it. It replaces the input.' : `${row.label}: ${row.size}`;
      main.append(check, path, node('span', 'test-pick-size', row.size));
      el.appendChild(main);
      if (!row.whole) {
        const as = node('span', 'test-pick-as');
        as.hidden = true;
        const name = node('input', 'test-line test-pick-name');
        name.type = 'text';
        name.spellcheck = false;
        name.autocomplete = 'off';
        name.title = 'The key this node has in the input. A dotted name nests it: Context.Account.';
        name.setAttribute('aria-label', `Name of ${row.label} in the input`);
        name.addEventListener('input', () => {
          const pick = picker.picks.get(row.path);
          if (pick) pick.name = name.value;
          syncRow(el);
          refresh();
        });
        name.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); el.focus(); }
        });
        as.append(node('span', 'test-pick-aslabel', 'as'), name, node('span', 'test-pick-sent'));
        el.appendChild(as);
      }
      el.addEventListener('focus', () => rowEls().forEach((other) => { other.tabIndex = other === el ? 0 : -1; }));
      el.addEventListener('keydown', (ev) => {
        if (ev.target !== el || ev.ctrlKey || ev.metaKey) return;
        const rows = rowEls();
        const at = rows.indexOf(el);
        const go = (index) => { ev.preventDefault(); if (rows[index]) rows[index].focus(); };
        if (ev.key === 'ArrowDown') go(Math.min(at + 1, rows.length - 1));
        else if (ev.key === 'ArrowUp') { if (at === 0) { ev.preventDefault(); filter.focus(); } else go(at - 1); }
        else if (ev.key === 'Home') go(0);
        else if (ev.key === 'End') go(rows.length - 1);
        else if (ev.key === ' ') { ev.preventDefault(); tick(el, row, !(row.whole ? picker.whole : picker.picks.has(row.path))); }
        else if (ev.key === 'Enter') {
          ev.preventDefault();
          if (row.whole) { if (!picker.whole) tick(el, row, true); return; }
          if (!picker.picks.has(row.path)) tick(el, row, true);
          const nameBox = el.querySelector('.test-pick-name');
          nameBox.focus();
          nameBox.select();
        }
      });
      syncRow(el);
      return el;
    }

    function fillList() {
      const result = listRows(data, picker.query, { mask: Mask.apply, first: picker.pinned });
      list.textContent = '';
      result.rows.forEach((row) => list.appendChild(rowFor(row)));
      const rows = rowEls();
      if (rows[0]) rows[0].tabIndex = 0;
      more.textContent = result.more ? moreWords(result.more) : '';
      more.hidden = !result.more;
      refresh();
    }

    filter.addEventListener('input', () => { picker.query = filter.value; fillList(); });
    filter.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') {
        const first = rowEls()[0];
        if (first) { ev.preventDefault(); first.focus(); }
      }
    });
    section.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); quit(); return; }
      // Ctrl/Cmd+Enter is Add to input here, not Send.
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!add.disabled) applyPick('add');
      }
    });

    /* Puts the picked nodes in the Input box through the same input event the
     * box's own typing fires, so the checks and Send follow. */
    function applyPick(mode) {
      const latest = dataNow();
      let text;
      let toastWords = REPLACED_WORDS;
      if (picker.whole) {
        text = textOfValue(latest);
      } else {
        const picks = [];
        for (const [path, pick] of picker.picks) {
          const found = valueAt(latest, path);
          if (!found.found) { words.textContent = `${pick.row.label} is no longer in the data`; words.className = 'test-picker-words is-bad'; return; }
          picks.push({ name: pick.name, value: found.value });
        }
        const made = mode === 'add' ? addPicked(form.draft.input, picks) : replacePicked(picks);
        if (!made.ok) { words.textContent = made.why; words.className = 'test-picker-words is-bad'; return; }
        text = made.text;
        if (mode === 'add') toastWords = addedWords(picks.length);
        pickMemory = remember(pickMemory, signatureOfDraft(form.draft), [...picker.picks].map(([path, pick]) => ({ path, name: normalName(pick.name) })));
      }
      form.draft.input = text;
      inputBox.value = text;
      inputBox.dispatchEvent(new Event('input'));
      closePicker(form, slot, fromButton, true);
      toast(toastWords);
    }

    fillList();
  }

  function fold(form, flag, summaryText, title) {
    const details = node('details', 'test-fold');
    details.open = !!form[flag];
    details.addEventListener('toggle', () => { form[flag] = details.open; });
    const summary = node('summary', undefined, summaryText);
    summary.title = title;
    details.appendChild(summary);
    return { details, summary };
  }

  function wireFold(form) {
    const { details } = fold(form, 'wireOpen', 'Request (class, method, endpoint)',
      'Where the call goes and how it is addressed. Copied from a captured call; edit it only to correct a wrong guess.');
    const draft = () => form.draft;
    if (draft().guess) {
      details.appendChild(node('p', 'test-note',
        'No call of this kind has been captured on this page, so the class and method below are a guess from the package namespace. Correct them if the call fails.'));
    }
    const kind = draft().kind;
    if (kind !== 'APEX' || draft().remoteClass) {
      details.appendChild(textField(form, 'remoteClass', 'Class', 'The remote class the call asks the server to run (sClassName)'));
    }
    if (kind !== 'IP') {
      details.appendChild(textField(form, 'remoteMethod', 'Method', 'The remote method (sMethodName); for a Data Mapper the invoke method'));
    }
    if (!draft().remoteClass && (draft().apexClass || draft().apexMethod)) {
      details.appendChild(textField(form, 'apexClass', 'Apex class', 'The Apex class the page called'));
      details.appendChild(textField(form, 'apexMethod', 'Apex method', 'The Apex method the page called'));
    }
    details.appendChild(textField(form, 'namespace', 'Namespace', 'The package namespace sent with the call, when the request carries one'));
    details.appendChild(textField(form, 'url', 'Endpoint', 'The address the request goes to. It must be an endpoint of the same kind as the request it was copied from, on the origin of this script. A REST call follows the name until you edit this.',
      { after: (draft, value) => applyUrl(draft, value) }));
    return details;
  }

  function render(pane) {
    const form = state.testDraft;
    pane.textContent = '';
    controls = null;
    pickerView = null;
    if (!form) return;

    const root = node('div', 'test-pane');
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close({ restore: true }); return; }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        if (!controls.send.disabled) send();
      }
    });

    const head = node('div', 'detail-head test-head');
    head.appendChild(node('div', 'detail-title', formTitle(form.draft)));
    const meta = node('div', 'detail-meta test-meta', headLine(form.draft, clock));
    head.appendChild(meta);
    // The one reminder of what Send does, where it is pressed.
    head.appendChild(node('div', 'test-warn-line', 'Runs in your org as your user; can change records.'));
    if (Mask.on()) {
      const chip = node('span', `${tagClasses('warn')} test-mask-chip`, MASK_WORDS);
      chip.title = 'A call cannot be sent masked: it goes out as written. Results stay masked.';
      head.appendChild(chip);
    }
    /* The same corner close as the help and Settings dialogs: the Close at the
     * bottom is out of view behind a long input. */
    const closeTop = button('✕', `${closeTitle(form.status)} (Esc)`, () => close({ restore: true }), { className: 'icon-btn tiny help-close test-close-top' });
    closeTop.id = 'test-close-top';
    closeTop.setAttribute('aria-label', 'Close the test call form');
    head.appendChild(closeTop);
    root.appendChild(head);

    const body = node('div', 'test-body');
    // A debug run has no name to type: the request names the procedure by its Id, a DataRaptor in its options.
    const named = ['IP', 'DR'].includes(form.draft.kind) && !isDebugDraft(form.draft);
    if (isDebugDraft(form.draft)) body.appendChild(node('p', 'test-note test-debug-note', DEBUG_NOTE));
    if (named) {
      body.appendChild(textField(form, 'name', NAME_LABEL[form.draft.kind],
        form.draft.kind === 'IP' ? 'The key of the Integration Procedure to call, Type_SubType' : 'The Data Mapper bundle to call',
        { after: (draft, value) => applyName(draft, value), id: 'test-name' }));
    }

    const inputBar = node('div', 'test-bar');
    inputBar.appendChild(node('span', 'test-label', 'Input'));
    const input = jsonBox(form, 'input', { label: 'Input JSON', id: 'test-input', rows: 10 });
    input.box.classList.add('test-input');
    const format = button('Format', 'Pretty-print the input JSON', () => {
      const text = formatJsonText(input.box.value);
      if (text === null) return;
      form.draft.input = text;
      input.box.value = text;
      input.box.dispatchEvent(new Event('input'));
    });
    const pickerSlot = node('div', 'test-picker-slot');
    const fromData = button('From the data…', 'Pick nodes of the script\'s current data and put them in the input under the names the call reads',
      () => togglePicker(form, pickerSlot, input.box, fromData));
    fromData.id = 'test-from-data';
    fromData.setAttribute('aria-expanded', 'false');
    fromData.setAttribute('aria-controls', 'test-picker');
    const fromCall = button('From a call…', 'Take the input of another captured call of this kind',
      (ev) => pickFromCall(ev, form, input.box));
    inputBar.append(format, fromData, fromCall);
    body.append(inputBar, pickerSlot, input.box, input.line);
    if (pickerOf(form).open) drawPicker(form, pickerSlot, input.box, fromData);
    fromData.setAttribute('aria-expanded', String(pickerOf(form).open));

    const options = fold(form, 'optionsOpen', optionsSummary(form.draft.options, isRest(form.draft)),
      'The options the call carries (chainable, queueable and so on). A REST call sends only the input.');
    if (isRest(form.draft)) options.details.appendChild(node('p', 'test-note test-rest-note', REST_OPTIONS_NOTE));
    const optionBox = jsonBox(form, 'options', { label: 'Options JSON', id: 'test-options', rows: 5 });
    optionBox.box.classList.add('test-options');
    options.details.append(optionBox.box, optionBox.line);
    body.appendChild(options.details);

    // The wire of a debug run is the designer's own remoting call: nothing in it is for editing.
    if (!isDebugDraft(form.draft)) body.appendChild(wireFold(form));

    const status = node('div', 'test-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    body.appendChild(status);

    const actions = node('div', 'test-actions');
    const sendButton = button('Send', 'Send this call to the org of this page, as your user (Ctrl/Cmd+Enter)', send,
      { icon: 'play', className: 'icon-btn tiny test-send' });
    sendButton.id = 'test-send';
    const closeButton = button('Close', closeTitle(form.status), () => close({ restore: true }));
    closeButton.id = 'test-close';
    actions.append(sendButton, closeButton);
    body.appendChild(actions);
    root.appendChild(body);
    pane.appendChild(root);

    controls = { send: sendButton, close: closeButton, closeTop, format, status, optionsSummary: options.summary };
    refreshControls();
    refreshStatus();
  }

  /* The form's own state, for the detail pane to tell when it needs drawing.
   * Its status is not part of it: Send and the status line change in place, so
   * a poll never rebuilds the form under the cursor. */
  const key = () => (state.testDraft ? `test:${state.testDraft.id}:${Mask.on()}` : '');

  /* Recording was paused or resumed: Send follows. */
  const refresh = () => refreshControls();

  /* The edits kept for re-runs go with the setting (and with Clear). */
  const forgetDrafts = () => { state.testDrafts.clear(); pickMemory = emptyMemory(); };

  return { isOpen, open, openRerun, openNew, rerunAsItWas, close, render, settle, key, refresh, forgetDrafts, allowed, KIND_WORDS, NEW_KINDS };
}
