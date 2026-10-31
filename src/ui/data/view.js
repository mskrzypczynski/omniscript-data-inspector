'use strict';

/* The Data tab's view: what is drawn into the viewport for the state the tab
 * holds. The tab (../data-tab.js) owns the state, the reading and the events;
 * this module turns the state into DOM, and keeps the few things a redraw
 * reuses (the list of marked changes, the owner index, the Sizes figures). */

import { rawView } from '../../core/shared/raw-json.js';
import { orderedChanges, changedVisible, allowedRows, valueAt, ancestorsOf } from '../../core/data/changes.js';
import { dataSegments, ownerIndex } from '../../core/shared/path-links.js';
import { topSizes, sizeTreeAt, rankSizes } from '../../core/data/sizes.js';
import { unusedKeys } from '../../core/data/unused.js';
import { logText } from '../../core/shared/change-log.js';
import { parseFilter, queryMatches } from '../../core/shared/filter-query.js';
import { flashProgress, JUMP_FLASH_MS } from '../../core/shared/flash.js';
import { renderJsonTree } from '../json-tree-view.js';
import { notice } from '../notice.js';
import { noMatchNotice } from '../empty-notice.js';
import { emptyCard, setEmptyState } from './empty-state.js';
import { buildRawBlock } from './raw-view.js';
import { renderDataForm } from './form-view.js';
import { buildSizesView } from './sizes-view.js';
import { buildChangeLog, updateChangeLog } from './change-log-view.js';
import { copyWithButton } from '../clipboard.js';
import { Targets } from '../targets.js';
import { Nav } from '../nav.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { Features } from '../features.js';

/* state, el: the tab's. render(): a full redraw. renderStatus(): the status
 * bar only. revealPath(path, options): open a path in the tree. togglePin(path),
 * rowMenu(ev, info): the watch list and the right-click menu. lineage: the
 * "Where is this set?" notes (./lineage-view.js). recordLink: Open record (./record-link.js). */
export function createDataView({ state, el, render, renderStatus, revealPath, togglePin, rowMenu, lineage, recordLink, clearFilter }) {
  /* The marked paths in tree order. Walking a payload every second just to count
   * them is wasteful, so the answer is reused until the payload or the marks
   * change. */
  let changeCache = { data: null, touched: null, size: -1, list: [] };

  function changeList() {
    if (state.data === undefined) return [];
    if (changeCache.data !== state.data || changeCache.touched !== state.touched || changeCache.size !== state.touched.size) {
      changeCache = {
        data: state.data, touched: state.touched, size: state.touched.size,
        list: orderedChanges(state.data, state.touched)
      };
    }
    return changeCache.list;
  }

  /* Which rows can jump to Structure: those whose key belongs to an element of
   * the definition (itself, or the nearest element above it). The definition is
   * fetched once in the background when this tab first needs it; until it is
   * there, or if the script has none, no row offers the button. */
  let ownerCache = { elements: null, data: null, lookup: null };

  function ownerLookup() {
    if (!state.ownersRequested) {
      state.ownersRequested = true;
      Shared.ensureElements(() => { if (state.active) render(); });
    }
    const elements = Shared.elements();
    if (!elements.length || state.data === undefined) return null;
    /* The index depends only on these two references; rebuilding it on every
     * redraw walked the payload once per element without a JSONPath. */
    if (ownerCache.elements !== elements || ownerCache.data !== state.data) {
      ownerCache = { elements, data: state.data, lookup: ownerIndex(elements, state.data) };
    }
    return ownerCache.lookup;
  }

  function jumpLabel(owners, path) {
    if (!owners || !path) return null;
    const hit = owners(dataSegments(state.data, path));
    if (!hit) return null;
    return hit.exact
      ? `Select ${hit.element.name} in the Structure tab`
      : `Select ${hit.element.name} in the Structure tab (the element this value sits under)`;
  }

  function scrollToFocus() {
    if (!state.scrollToFocus) return;
    state.scrollToFocus = false;
    if (state.scrollTo) state.scrollTo(state.focus);
    endJumpFlash();
  }

  /* The jumped-to row flashes and then looks like any other: when the flash is
   * over the class goes, without a redraw (which would drop selection and scroll). */
  let jumpTimer = null;
  function endJumpFlash() {
    clearTimeout(jumpTimer);
    jumpTimer = null;
    const left = JUMP_FLASH_MS - (Date.now() - state.jumpedAt);
    jumpTimer = setTimeout(() => {
      jumpTimer = null;
      state.jumpedAt = 0;
      /* el.viewport, not a bare `viewport`: in a browser that name is also a
       * built-in window property, which has no querySelectorAll. */
      el.viewport.querySelectorAll('.row.is-jumped, .form-row.is-jumped').forEach((row) => { row.classList.remove('is-jumped'); row.style.animationDelay = ''; });
    }, Math.max(left, 0) + 20);
  }

  /* The banner over a payload whose script is gone. Rescan is the top bar's
   * own button, pressed for the user, so the way back is where they look. */
  function staleNotice() {
    const box = notice('OmniScript no longer on the page',
      'Showing the last data read. It will refresh when an OmniScript is found again.', false);
    const rescan = document.getElementById('rescan');
    if (rescan) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn tiny stale-rescan';
      button.textContent = 'Rescan';
      button.title = 'Look for scripts and frames again';
      button.setAttribute('data-help', 'Rescan');
      button.addEventListener('click', () => rescan.click());
      box.appendChild(button);
    }
    return box;
  }

  /* The Sizes view's figures, measured again only for a new payload. */
  let sizesCache = { version: -1, result: null, tree: null, zoomed: null, ranked: null };

  function sizesOf() {
    if (sizesCache.version !== state.rawVersion || !sizesCache.result) {
      sizesCache = { version: state.rawVersion, result: topSizes(state.data), tree: null, zoomed: null, ranked: null };
    }
    return sizesCache.result;
  }

  /* The rows of the Sizes list at a place (the whole data, or a node drilled
   * into), `count` of them; null when that node is gone. */
  function rankingOf(path, count) {
    const { total } = sizesOf();
    const kept = sizesCache.ranked;
    if (kept && kept.path === path && kept.count === count) return kept.result;
    const result = rankSizes(state.data, path, count, total);
    sizesCache.ranked = { path, count, result };
    return result;
  }

  /* The keys no element reads: worked out for the payload and the elements at
   * hand, again only when either changes. */
  let unusedCache = { version: -1, elements: null, result: null };

  function unusedOf() {
    const elements = Shared.elements();
    if (unusedCache.version !== state.rawVersion || unusedCache.elements !== elements || !unusedCache.result) {
      unusedCache = { version: state.rawVersion, elements, result: unusedKeys(state.data, elements) };
    }
    return unusedCache.result;
  }

  const elementsKnown = () => Shared.elements().length > 0;

  /* The treemap's figures: measured when the treemap is first shown. */
  function sizeTreeOf(zoomPath = '') {
    const { total } = sizesOf();
    if (zoomPath) {
      if (!sizesCache.zoomed || sizesCache.zoomed.path !== zoomPath) {
        sizesCache.zoomed = { path: zoomPath, tree: sizeTreeAt(state.data, zoomPath, { total }) };
      }
      return sizesCache.zoomed.tree;
    }
    if (!sizesCache.tree) sizesCache.tree = sizeTreeAt(state.data, '');
    return sizesCache.tree;
  }

  /* A click on a log entry: show where it happened. A key that is gone is shown
   * at the branch that held it. */
  function revealEntry(entry) {
    const exists = valueAt(state.data, entry.path) !== undefined;
    const target = exists ? entry.path : (ancestorsOf(entry.path).pop() || '');
    revealPath(target, { clearFilters: true });
    render();
  }

  /* The raw view for the current text; the line and match counts it found are
   * kept for the status bar and for walking matches. */
  function rawBlock(text) {
    const { node, lines, matches } = buildRawBlock(text, { query: state.filter.trim(), wrap: true });
    state.rawLines = lines;
    state.rawMatches = matches;
    state.rawCursor = -1;
    return node;
  }

  /* The Raw view: the page's own text laid out for reading (core/shared/raw-json.js),
   * with the same lines the Tree numbers. */
  function pretty() {
    return rawView(state.raw, state.data).text;
  }

  /* A read that changed the data builds the Sizes view again, which would drop
   * the keyboard on the page body. Remember what had focus in it (a row, a step
   * of the trail, a cell, a button) and give focus to the same thing after. */
  function sizesFocusOf(active) {
    if (!active || !el.viewport.contains(active) || !active.closest('.sizes')) return null;
    return { path: active.dataset.path, chart: active.dataset.chart, className: active.getAttribute('class') || '' };
  }

  function restoreSizesFocus(kept) {
    if (!kept) return;
    const same = [...el.viewport.querySelectorAll('.sizes *')].find((node) => (node.getAttribute('class') || '') === kept.className
      && node.dataset.path === kept.path && node.dataset.chart === kept.chart && !node.closest('[hidden]'));
    /* A place that is gone: the list's first row, else the trail's last step,
     * so Esc and the arrows carry on from a place in the view. */
    const near = same || el.viewport.querySelector('.sizes .size-row')
      || [...el.viewport.querySelectorAll('.sizes .sizes-crumb')].pop();
    (near || el.viewport).focus({ preventScroll: true });
  }

  /* The tree row (or Form row) that had keyboard focus: the row itself, or the row
   * that owns the button that had it. */
  function rowPathOfFocus(active) {
    if (!active || !el.viewport.contains(active)) return undefined;
    const row = active.classList.contains('row') || active.classList.contains('form-row')
      ? active : (active.closest('.row-tools, .form-row') && active.closest('.row, .form-row'));
    return row && row.dataset.path !== undefined ? row.dataset.path : undefined;
  }

  /* A row button (Copy, Watch, ...) that had focus from the keyboard: its row
   * and its place among the row's buttons. A button the pointer clicked is not
   * given focus again; the tree lets go of those. */
  function toolOfFocus(active) {
    if (!active || !el.viewport.contains(active) || !active.classList.contains('row-copy') || !active.closest('.row-tools, .form-tools')) return null;
    let keyboard = true;
    try { keyboard = active.matches(':focus-visible'); } catch { /* no such selector: assume the keyboard */ }
    const row = active.closest('.row, .form-row');
    if (!keyboard || !row || row.dataset.path === undefined) return null;
    return { path: row.dataset.path, index: [...row.querySelectorAll('.row-tools > button, .form-tools > button')].indexOf(active) };
  }

  function restoreToolFocus(kept) {
    if (!kept || kept.index < 0) return;
    const row = [...el.viewport.querySelectorAll('.row, .form-row')].find((node) => node.dataset.path === kept.path);
    const buttons = row ? row.querySelectorAll('.row-tools > button, .form-tools > button') : [];
    const button = buttons[Math.min(kept.index, buttons.length - 1)];
    if (button) button.focus({ preventScroll: true });
  }

  /* Rebuilds the viewport for the current state. */
  function drawViewport() {
    const viewport = el.viewport;
    state.queryInfo = null; // set again below when a $ query is drawn
    setEmptyState(!state.scanError && !Targets.selected() && state.raw === null);
    viewport.classList.toggle('is-stale', !!state.stale && state.raw !== null); // the last read, dimmed

    /* The change log is added to, not redrawn: a read that adds one entry
     * leaves the others, the scroll position and any selection alone. */
    const log = viewport.firstElementChild;
    if (state.view === 'changes' && state.trackChanges && log && log.classList.contains('changelog') && viewport.childElementCount === 1 &&
        Targets.selected() && !state.scanError && !state.stale && !state.parseError && state.data !== undefined) {
      updateChangeLog(log, state.log, viewport);
      return;
    }

    /* The sizes view shows one payload: until a new one is read it stays as it
     * is, so the chart choice, focus and a hover tooltip survive other redraws. */
    const sizes = viewport.firstElementChild;
    if (state.view === 'sizes' && sizes && sizes.classList.contains('sizes') && viewport.childElementCount === 1 &&
        sizes.__version === state.rawVersion && sizes.__unusedReady === elementsKnown() && Targets.selected() && !state.scanError && !state.stale && !state.parseError &&
        state.data !== undefined && !state.note) {
      return;
    }

    /* A redraw replaces the focused row; remember which it was. */
    const active = document.activeElement;
    const focusPath = rowPathOfFocus(active);
    const toolFocus = toolOfFocus(active);
    const sizesFocus = sizesFocusOf(active);
    viewport.textContent = '';
    viewport.removeAttribute('role'); // a tree again only when one is drawn below
    state.windowNote = ''; // set again below when the tree is windowed

    if (state.scanError) {
      viewport.appendChild(notice('Could not read the page', state.scanError, true));
      return;
    }

    /* No script to read, but a payload was read before: keep showing it (marked
     * stale below) instead of the "No OmniScript found" help. */
    if (!Targets.selected() && state.raw === null) {
      viewport.appendChild(emptyCard(state.prop));
      return;
    }

    if (state.raw === null) {
      viewport.appendChild(notice(`Nothing on ${state.prop}`,
        'This OmniScript exposes no value on that property right now.', false));
      return;
    }

    if (state.stale) viewport.appendChild(staleNotice());

    if (state.parseError) {
      viewport.appendChild(notice('The property is not valid JSON',
        `${state.parseError} — the raw value is shown below.`, true));
      viewport.appendChild(rawBlock(state.raw));
      return;
    }

    if (state.data === undefined) return;

    if (state.note) viewport.appendChild(notice(state.note.title, state.note.body, false));

    if (state.view === 'raw') {
      viewport.appendChild(rawBlock(pretty()));
      renderStatus(); // line and match counts are known only now
      return;
    }

    if (state.view === 'sizes') {
      const view = buildSizesView(sizesOf(), state.data, {
        reveal: (path) => { revealPath(path, { clearFilters: true }); render(); },
        tree: sizeTreeOf,
        ranking: rankingOf,
        shown: state.sizesShown,
        setShown: (count) => { state.sizesShown = count; },
        chart: state.sizesChart,
        setChart: (name) => { state.sizesChart = name; },
        zoom: state.sizesZoom,
        setZoom: (path) => { state.sizesZoom = path; },
        slots: state.sizesSlots,
        unused: {
          get: () => state.sizesUnused,
          set: (on) => { state.sizesUnused = on; },
          ready: elementsKnown,
          ask: (done) => Shared.ensureElements(done),
          compute: unusedOf
        }
      });
      view.__version = state.rawVersion;
      view.__unusedReady = elementsKnown();
      viewport.appendChild(view);
      restoreSizesFocus(sizesFocus);
      return;
    }

    if (state.view === 'changes' && !state.trackChanges) {
      viewport.appendChild(notice('Change tracking is off',
        'Tick Track changes to keep the values that change and list them here.', false));
      return;
    }

    if (state.view === 'changes') {
      const view = buildChangeLog({
        reveal: revealEntry,
        copy: (button) => copyWithButton(logText(state.log, Mask.apply), button, 'Copied'),
        open: state.logOpen,
        mask: Mask.apply,
        masked: Mask.on
      });
      viewport.appendChild(view);
      updateChangeLog(view, state.log, viewport);
      return;
    }

    if (state.changedOnly && !changeList().length) {
      viewport.appendChild(notice('No changes yet',
        'Nothing has changed since the marks were cleared. Values that change while this tab is open are listed here.', false));
      return;
    }

    const owners = ownerLookup();
    /* A path (Step:Rows|2:Field), key=value or $ query in the filter box picks
     * rows by structure; a path or key=value that finds nothing is searched as
     * text like any other, a $ query that finds nothing says so. */
    const asked = parseFilter(state.filter);
    /* Without the $ query (Free) a filter that starts with $ is plain text. */
    const parsed = asked.kind === 'query' && !Features.has('data.query') ? { kind: 'text', text: state.filter } : asked;
    const structured = queryMatches(state.data, parsed);
    state.queryInfo = parsed.kind === 'query' && structured
      ? { text: parsed.text, matches: structured.matches, capped: structured.capped } : null;
    renderStatus(); // the number of matches is known only now
    const changedRows = state.changedOnly ? changedVisible(state.data, state.touched) : null;
    const only = allowedRows(structured && structured.visible, changedRows);
    const flashOptions = {
      changed: state.changed,
      changedBranch: state.changedBranch,
      flashElapsed: flashProgress(state.changedAt, Date.now()) || 0,
      touched: state.touched,
      before: state.before,
      /* Read for each row built, not once (see the tree below). */
      jumped: () => (flashProgress(state.jumpedAt, Date.now(), JUMP_FLASH_MS) !== null ? state.focus : null),
      jumpElapsed: () => flashProgress(state.jumpedAt, Date.now(), JUMP_FLASH_MS) || 0
    };

    if (state.view === 'form') {
      const form = renderDataForm(viewport, {
        ...flashOptions,
        data: state.data,
        elements: Shared.elements(),
        query: structured ? '' : state.filter,
        only,
        expanded: state.expanded,
        filterOpen: state.filterOpen,
        transform: Mask.apply,
        onJump: (path) => Nav.go('structure', { segments: dataSegments(state.data, path) }),
        jumpLabel: (path) => jumpLabel(owners, path),
        pinned: new Set(state.pins),
        onPin: Features.has('data.watch') ? togglePin : null,
        mergeButton: true,
        canOpenRecord: recordLink.available() ? recordLink.isRecordId : null,
        onOpenRecord: (path, value) => recordLink.open(value),
        onContext: rowMenu,
        rowNote: Features.has('data.changes') ? lineage.note : null,
        sticky: true,
        onToggle: render,
        focusPath
      });
      state.scrollTo = form.scrollTo;
      restoreToolFocus(toolFocus);
      if (!form.matched) {
        const typed = state.filter.trim();
        viewport.appendChild(noMatchNotice({ things: state.changedOnly ? 'changed rows' : 'rows', query: typed, onClear: typed ? clearFilter : null }));
        return;
      }
      scrollToFocus();
      return;
    }

    const result = renderJsonTree(viewport, 'Data', state.data, {
      rootTitle: state.prop, // the property it was read from
      expanded: state.expanded,
      filterOpen: state.filterOpen,
      expandedText: state.expandedText,
      changed: state.changed,
      flashElapsed: flashProgress(state.changedAt, Date.now()) || 0,
      changedBranch: state.changedBranch,
      touched: state.touched,
      before: state.before,
      /* Read for each row built, not once: a windowed tree rebuilds its rows on
       * scroll, and a flash that is over must not start again. */
      jumped: () => (flashProgress(state.jumpedAt, Date.now(), JUMP_FLASH_MS) !== null ? state.focus : null),
      jumpElapsed: () => flashProgress(state.jumpedAt, Date.now(), JUMP_FLASH_MS) || 0,
      only,
      filter: structured ? '' : state.filter,
      transform: Mask.apply,
      onJump: (path) => Nav.go('structure', { segments: dataSegments(state.data, path) }),
      jumpLabel: (path) => jumpLabel(owners, path),
      pinned: new Set(state.pins),
      onPin: Features.has('data.watch') ? togglePin : null,
      mergeButton: true,
      canOpenRecord: recordLink.available() ? recordLink.isRecordId : null,
      onOpenRecord: (path, value) => recordLink.open(value),
      onContext: rowMenu,
      rowNote: Features.has('data.changes') ? lineage.note : null,
      sticky: true,
      onToggle: render,
      focusPath
    });
    state.scrollTo = result.scrollTo;
    restoreToolFocus(toolFocus);

    if (!result.matched) {
      const typed = state.filter.trim();
      viewport.appendChild(noMatchNotice({ things: state.changedOnly ? 'changed rows' : 'rows', query: typed, onClear: typed ? clearFilter : null }));
      return;
    }

    scrollToFocus();

    if (result.truncated) {
      viewport.appendChild(notice(`Tree cut at ${result.rows.toLocaleString('en-US')} rows`,
        'Filter the data or switch to Raw to see the rest.', false));
    }
    if (result.windowed) {
      state.windowNote = `${result.rows} rows, drawn a window at a time`;
      renderStatus(); // the status bar's tooltip carries it
    }
  }

  return { drawViewport, changeList, ownerLookup, jumpLabel, sizesOf };
}
