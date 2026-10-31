'use strict';

/* The Calls tab's detail pane: title and meta line, the failure
 * banner, the tab strip and tools, and the body (JSON tree or comparison).
 * What it shows and copies is decided in src/core/actions/actions-detail.js; this
 * module draws it. */

import { decorateButton } from '../icons.js';
import { failureReason, hasOptions, elementForCall, previousSimilar, failed, verdictOf } from '../../core/shared/actions-model.js';
import { chainMetaParts, chainFailure, callPlace, chainSentence, chainIndex, chainPlaceText } from '../../core/actions/actions-chains.js';
import { tookWithBatch } from '../../core/shared/actions-timing.js';
import { apexSnippet, inputText } from '../../core/actions/actions-apex.js';
import { dataChangesForCall, CHANGE_WINDOW_MS } from '../../core/shared/actions-changes.js';
import {
  DIFF_TABS, compareSections, tabBody, copyBody, sectionNotice, TEXT_SECTION_NOTICE, changesHint, changesCaution, changesTitles, compareIntro, compareIntroTitle, compareSplit, metaParts
} from '../../core/actions/actions-detail.js';
import { stepAt } from '../../core/shared/actions-search.js';
import { inputSize, sizeChip, sizeLine } from '../../core/actions/input-size.js';
import { sameInputHint } from '../../core/actions/actions-repeats.js';
import { timingWords } from '../../core/actions/timing-words.js';
import { createCompareView } from '../compare-view.js';
import { diffValues } from '../../core/shared/diff.js';
import { isContainer, addAllPaths } from '../../core/shared/json-tree-model.js';
import { renderJsonTree } from '../json-tree-view.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { PayloadHistory } from '../payload-history.js';
import { Nav } from '../nav.js';
import { visitsFor } from './filtering.js';
import { copyWithButton, copyWithToast } from '../clipboard.js';
import { toast } from '../toast.js';
import { openTreeMenu } from '../tree-menu.js';
import { openContextMenu } from '../context-menu.js';
import { debounce } from '../util.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { testTags, canRerun, entryPoint } from '../../core/actions/test-calls.js';
import { compareChoices, COMPARE_MENU_TITLE } from '../../core/actions/actions-detail.js';
import { Settings } from '../settings.js';
import { Features } from '../features.js';
import { viewToOpen, logTabToKeep } from '../../core/shared/remembered-views.js';
import { createDebugView } from './debug-view.js';

function hint(text) {
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = text;
  return div;
}

const clock = (time) => new Date(time).toLocaleTimeString();

/* The payload reads the panel keeps, oldest first. They are recorded whichever
 * tab is showing, so Changes needs neither the Data tab nor Advanced. */
const payloadHistory = () => PayloadHistory.list();

/* The function that masks a value while Mask values is on, undefined when it
 * is off (so core code can skip the work). */
const maskNow = () => (Mask.on() ? Mask.apply : undefined);

/* state: the tab's state. el: { detail }. selected() is the open call.
 * actions: { compareWith(entry, baseline, how) } starts a comparison,
 * { showCall(id) } opens one call (a hop of the chain on show),
 * { selectChain(group) } opens a chain. testPane and rawPane are the two views
 * that can take the pane in place of the call. */
export function createDetailPane({ state, el, selected, actions, testPane, rawPane }) {
  let drawnDetail = null;
  /* The Debug tab of a debug run; it opens steps and sections in place. */
  const debugView = createDebugView({ state, paint: () => renderDetail() });

  /* The failure message: up to three lines until opened (CSS clamps it, so the
   * failing field is usually in view). Which calls have it open lives in
   * state.openErrors (by call id), so a redraw caused by a new incoming call
   * keeps it open. Whether it is long enough to need the toggle can only be
   * measured once it is in the document, so the control starts hidden and
   * renderDetail measures it right after attaching. */
  let measureBanner = null;

  function baselineFor() {
    return state.entries.find((entry) => entry.id === state.compareId) || null;
  }

  /* The comparison and the data changes are worked out once per call (and
   * baseline, and payload read) and reused by every part of a redraw. */
  const memo = { compare: { key: '', value: null }, changes: { key: '', value: null }, values: { key: '', before: undefined, after: undefined } };

  /* The values the Compare tab sets side by side, as { title, before, after }:
   * Input, Options and Output of the two calls; for two Integration Procedure
   * debug runs, the Original input and Response of the runs and the Options. */
  function compareValuesFor(entry, baseline) {
    const runs = debugView.compareValues(entry, baseline);
    const options = { title: 'Options', before: baseline.action.options, after: entry.action.options };
    if (runs) return [...runs, options];
    return [
      { title: 'Input', before: baseline.action.input, after: entry.action.input },
      options,
      { title: 'Output', before: baseline.output, after: entry.output }
    ];
  }

  function compareFor(entry) {
    const baseline = baselineFor();
    if (!baseline || baseline.id === entry.id) return null;
    const key = `${entry.id}:${baseline.id}`;
    if (memo.compare.key !== key) {
      const value = debugView.compareValues(entry, baseline)
        ? compareValuesFor(entry, baseline).map(({ title, before, after }) => ({ title, ...diffValues(before, after) }))
        : compareSections(entry, baseline);
      memo.compare = { key, value };
    }
    return memo.compare.value;
  }

  function changesFor(entry) {
    const history = payloadHistory();
    const last = history[history.length - 1];
    const key = `${entry.id}:${history.length}:${last ? new Date(last.time).getTime() : 0}`;
    if (memo.changes.key !== key) memo.changes = { key, value: dataChangesForCall(history, entry) };
    return memo.changes.value;
  }

  /* The two payload reads of the Changes tab, parsed once per pair. */
  function changeValues(found) {
    const key = `${new Date(found.before.time).getTime()}:${new Date(found.after.time).getTime()}`;
    if (memo.values.key !== key) {
      const parse = (snapshot) => { try { return JSON.parse(snapshot.raw); } catch { return undefined; } };
      memo.values = { key, before: parse(found.before), after: parse(found.after) };
    }
    return memo.values;
  }

  const bodyFor = (entry, tab = state.detailTab) =>
    tabBody(entry, tab, {
      compare: tab === 'compare' ? compareFor(entry) : null,
      changes: tab === 'changes' ? changesFor(entry) : null,
      debug: tab === 'debug' ? debugView.modelOf(entry) : null
    });

  /* What Copy puts on the clipboard: the tab's body as JSON, masked when the
   * switch is on; or the raw answer when that is what the tab shows. */
  function copyTextFor(entry) {
    if (state.detailTab === 'debug') return debugView.copyText(entry);
    const value = bodyFor(entry);
    if (value === undefined) {
      const notice = sectionNotice(entry, state.detailTab, Mask.on());
      return notice.raw !== undefined ? notice.raw : '';
    }
    return JSON.stringify(copyBody(value, state.detailTab, Mask.apply), null, 2);
  }

  /* Every tab is always rendered, so the strip does not reflow as the user
   * clicks down the list. A tab with nothing behind it is disabled instead of
   * hidden — "this call carried no options" is worth stating outright. */
  function tabsFor(entry) {
    /* A chain shows its first hop's input and its last hop's output; what
     * happened in between is the hops. Nothing to compare or diff as a whole. */
    if (entry.chain) return [['input', 'Input', true], ['output', 'Output', true], ['hops', 'Calls', true]];
    const tabs = [
      ['input', 'Input', true],
      ['output', 'Output', true],
      ['options', 'Options', hasOptions(entry)]
    ];
    // A call whose answer holds a debug run opens on what happened inside it.
    if (entry.debug && Features.has('calls.debug')) tabs.unshift(['debug', 'Debug', true]);
    /* Compare is started with d, b or Ctrl/Cmd-click, so its tab exists only
     * while there is something to compare. */
    const baseline = baselineFor();
    if (Features.has('calls.compare') && baseline && baseline.id !== entry.id) tabs.push(['compare', 'Compare', true]);
    /* Always usable: when there is nothing to diff, the tab says why. */
    if (Features.has('calls.changes')) tabs.push(['changes', 'Changes', true]);
    return tabs;
  }

  function renderFailureBanner(entry) {
    const banner = document.createElement('div');
    banner.className = 'detail-error';

    const text = document.createElement('span');
    text.className = 'detail-error-text';
    text.textContent = failureReason(entry, true, maskNow());

    const toggle = document.createElement('span');
    toggle.className = 'detail-error-toggle';
    toggle.hidden = true;

    banner.append(text, toggle);

    function paint() {
      const open = state.openErrors.has(entry.id);
      banner.classList.toggle('is-open', open);
      banner.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '▴ Show less' : '▾ Show more';
      banner.title = open ? 'Click to collapse' : 'Click to expand';
    }

    function flip() {
      if (state.openErrors.has(entry.id)) state.openErrors.delete(entry.id);
      else state.openErrors.add(entry.id);
      drawnDetail = detailKey(); // painted in place, nothing to rebuild
      paint();
    }

    function makeInteractive() {
      banner.classList.add('is-toggleable');
      banner.setAttribute('role', 'button');
      banner.tabIndex = 0;
      toggle.hidden = false;
      paint();
      banner.addEventListener('click', flip);
      banner.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        flip();
      });
    }

    /* Measured while collapsed, as soon as the pane has put it in the
     * document; a message that fits in its lines stays a plain banner. */
    measureBanner = () => {
      if (state.openErrors.has(entry.id) || text.scrollHeight > text.clientHeight + 1) makeInteractive();
    };

    return banner;
  }

  function actionButton(icon, label, title, onClick, extraClass = '') {
    const button = document.createElement('button');
    button.className = `icon-btn tiny${extraClass ? ` ${extraClass}` : ''}`;
    decorateButton(button, icon, label);
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }

  /* One row of buttons under the meta line; icon-only when the pane is narrow. */
  function renderActions(entry) {
    const row = document.createElement('div');
    row.className = 'detail-actions';

    const owner = elementForCall(entry, Shared.elements());
    if (owner) {
      /* The visible text is the same for every call; the element is in the name
       * a screen reader hears and in the tooltip. */
      const structure = actionButton('structure', 'Show in Structure',
        `Select ${owner.name}, the element of the script that makes this call`,
        () => Nav.go('structure', { elementKey: owner.key }), 'detail-structure');
      structure.setAttribute('aria-label', `Show in Structure: ${owner.name}`);
      row.appendChild(structure);
    }

    /* Show in Structure, Copy input, then Copy as Apex, the one used least. */
    const snippet = apexSnippet(entry, (value) => value);
    const copyInput = actionButton('braces', 'Copy input',
      'Copy this call\'s input as JSON, ready to paste into a test or another tool. Honours Mask values.',
      (ev) => copyWithButton(inputText(entry, Mask.apply), ev.currentTarget), Features.has('calls.apex') ? 'copy-direct' : '');
    row.appendChild(copyInput);
    // Copy ▾ stands in for the two buttons in a narrow pane; with one button there is nothing to fold.
    if (Features.has('calls.apex')) {
      if (snippet !== null) row.appendChild(apexButton(entry));
      row.appendChild(copyMenuButton(entry, snippet !== null));
    }
    const rerun = rerunButton(entry);
    if (rerun) row.appendChild(rerun);

    /* Compare is a button as well as a key: d for the previous call to the same
     * place, Shift+D for the last one that did not fail. One way to compare is
     * a button; two or more are one Compare ▾ menu, so the head keeps to one
     * row of buttons in a narrow pane. */
    const earlier = Features.has('calls.compare') ? previousSimilar(state.entries, entry) : null;
    const choices = !Features.has('calls.compare') ? [] : compareChoices({
      earlier,
      lastSuccess: failed(entry) ? previousSimilar(state.entries, entry, { successful: true }) : null,
      original: originalOf(entry)
    });
    if (choices.length === 1) {
      const [only] = choices;
      row.appendChild(actionButton('compare', only.label, only.title, () => actions.compareWith(entry, only.target, only.how)));
    } else if (choices.length > 1) {
      row.appendChild(compareMenuButton(entry, choices));
    }
    return row.children.length ? row : null;
  }

  function compareMenuButton(entry, choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn tiny compare-menu-btn';
    button.textContent = 'Compare ▾';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('data-help', 'Compare');
    button.title = COMPARE_MENU_TITLE;
    button.addEventListener('click', (ev) => {
      const box = button.getBoundingClientRect();
      openContextMenu({ clientX: box.left, clientY: box.bottom, type: ev.type, detail: ev.detail },
        choices.map((choice) => ({ label: choice.label, title: choice.title, action: () => actions.compareWith(entry, choice.target, choice.how) })));
    });
    return button;
  }

  /* The call a re-run was made from, when it is still in the list. */
  function originalOf(entry) {
    const test = entry.test;
    if (!test || test.rerunOf === null || test.rerunOf === undefined) return null;
    return state.entries.find((candidate) => candidate.id === test.rerunOf) || null;
  }

  /* Re-run…: opens the Test call form prefilled from this call. Not there with
   * Allow test calls off; out of use in a loaded session. */
  function rerunButton(entry) {
    // A loaded session shows it out of use; a live list only for calls that can be sent.
    if (!Features.has('calls.test') || entry.chain || !entry.omni || (!state.session && !canRerun(entry))) return null;
    const point = entryPoint({ allowed: Settings.get('allowTestCalls') === true, session: !!state.session },
      'Open the Test call form with this call\'s input and options, to edit and send it again to the org of this page');
    if (!point.visible) return null;
    const button = actionButton('refresh', 'Re-run…', point.title, () => testPane.openRerun(entry), 'detail-rerun');
    button.id = 'detail-rerun';
    button.disabled = point.disabled;
    return button;
  }

  /* A chain shows its first hop's input. */
  const inputEntry = (entry) => (entry.chain ? entry.hopEntries[0] : entry);

  /* The amber chip for a large input. It sits in the meta line, so the head
   * stays one line; the tooltip says what to do about it. */
  function renderSizeChip(chip) {
    const span = document.createElement('span');
    span.className = `meta-part ${tagClasses(chip.level)} size-chip is-${chip.level}`;
    span.textContent = chip.text;
    span.title = chip.title;
    span.setAttribute('data-help', 'Oversized input');
    return span;
  }

  /* Opens one top-level key of the Input tree, wherever the user had closed it. */
  function openInputKey(key) {
    state.expanded.input.add('');
    state.expanded.input.add(key);
    if (state.filterOpen.input) state.filterOpen.input.set(key, true);
    renderDetail();
    const row = [...el.detail.querySelectorAll('.row')].find((node) => node.dataset.path === key);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  /* Above the Input tree: how many keys and how much, and, for a large input,
   * which top-level keys hold most of it, each one a link into the tree. */
  function renderInputSize(entry) {
    if (!Features.has('calls.analysis')) return null;
    const size = inputSize(inputEntry(entry));
    const line = sizeLine(size);
    if (!line) return null;
    const note = document.createElement('div');
    note.className = 'valid-note input-size';
    note.appendChild(document.createTextNode(line));
    if (size.level && size.largest.length && size.kind !== 'text') {
      note.appendChild(document.createElement('br'));
      note.appendChild(document.createTextNode('Largest: '));
      size.largest.forEach((item, index) => {
        if (index) note.appendChild(document.createTextNode(', '));
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'sel-link';
        link.textContent = item.key;
        link.title = `Open ${item.key} in the tree: ${item.percent}% of the input`;
        link.setAttribute('data-help', 'Oversized input');
        link.addEventListener('click', () => openInputKey(item.key));
        note.append(link, document.createTextNode(` ${item.percent}%`));
      });
    }
    return note;
  }

  /* The earlier call this one repeats, when it sent the same input and
   * succeeded: a muted line whose text selects that call. */
  function sameInputFor(entry) {
    const repeat = state.repeats.get(entry.id);
    if (!repeat) return null;
    const previous = state.entries.find((candidate) => candidate.id === repeat.prevId);
    return sameInputHint(repeat, previous, clock);
  }

  function renderSameInput(entry) {
    const hint = sameInputFor(entry);
    if (!hint) return null;
    const line = document.createElement('div');
    line.className = 'detail-same';
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'sel-link';
    link.textContent = hint.text;
    link.title = 'Select that call. A repeat after a success is often a double-fired action.';
    link.setAttribute('data-help', 'Repeated calls');
    link.addEventListener('click', () => actions.showCall(hint.id));
    line.appendChild(link);
    return line;
  }

  /* Where a slow call's time went, as a muted line. The Took tooltip has the
   * full breakdown; this says the part that matters in words. */
  function renderSlowCause(text) {
    const line = document.createElement('div');
    line.className = 'detail-slow';
    line.textContent = text;
    line.title = 'Where the time of this slow call went. Hover Took in the list for more.';
    line.setAttribute('data-help', 'Started / Took');
    return line;
  }

  /* A call of a chain says which one it is, in the meta line, as a link that
   * selects the chain (the list says it in the row, which may be out of view). */
  function renderChainPlace(entry) {
    if (entry.chain) return null;
    const group = chainIndex(state.chains).get(entry.id);
    const text = group ? chainPlaceText(group, entry.id) : '';
    if (!text) return null;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'meta-part sel-link chain-place';
    link.textContent = text;
    link.title = `Select the chain: this call and the ${group.hops.length - 1} others of the same procedure, with their added-up time`;
    link.setAttribute('data-help', 'Chained procedures');
    link.addEventListener('click', () => actions.selectChain(group));
    return link;
  }

  /* "test" and "re-run of hh:mm:ss" in the meta line: the second selects the
   * original call, when it is still in the list. */
  function renderTestTag(tag) {
    const part = document.createElement(tag.select !== null && tag.select !== undefined ? 'button' : 'span');
    part.className = `meta-part ${tagClasses(tag.tone)} test-tag${part.tagName === 'BUTTON' ? ' sel-link' : ''}`;
    part.textContent = tag.label;
    part.title = tag.title;
    part.setAttribute('data-help', 'Test calls');
    if (part.tagName === 'BUTTON') {
      part.type = 'button';
      part.addEventListener('click', () => actions.showCall(tag.select));
    }
    return part;
  }

  function renderDetailHead(entry) {
    const head = document.createElement('div');
    head.className = 'detail-head';

    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = entry.chain ? `⛓ ${entry.name}` : entry.name;
    head.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    /* Each fact is a span that does not break inside ("HTTP 200"), so a narrow
     * pane wraps between facts only. */
    const facts = entry.chain
      ? chainMetaParts(entry.chain, entry.hopEntries, { clock, format: state.timeFormat })
      : metaParts(entry, { clock, step: stepAt(visitsNow(), entry.time.getTime()), format: state.timeFormat });
    facts.forEach((part, index) => {
      if (index) meta.appendChild(document.createTextNode(' · '));
      const span = document.createElement('span');
      span.className = 'meta-part';
      span.textContent = part;
      meta.appendChild(span);
    });
    const place = renderChainPlace(entry);
    if (place) meta.append(document.createTextNode(' · '), place);
    if (Features.has('calls.test')) {
      testTags(entry, { clock, byId: new Map(state.entries.map((candidate) => [candidate.id, candidate])) }).forEach((tag) => {
        meta.append(document.createTextNode(' · '), renderTestTag(tag));
      });
    }
    const chip = Features.has('calls.analysis') ? sizeChip(inputSize(inputEntry(entry))) : null;
    if (chip) meta.append(document.createTextNode(' · '), renderSizeChip(chip));
    // One line: what does not fit is cut with …, and the tooltip has all of it.
    meta.title = meta.textContent;
    head.appendChild(meta);

    if (entry.chain) {
      const why = chainFailure(entry.hopEntries, maskNow());
      if (why) {
        const banner = document.createElement('div');
        banner.className = 'detail-error';
        banner.textContent = why;
        head.appendChild(banner);
      }
    } else if (failureReason(entry)) head.appendChild(renderFailureBanner(entry));

    const why = entry.chain || !Features.has('calls.analysis') ? null : timingWords(entry, { slowMs: state.slowMs, format: state.timeFormat });
    if (why) head.appendChild(renderSlowCause(why));

    const same = renderSameInput(entry);
    if (same) head.appendChild(same);

    const row = renderActions(entry);
    if (row) head.appendChild(row);

    return head;
  }

  /* Integration Procedures and Data Mappers can be run again from the
   * Developer Console. */
  /* A narrow pane keeps one button, Copy ▾, in place of the Copy input and
   * Copy as Apex icons (CSS shows one set or the other); its menu holds both,
   * in the same order. */
  function copyMenuButton(entry, hasApex) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn tiny copy-menu-btn';
    button.textContent = 'Copy ▾';
    button.setAttribute('data-help', 'Copy as Apex');
    button.setAttribute('aria-haspopup', 'menu');
    button.title = `Copy this call's input as JSON${hasApex ? ', or an Apex snippet that runs it again' : ''}. Honours Mask values.`;
    button.addEventListener('click', (ev) => {
      const box = button.getBoundingClientRect();
      const items = [];
      items.push({ label: 'Copy input', action: () => copyWithToast(inputText(entry, Mask.apply), 'Copied input') });
      if (hasApex) items.push({ label: 'Copy as Apex', action: () => copyWithToast(apexSnippet(entry, Mask.apply), 'Copied Apex') });
      openContextMenu({ clientX: box.left, clientY: box.bottom, type: ev.type, detail: ev.detail }, items);
    });
    return button;
  }

  function apexButton(entry) {
    const isDr = entry.type === 'DR';
    return actionButton('code', 'Copy as Apex',
      (isDr
        ? 'Copy an anonymous Apex snippet that runs this Data Mapper again with this call\'s input: <namespace>.DRGlobal.process(input, \'<bundle>\'), printing result.toJson(). '
        : 'Copy an anonymous Apex snippet that runs this Integration Procedure again with this call\'s input and options: <namespace>.IntegrationProcedureService.runIntegrationService(key, input, options). ') +
      'Best effort: the namespace is taken from the call (omnistudio for the core package, vlocity_cmt, vlocity_ins or vlocity_ps for the managed packages; both methods exist in each) and may need adjusting. Honours Mask values.',
      (ev) => copyWithButton(apexSnippet(entry, Mask.apply), ev.currentTarget), 'copy-direct');
  }

  /* The tab to show among the ones this call has. The tab picked by hand is
   * what Settings holds (logDetailTab) and is never overwritten here: a call
   * that lacks it shows Input, and the next call that has it opens on it again. */
  function shownTab(usableIds) {
    const picked = viewToOpen('logDetailTab', Settings.get('logDetailTab'), '');
    if (picked && state.detailTab === 'input' && picked !== 'input' && usableIds.includes(picked)) state.detailTab = picked;
    if (!usableIds.includes(state.detailTab)) state.detailTab = 'input';
  }

  function renderDetailTools(entry) {
    const tools = document.createElement('div');
    tools.className = 'detail-tools';

    const available = tabsFor(entry);
    const usable = available.filter((tab) => tab[2]);
    shownTab(usable.map((tab) => tab[0]));

    const tabStrip = document.createElement('div');
    tabStrip.className = 'seg';
    available.forEach(([tabId, tabLabel, enabled]) => {
      const button = document.createElement('button');
      button.className = `seg-btn${state.detailTab === tabId ? ' is-on' : ''}`;
      button.setAttribute('aria-pressed', String(state.detailTab === tabId));
      button.textContent = tabLabel;
      if (!enabled) {
        button.disabled = true;
        button.title = `This call carried no ${tabLabel.toLowerCase()}`;
      } else {
        if (tabId === 'debug') button.title = 'What happened inside this run, step by step';
        if (tabId === 'changes') {
          button.title = `How the script's data changed within ${CHANGE_WINDOW_MS / 1000} s after this call ended.`;
        }
        if (tabId === 'hops') {
          button.title = 'The calls the chain was made of, one button each. Click one to open it.';
        }
        if (tabId === 'compare') {
          button.title = 'What changed from the baseline call to this one. Press b on a call to pick it.';
        }
        button.addEventListener('click', () => {
          state.detailTab = tabId;
          state.detailTabPicked = true; // the user's choice outlasts the call's default
          /* Stored before the pane is drawn, which compares it with the tab shown. */
          const kept = logTabToKeep(tabId, true);
          if (kept !== '' && kept !== Settings.get('logDetailTab')) Settings.set('logDetailTab', kept);
          renderDetail();
        });
      }
      tabStrip.appendChild(button);
    });
    tools.appendChild(tabStrip);

    const value = bodyFor(entry);
    const onDebug = state.detailTab === 'debug';
    const treeable = isContainer(value) && !DIFF_TABS.includes(state.detailTab) && !onDebug;

    /* Expand and Collapse work on a tree only; on the other tabs they are left
     * out rather than shown greyed. Copy stays wherever there is something to
     * copy. */
    if (treeable) {
      const expand = document.createElement('button');
      expand.className = 'icon-btn tiny';
      decorateButton(expand, 'expand', 'Expand all');
      expand.title = 'Expand everything';
      expand.addEventListener('click', () => {
        const set = new Set();
        addAllPaths(value, '', set, 0);
        state.expanded[state.detailTab] = set;
        state.filterOpen[state.detailTab] = new Map();
        renderDetail();
      });
      tools.appendChild(expand);

      const collapse = document.createElement('button');
      collapse.className = 'icon-btn tiny';
      decorateButton(collapse, 'collapse', 'Collapse all');
      collapse.title = 'Collapse to the top level';
      collapse.addEventListener('click', () => {
        state.expanded[state.detailTab] = new Set(['']);
        const all = new Set();
        addAllPaths(value, '', all, 0);
        state.filterOpen[state.detailTab] = new Map([...all].filter((path) => path !== '').map((path) => [path, false]));
        renderDetail();
      });
      tools.appendChild(collapse);
    }

    // The Debug tab's trees are its own: Expand and Collapse act on the ones that are open.
    if (onDebug && value !== undefined && debugView.hasTrees(entry)) {
      const expand = document.createElement('button');
      expand.className = 'icon-btn tiny';
      decorateButton(expand, 'expand', 'Expand all');
      expand.title = 'Expand everything in the open trees of this view';
      expand.addEventListener('click', () => debugView.expandAll(entry));
      tools.appendChild(expand);

      const collapse = document.createElement('button');
      collapse.className = 'icon-btn tiny';
      decorateButton(collapse, 'collapse', 'Collapse all');
      collapse.title = 'Collapse the open trees of this view to the top level';
      collapse.addEventListener('click', () => debugView.collapseAll(entry));
      tools.appendChild(collapse);
    }

    const rawOutput = state.detailTab === 'output' && sectionNotice(entry, 'output', Mask.on()).raw !== undefined;
    // The Changes tab's side by side view carries its own Copy of the same differences.
    if ((value !== undefined || rawOutput) && state.detailTab !== 'changes') {
      const copy = document.createElement('button');
      copy.className = 'icon-btn tiny';
      decorateButton(copy, 'copy', 'Copy');
      copy.title = onDebug ? debugView.copyTitle(entry) : 'Copy this view as JSON. Honours Mask values.';
      copy.addEventListener('click', () => {
        if (onDebug && debugView.copyEmpty(entry)) { toast('Nothing to copy'); return; }
        const text = copyTextFor(entry);
        if (text) copyWithButton(text, copy);
      });
      tools.appendChild(copy);
    }

    if (DIFF_TABS.includes(state.detailTab) || state.detailTab === 'hops') return tools;

    const find = document.createElement('input');
    find.type = 'search';
    find.className = 'detail-find';
    find.placeholder = 'Filter keys and values';
    find.spellcheck = false;
    find.value = state.detailFilter;
    const applyFind = debounce((text) => {
      if (text.trim().toLowerCase() !== state.detailFilter.trim().toLowerCase()) state.filterOpen = {};
      state.detailFilter = text;
      renderDetail();
      const again = el.detail.querySelector('.detail-find');
      if (again) { again.focus(); again.setSelectionRange(text.length, text.length); }
    }, 150);
    find.addEventListener('input', () => applyFind(find.value));
    tools.appendChild(find);

    return tools;
  }

  /* One comparison of the Compare tab: its title in the head, the panes
   * under it; a section with no difference says so in one line. */
  function compareSection(body, entry, baseline, { title, before, after }) {
    const host = document.createElement('div');
    host.className = 'cmp-section';
    body.appendChild(host);
    createCompareView({
      host,
      before,
      after,
      heading: title,
      titles: { before: `Before: the call at ${clock(baseline.time)}`, after: `After: this call at ${clock(entry.time)}` },
      surface: `calls-compare:${title}`,
      key: `${entry.id}:${baseline.id}`,
      mask: Mask.apply
    });
  }

  function renderCompare(entry, baseline) {
    const body = document.createElement('div');
    body.className = 'detail-body';

    const intro = document.createElement('div');
    intro.className = 'valid-note';
    intro.textContent = compareIntro(entry, baseline, clock, state.timeFormat);
    intro.title = compareIntroTitle(state.compareHow);
    intro.classList.add('compare-intro');
    body.appendChild(intro);

    // The one way out of a comparison from the tab itself: b or the row menu on the baseline do the same.
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'icon-btn tiny compare-stop';
    stop.textContent = 'Stop comparing';
    stop.title = 'Clear the baseline: the Compare tab goes and the call opens on its own tabs';
    stop.setAttribute('data-help', 'Compare');
    stop.addEventListener('click', () => actions.clearBaseline());
    intro.appendChild(stop); // on the first line, so the sections keep their places

    // Two debug runs of one kind: their steps side by side, ahead of the input and output.
    const runs = debugView.compareTable(entry, baseline);
    if (runs) body.appendChild(runs);

    // Parts with nothing to show are one line, not a section each with its own Show unchanged.
    const sections = compareValuesFor(entry, baseline);
    const split = compareSplit(compareFor(entry));
    sections.filter((section) => split.differing.includes(section.title)).forEach((section) => compareSection(body, entry, baseline, section));
    if (split.same) {
      const same = document.createElement('div');
      same.className = 'valid-note compare-same';
      same.textContent = split.same;
      body.appendChild(same);
    }
    return body;
  }

  function renderChanges(entry) {
    const body = document.createElement('div');
    body.className = 'detail-body';

    const found = changesFor(entry);
    if (found.status !== 'ok') {
      body.appendChild(hint(changesHint(found)));
      return body;
    }

    const caution = changesCaution(found);
    if (caution) {
      const note = document.createElement('div');
      note.className = 'valid-note changes-caution';
      note.textContent = caution.text;
      note.title = caution.title;
      body.appendChild(note);
    }

    const values = changeValues(found);
    const host = document.createElement('div');
    host.className = 'cmp-section';
    body.appendChild(host);
    createCompareView({
      host,
      before: values.before,
      after: values.after,
      heading: 'Payload',
      identical: 'No value changed (the reads differ only in formatting)',
      titles: changesTitles(found, clock),
      surface: 'calls-changes',
      key: `${entry.id}:${values.key}`,
      mask: Mask.apply
    });
    return body;
  }

  function renderNotice(body, entry) {
    const notice = sectionNotice(entry, state.detailTab, Mask.on());
    if (notice.raw === undefined) {
      body.appendChild(hint(notice.text));
      return;
    }
    const note = document.createElement('div');
    note.className = 'valid-note';
    note.textContent = 'The response could not be decoded. This is what came back (first 20 KB):';
    const raw = document.createElement('pre');
    raw.className = 'raw-response';
    raw.textContent = notice.raw;
    body.append(note, raw);
  }

  /* The chain's calls, one button each: its place, when it started, how long
   * it took and what came of it. A click opens that call. */
  function renderHops(entry) {
    const body = document.createElement('div');
    body.className = 'detail-body';
    const count = entry.hopEntries.length;
    body.appendChild(hint(chainSentence(entry.hopEntries, entry.chain.stoppedEarly)));
    const list = document.createElement('div');
    list.className = 'hop-list';
    entry.hopEntries.forEach((hop, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hop-btn';
      const why = failureReason(hop, false, maskNow());
      const result = verdictOf(hop, why);
      const pill = document.createElement('span');
      pill.className = `${tagClasses(result.tone)} pill is-${result.tone}`;
      pill.textContent = result.text;
      pill.title = why || 'No error found in the response';
      const parts = [callPlace(index + 1, count), clock(hop.time), tookWithBatch(hop, state.timeFormat) || 'no duration'];
      parts.forEach((text, at) => {
        const span = document.createElement('span');
        span.className = at ? 'hop-fact' : 'hop-no';
        span.textContent = text;
        button.appendChild(span);
      });
      button.appendChild(pill);
      button.title = `Open ${callPlace(index + 1, count)}`;
      button.addEventListener('click', () => actions.showCall(hop.id));
      list.appendChild(button);
    });
    body.appendChild(list);
    return body;
  }

  /* Said above a chain's Input and Output, which come from different calls. */
  function chainNote(entry) {
    const count = entry.hopEntries.length;
    const note = document.createElement('div');
    note.className = 'valid-note';
    note.textContent = state.detailTab === 'output'
      ? `Output of the last call (${callPlace(count, count)}).`
      : `Input of the first call (${callPlace(1, count)}).`;
    return note;
  }

  function renderDetailBody(entry) {
    if (entry.chain && state.detailTab === 'hops') return renderHops(entry);
    const body = renderTabBody(entry);
    if (state.detailTab === 'input') {
      const note = renderInputSize(entry);
      if (note) body.insertBefore(note, body.firstChild);
    }
    if (entry.chain && state.detailTab !== 'hops') body.insertBefore(chainNote(entry), body.firstChild);
    return body;
  }

  function renderTabBody(entry) {
    if (state.detailTab === 'debug') return debugView.render(entry);
    if (state.detailTab === 'changes') return renderChanges(entry);
    if (state.detailTab === 'compare') {
      const baseline = baselineFor();
      if (baseline && baseline.id !== entry.id) return renderCompare(entry, baseline);
      state.detailTab = 'input';
    }

    const body = document.createElement('div');
    body.className = 'detail-body';

    const value = bodyFor(entry);
    if (value === undefined) {
      renderNotice(body, entry);
      return body;
    }
    if (!isContainer(value)) {
      /* Nothing to expand: say why the tree buttons are off, and show the text as it is. */
      const note = document.createElement('div');
      note.className = 'valid-note';
      note.textContent = TEXT_SECTION_NOTICE;
      const text = document.createElement('pre');
      text.className = 'raw-response';
      text.textContent = String(Mask.apply(value));
      body.append(note, text);
      return body;
    }

    const tabId = state.detailTab;
    const tree = {
      expanded: state.expanded[tabId],
      filterOpen: state.filterOpen[tabId] || (state.filterOpen[tabId] = new Map())
    };
    const result = renderJsonTree(body, tabId, value, {
      expanded: tree.expanded,
      expandedText: state.expandedText[tabId],
      filterOpen: tree.filterOpen,
      filter: state.detailFilter,
      transform: Mask.apply,
      onToggle: renderDetail,
      /* The same right-click menu as the other trees; the copy entries mask
       * the value themselves, the path and key are names of the script. */
      onContext: (ev, info) => openTreeMenu(ev, info, {
        root: value,
        tree,
        filtering: () => !!state.detailFilter.trim(),
        copy: (text, what) => copyWithToast(text, what ? `Copied ${what}` : 'Copied'),
        rerender: renderDetail
      })
    });

    if (!result.matched) {
      body.appendChild(hint(`Nothing here matches "${state.detailFilter}".`));
    }

    return body;
  }

  const visitsNow = () => visitsFor(state);

  /* New payload reads change the Changes tab; no other tab looks at them. */
  function historySignature() {
    if (state.detailTab !== 'changes') return '';
    const history = payloadHistory();
    const last = history[history.length - 1];
    return `${history.length}:${last ? new Date(last.time).getTime() : 0}:${last ? last.raw.length : 0}`;
  }

  /* What the detail pane shows, apart from what its own handlers redraw: a
   * poll-driven redraw of the list leaves the pane alone while this holds, so
   * focus in the failure banner or the filter box survives a new call. */
  function detailKey() {
    if (state.testDraft) return testPane.key();
    const entry = selected();
    if (rawPane.showing(entry)) return rawPane.key(entry);
    // With nothing selected the pane shows a line once there are calls to pick.
    if (!entry) return state.shownCount > 0 ? 'pick' : '';
    const visit = stepAt(visitsNow(), entry.time.getTime());
    const repeat = state.repeats.get(entry.id);
    return [entry.id, repeat ? `${repeat.prevId}:${repeat.sameInput}` : '', state.detailTab, state.compareId, state.compareHow, state.openErrors.has(entry.id),
      state.detailFilter, state.timeFormat, state.slowMs, Mask.on(), Shared.elements().length, historySignature(),
      visit ? `${visit.key}|${visit.name}` : '',
      entry.chain ? `${entry.chain.hops.join(',')}|${entry.chain.stoppedEarly}|${entry.chain.failed}` : '',
      Settings.get('allowTestCalls') === true, !!state.session].join('\u0000');
  }

  function renderDetail() {
    const pane = el.detail;
    pane.textContent = '';
    drawnDetail = detailKey();
    // The Test call form takes the pane; the list and the selection stay.
    if (state.testDraft) { testPane.render(pane); return; }

    const entry = selected();
    // The Raw view takes the pane for the call it was opened on.
    if (rawPane.showing(entry)) { rawPane.render(pane, entry); return; }
    if (!entry) {
      // With no call in the list there is nothing to select: the list says why.
      if (state.shownCount > 0) pane.appendChild(hint('Select a call to see its input, output and timing.'));
      return;
    }

    measureBanner = null;
    const head = renderDetailHead(entry);
    head.appendChild(renderDetailTools(entry));
    pane.appendChild(head);
    pane.appendChild(renderDetailBody(entry));
    if (measureBanner) { measureBanner(); measureBanner = null; }
  }

  function refreshDetail() {
    if (detailKey() !== drawnDetail) renderDetail();
  }

  /* A payload read arrived: the Changes tab is the only one that cares. */
  PayloadHistory.onChange(() => { if (state.active && state.detailTab === 'changes') refreshDetail(); });

  /* The list the pane reads from was swapped for another (a loaded session
   * and back): what it worked out for the old one is not true any more. */
  function forget() {
    memo.compare = { key: '', value: null };
    memo.changes = { key: '', value: null };
    memo.values = { key: '', before: undefined, after: undefined };
    drawnDetail = null;
    measureBanner = null;
  }

  return { renderDetail, refreshDetail, copyTextFor, forget };
}
