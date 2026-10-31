'use strict';

/* Calls: choosing a call. Opening one, opening a chain's hops, picking
 * the baseline another call is compared with, the right-click menu of a row,
 * and the keyboard comparisons (d and Shift+D). */

import { previousSimilar, maskedName } from '../../core/shared/actions-model.js';
import { chainView, chainIndex, isChainId } from '../../core/actions/actions-chains.js';
import { defaultDetailTab } from '../../core/actions/actions-detail.js';
import { inputText } from '../../core/actions/actions-apex.js';
import { isContainer, addAllPaths } from '../../core/shared/json-tree-model.js';
import { Mask } from '../mask-setting.js';
import { copyWithToast } from '../clipboard.js';
import { openContextMenu } from '../context-menu.js';
import { toast } from '../toast.js';
import { Settings } from '../settings.js';
import { Features } from '../features.js';
import { canRerun, entryPoint } from '../../core/actions/test-calls.js';

function expandedSetFor(value) {
  const paths = new Set(['']);
  if (isContainer(value)) {
    try { addAllPaths(value, '', paths, 0); } catch { /* defensive: unexpected shape */ }
  }
  return paths;
}

/* A chain is not one call to put next to another; its hops are. */
const CHAIN_COMPARE = 'A chain is compared call by call: open one of its calls, then compare';

const TEXT_INPUTS = /^(text|search|email|url|tel|password|number)$/i;

/* state: the tab's state. el: the elements it looked up. redraw(): the tab's
 * redraw. detail(): the detail pane (created after this, hence a getter).
 * parsedQuery(): the filter box, parsed. markCall(entry, shift): tick a call. */
export function createChoose({ state, el, redraw, detail, parsedQuery, markCall, testPane, rawPane }) {
  /* The open call, or, when a chain's row is open, the chain made to look like
   * one call (core chainView) so the detail pane can draw it. */
  function selected() {
    if (isChainId(state.selectedId)) {
      const group = state.chains.find((candidate) => candidate.id === state.selectedId);
      return group ? chainView(group, state.entries) : null;
    }
    return state.entries.find((entry) => entry.id === state.selectedId) || null;
  }

  /* entry is a call, or a chain made to look like one (chainView). */
  function selectEntry(entry) {
    // Choosing a call leaves the Test call form: the pane is for that call now.
    if (state.testDraft) testPane().close();
    // The Raw view belongs to one call: another call opens on its own detail.
    if (state.rawFor !== null && entry.id !== state.rawFor) state.rawFor = null;
    // Choosing the call that is already open changes nothing, so what the user
    // expanded or filtered in its trees stays as it is.
    if (entry.id === state.selectedId) return;
    state.selectedId = entry.id;
    if (state.compareId === entry.id) state.compareId = null;
    // A failed call opens where its reason is, unless the user picked a tab.
    // The Hops tab belongs to chains.
    const tab = state.detailTab === 'hops' && !entry.chain ? 'input' : state.detailTab;
    // Without the Debug tab a debug run opens like any call, and a tab picked by hand stays.
    state.detailTab = defaultDetailTab(entry, tab, state.detailTabPicked, { debugTab: Features.has('calls.debug') });
    // Expand the Input / Options / Output JSON trees by default for ease of inspection.
    state.expanded = {
      input: expandedSetFor(entry.action.input),
      output: expandedSetFor(entry.output),
      options: expandedSetFor(entry.action.options)
    };
    state.expandedText = { input: new Set(), output: new Set(), options: new Set() };
    state.filterOpen = {};
    // A payload search opens the trees already narrowed to what it found.
    const needle = parsedQuery().inPayload;
    if (needle) state.detailFilter = needle;
    redraw();
    detail().renderDetail();
  }

  function selectChain(group) {
    const view = chainView(group, state.entries);
    if (view) selectEntry(view);
  }

  /* Opens or closes a chain's hops; the choice outlasts redraws. */
  function toggleChain(group) {
    if (state.expandedChains.has(group.id)) state.expandedChains.delete(group.id);
    else state.expandedChains.add(group.id);
    redraw();
  }

  /* Opens the chain a call is a hop of, so the call has a row to be found on. */
  function revealCall(entry) {
    const group = chainIndex(state.chains).get(entry.id);
    if (!group || state.expandedChains.has(group.id)) return;
    state.expandedChains.add(group.id);
    redraw();
  }

  /* Selects a call by id and brings its row into view. */
  function showCall(id) {
    const entry = state.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    revealCall(entry);
    selectEntry(entry);
    const row = el.list.querySelector('.log-row.is-selected');
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }

  function setBaseline(id, how) {
    state.compareId = id;
    state.compareHow = how;
  }

  function onRowClick(entry, ev) {
    /* Ctrl/Cmd-click picks the baseline the selected call is compared with. */
    if (Features.has('calls.compare') && (ev.ctrlKey || ev.metaKey) && state.selectedId && entry.id !== state.selectedId) {
      if (state.compareId === entry.id) state.compareId = null; else setBaseline(entry.id, 'picked');
      if (state.compareId) state.detailTab = 'compare';
      redraw();
      return;
    }
    selectEntry(entry);
  }

  /* b on a focused call: make it the baseline (again to clear it). Moving to
   * another call then compares that one with it. */
  function pickBaseline(id) {
    if (!Features.has('calls.compare')) return;
    const entry = state.entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    if (state.compareId === id) {
      state.compareId = null;
      toast('Baseline cleared');
    } else {
      setBaseline(id, 'picked');
      if (state.selectedId !== null && state.selectedId !== id) state.detailTab = 'compare';
      else toast(`Baseline set to ${entry.name}. Select another call to compare with it.`);
    }
    redraw();
  }

  /* Stop comparing: the baseline goes and the Compare tab with it, whatever call is open. */
  function clearBaseline() {
    if (state.compareId === null) return;
    state.compareId = null;
    if (state.detailTab === 'compare') {
      const entry = selected();
      state.detailTab = entry ? defaultDetailTab(entry, 'input', false, { debugTab: Features.has('calls.debug') }) : 'input';
    }
    toast('Baseline cleared');
    redraw();
  }

  function compareWith(entry, baseline, how) {
    setBaseline(baseline.id, how);
    state.detailTab = 'compare';
    redraw();
  }

  /* The row the menu is for stays marked while the menu is open, so it is clear
   * which call "Copy name" will copy; it is the row's class, kept in
   * state.menuRow so a redraw while the menu is open keeps it. The menu has
   * no close callback, so its removal from the page is watched. */
  function highlightWhileOpen(entry) {
    const mark = (on) => {
      const row = el.list.querySelector(`[data-row-key="${entry.id}"]`);
      if (row) row.classList.toggle('is-menu', on);
    };
    state.menuRow = entry.id;
    mark(true);
    const watcher = new MutationObserver(() => {
      if (document.querySelector('.ctx-menu')) return;
      watcher.disconnect();
      state.menuRow = null;
      mark(false);
    });
    // The menu is added to the body by openContextMenu, just after this.
    watcher.observe(document.body, { childList: true });
  }

  /* Re-run… and Re-run as it was…, for an OmniStudio call. With Allow test
   * calls off a single item that cannot be pressed says where the setting is,
   * so a tester learns the feature exists without anything else changing; in a
   * loaded session both show out of use, with the reason. Re-run as it was…
   * asks first (a question with a Send button), and is out of use while
   * Recording is paused, since the answer would be thrown away. */
  function rerunItems(entry) {
    if (!Features.has('calls.test') || entry.chain || !entry.omni) return [];
    const allowed = Settings.get('allowTestCalls') === true;
    if (!allowed) {
      if (state.session || !canRerun(entry)) return [];
      return ['-', {
        label: 'Re-run… (turn on Allow test calls in Settings)', disabled: true,
        title: 'Turn on Allow test calls under Sending in Settings to send this call again', action: () => {}
      }];
    }
    const open = entryPoint({ allowed, session: !!state.session }, 'Open the Test call form with this call\'s input and options');
    if (!state.session && !canRerun(entry)) return [];
    const now = entryPoint({ allowed, session: !!state.session, paused: !state.recording },
      'Send this call again exactly as it was to the org of this page, after one more question');
    return [
      '-',
      { label: 'Re-run…', title: open.title, disabled: open.disabled, action: () => { selectEntry(entry); testPane().openRerun(entry, 'menu'); } },
      { label: 'Re-run as it was…', title: now.title, disabled: now.disabled, action: () => testPane().rerunAsItWas(entry) }
    ];
  }

  /* Show raw: the request and the answer as they went over the wire, in the
   * detail pane. A chain's row has no menu and no request of its own; its calls do. */
  function rawItem(entry) {
    return {
      label: 'Show raw',
      title: 'Show the request and the answer as they went over the wire. Honours Mask values.',
      action: () => { selectEntry(entry); rawPane().open(entry); }
    };
  }

  /* Right-click on a row: the things to do with that call without opening it
   * first. Compare and baseline are also on the detail pane and the keyboard. */
  function openRowMenu(entry, ev) {
    const earlier = previousSimilar(state.entries, entry);
    highlightWhileOpen(entry);
    /* The gated items come in groups, each after a separator, so Free's menu is
     * the three copy and raw items with no separator left hanging. */
    const comparing = !Features.has('calls.compare') ? [] : [
      '-',
      {
        label: 'Compare with previous',
        disabled: !earlier,
        action: () => { selectEntry(entry); compareWith(entry, earlier, 'previous'); }
      },
      { label: state.compareId === entry.id ? 'Clear baseline' : 'Set as baseline', action: () => pickBaseline(entry.id) }
    ];
    const selecting = !Features.has('calls.select') ? [] : [
      '-',
      { label: state.marked.has(entry.id) ? 'Unselect' : 'Select for total time', action: () => markCall(entry, false) }
    ];
    openContextMenu(ev, [
      { label: 'Copy name', action: () => copyWithToast(maskedName(entry, Mask.apply), 'Copied name') },
      { label: 'Copy input', action: () => copyWithToast(inputText(entry, Mask.apply), 'Copied input') },
      rawItem(entry),
      ...rerunItems(entry),
      ...comparing,
      ...selecting
    ]);
  }

  /* Keyboard d: diff the selected call against the last earlier call to the
   * same place. */
  function compareWithPrevious() {
    if (!Features.has('calls.compare')) return;
    const entry = selected();
    if (!entry) { toast('Select a call first'); return; }
    if (entry.chain) { toast(CHAIN_COMPARE); return; }
    const earlier = previousSimilar(state.entries, entry);
    if (!earlier) { toast('No earlier call to the same place'); return; }
    compareWith(entry, earlier, 'previous');
  }

  /* Keyboard Shift+D: the same, against the last earlier call that did not fail. */
  function compareWithLastSuccess() {
    if (!Features.has('calls.compare')) return;
    const entry = selected();
    if (!entry) { toast('Select a call first'); return; }
    if (entry.chain) { toast(CHAIN_COMPARE); return; }
    const earlier = previousSimilar(state.entries, entry, { successful: true });
    if (!earlier) { toast('No earlier successful call to the same place'); return; }
    compareWith(entry, earlier, 'success');
  }

  /* Shift+D belongs to this tab; the shell's key handler only knows plain keys. */
  function onShiftD(ev) {
    // Caps Lock makes a plain d arrive as "D", and Shift with Caps Lock as "d": the Shift key decides.
    if (!ev.shiftKey || String(ev.key).toLowerCase() !== 'd' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const target = ev.target;
    if (target && target.tagName && (target.tagName === 'INPUT' ? TEXT_INPUTS.test(target.type || '') : /^(TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    // Help and Settings both are .help-overlay: any open dialog owns the keys.
    if (!state.active || document.querySelector('.help-overlay:not([hidden])')) return;
    ev.preventDefault();
    compareWithLastSuccess();
  }

  return {
    selected, selectEntry, selectChain, toggleChain, revealCall, showCall, onRowClick, pickBaseline, clearBaseline,
    compareWith, openRowMenu, compareWithPrevious, compareWithLastSuccess, onShiftD
  };
}
