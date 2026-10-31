'use strict';

/* Two values compared side by side: Before on the left, After on the right,
 * the rows lined up, the differences highlighted in place and the unchanged
 * branches folded. Used by the Changes and Compare tabs of a call, the two
 * debug runs, Compare data and Compare JSON.
 *
 *   createCompareView({
 *     host,                   // the element to draw into (emptied)
 *     before, after,          // the two values (undefined: that side has none)
 *     titles: { before, after }, // the pane titles: "Before: read at 10:44:30, …"
 *     surface: 'calls-changes', // where it is: the Side by side / List choice and
 *                             //   the open branches are kept per surface while DevTools is open
 *     key: '',                // which pair this is: a new key forgets the open branches
 *     heading: '',            // a title at the start of the head ("Input"), optional
 *     identical: 'Identical', // said when nothing differs
 *     mask: fn|null,          // applied to every value on screen (Mask values)
 *     onCopy: fn(text, button)|null // what Copy does with its text (default: the clipboard)
 *   })  ->  { element, model(), refresh(), layout() }
 *
 * The rows, the order of the differences and their sentences are decided in
 * src/core/shared/diff-tree.js; this module draws them and handles the keys:
 * Up/Down the previous / next difference, Left/Right close / open the branch,
 * Enter opens a fold or toggles a branch, Home/End the first / last
 * difference. Under NARROW_AT pixels the two panes become one, the line of
 * Before above the line of After. */

import { buildDiffTree, maskRows, maskDifferences, changeHighlight, footText, countPills, unifiedRows, changesOf } from '../core/shared/diff-tree.js';
import { maskChange, formatPath } from '../core/shared/diff.js';
import { diffLine } from './diff-lines.js';
import { Mask } from './mask-setting.js';
import { Settings } from './settings.js';
import { copyWithButton } from './clipboard.js';

/* Two panes need about this much room; below it they become one. */
export const NARROW_AT = 640;

const PILL_CLASS = { changed: 'tag tag-warn', added: 'tag tag-ok', removed: 'tag tag-error' };
const TITLE_MAX = 1024;

/* What each surface keeps while DevTools is open: never stored. */
const memory = new Map();

function remembered(surface, key) {
  let mem = memory.get(surface);
  if (!mem) {
    mem = { mode: 'side', showUnchanged: false, open: new Map(), current: null, row: null, key };
    memory.set(surface, mem);
  }
  if (mem.key !== key) {
    mem.key = key;
    mem.open = new Map();
    mem.current = null;
    mem.row = null;
  }
  return mem;
}

/* The views on screen that show values through Mask values: turning it on or
 * off draws them again in place, so a selection or the focus is not lost to a
 * redraw of what holds them. One listener for all; a view that has left the
 * document is dropped. */
const masked = new Set();
let listening = false;

function watchMask(view) {
  masked.add(view);
  if (listening) return;
  listening = true;
  Settings.onChange(() => {
    masked.forEach((one) => {
      if (!one.element.isConnected) { masked.delete(one); return; }
      if (one.drawnMask !== Mask.on()) one.refresh();
    });
  });
}

/* For the tests: forget every surface's choices, as a new DevTools would. */
export function forgetCompareViews() {
  memory.clear();
}

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
  return node;
}

/* "Before: read at 10:44:30" -> <b>Before</b> read at 10:44:30 */
function paneTitle(text) {
  const head = el('div', 'cmp-ph');
  const at = text.indexOf(':');
  if (at < 0) { head.appendChild(el('b', undefined, text)); return head; }
  head.append(el('b', undefined, text.slice(0, at)), el('span', 'cmp-ph-note', text.slice(at + 1).trim()));
  return head;
}

export function createCompareView(options) {
  const {
    host, before, after, titles = {}, surface = 'compare', key = '', heading = '', identical = 'Identical',
    mask = null, onCopy = null
  } = options;
  const beforeTitle = titles.before || 'Before';
  const afterTitle = titles.after || 'After';
  const mem = remembered(surface, key);

  const element = el('div', 'cmp-view');
  element.dataset.surface = surface;
  host.textContent = '';
  host.appendChild(element);

  let narrow = false;
  let tree = null;
  let rows = [];
  let differences = [];
  let body = null;
  let foot = null;

  function model() {
    tree = buildDiffTree(before, after, { showUnchanged: mem.showUnchanged, open: mem.open });
    rows = mask ? maskRows(tree.rows, mask) : tree.rows;
    differences = mask ? maskDifferences(tree.differences, mask) : tree.differences;
    return { ...tree, rows, differences };
  }

  /* ------------------------------------------------------------ moves */

  const rowIndex = (id) => rows.findIndex((row) => row.id === id);

  /* Make difference `index` current: open what hides it, draw, outline. */
  function goTo(index) {
    if (!differences.length) return;
    const target = Math.max(0, Math.min(differences.length - 1, index));
    differences[target].ancestors.forEach((id) => mem.open.set(id, true));
    mem.current = target;
    mem.row = differences[target].rowId;
    paint({ scroll: true, focus: true });
  }

  /* The difference to go from: the current one, or the last one above the
   * row the reader picked. */
  function anchor() {
    if (mem.row === null) return mem.current;
    const at = rowIndex(mem.row);
    if (at < 0) return mem.current;
    for (let n = at; n >= 0; n--) if (rows[n].diff !== undefined) return n === at ? rows[n].diff : rows[n].diff + 0.5;
    return -0.5;
  }

  function step(direction) {
    const from = anchor();
    if (from === null || from === undefined) { goTo(direction > 0 ? 0 : differences.length - 1); return; }
    goTo(direction > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1);
  }

  function setOpen(id, open) {
    mem.open.set(id, open);
    paint({ focus: true });
  }

  function pickRow(row) {
    mem.row = row.id;
    if (row.diff !== undefined) mem.current = row.diff;
  }

  /* A click: a fold opens, a branch opens or closes, any row becomes current. */
  function clickRow(row) {
    pickRow(row);
    if (row.kind === 'fold') { setOpen(row.id, true); return; }
    if (row.container) { setOpen(row.id, !row.open); return; }
    paint({ focus: true });
  }

  function onKey(ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const row = rows[rowIndex(mem.row)] || null;
    switch (ev.key) {
      case 'ArrowDown': step(1); break;
      case 'ArrowUp': step(-1); break;
      case 'Home': goTo(0); break;
      case 'End': goTo(differences.length - 1); break;
      case 'ArrowRight':
        if (!row) return;
        if (row.kind === 'fold' || (row.container && !row.open)) setOpen(row.id, true);
        break;
      case 'ArrowLeft':
        if (!row) return;
        if (row.container && row.open) { setOpen(row.id, false); break; }
        if (row.parent !== null && row.parent !== undefined) {
          const parent = rows[rowIndex(row.parent)];
          mem.row = row.parent;
          if (parent && parent.diff !== undefined) mem.current = parent.diff;
          setOpen(row.parent, false);
        }
        break;
      case 'Enter':
        if (!row) return;
        if (row.kind === 'fold') setOpen(row.id, true);
        else if (row.container) setOpen(row.id, !row.open);
        else return;
        break;
      default: return;
    }
    ev.preventDefault();
  }

  /* ------------------------------------------------------------- head */

  function copyText() {
    return JSON.stringify(changesOf(tree.differences).map((change) => maskChange(change, Mask.apply)), null, 2);
  }

  /* One row when there is room: the title and the counts on the left, the
   * tools (‹ ›, Side by side | List, Show unchanged, Copy) as one group on the
   * right. When the two do not fit, the group wraps below as a whole. */
  function head() {
    const bar = el('div', 'cmp-head');
    const summary = el('div', 'cmp-summary');
    if (heading) summary.appendChild(el('h3', 'cmp-title', heading));
    if (!differences.length) {
      summary.appendChild(el('span', 'cmp-same', identical));
    } else {
      countPills(tree.counts).forEach((pill) => {
        const tag = el('span', `${PILL_CLASS[pill.tone]} cmp-pill is-${pill.tone}`, `${pill.count}${tree.truncated ? '+' : ''} ${pill.tone}`);
        summary.appendChild(tag);
      });
    }
    bar.appendChild(summary);

    const tools = el('span', 'cmp-tools');
    if (differences.length && mem.mode === 'side') {
      /* Previous and Next are one small pair, named for a screen reader. */
      const pair = el('span', 'seg cmp-nav');
      pair.setAttribute('role', 'group');
      pair.setAttribute('aria-label', 'Differences');
      const prev = button('seg-btn tiny cmp-prev', '‹', 'Previous difference (↑)');
      prev.setAttribute('aria-label', 'Previous difference');
      prev.setAttribute('data-help', 'Side by side');
      const next = button('seg-btn tiny cmp-next', '›', 'Next difference (↓)');
      next.setAttribute('aria-label', 'Next difference');
      next.setAttribute('data-help', 'Side by side');
      const from = anchor();
      prev.disabled = from === null || from <= 0;
      next.disabled = from !== null && from >= differences.length - 1;
      prev.addEventListener('click', () => step(-1));
      next.addEventListener('click', () => step(1));
      pair.append(prev, next);
      tools.appendChild(pair);
    }
    if (differences.length) {
      const seg = el('span', 'seg cmp-mode');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'How to show the differences');
      [['side', 'Side by side', 'Show Before and After as two panes, the rows lined up'], ['list', 'List', 'Show the differences as a list, one block per path']].forEach(([mode, text, title]) => {
        const option = button(`seg-btn tiny cmp-mode-${mode}${mem.mode === mode ? ' is-on' : ''}`, text, title);
        option.setAttribute('aria-pressed', String(mem.mode === mode));
        option.setAttribute('data-help', 'Side by side');
        option.addEventListener('click', () => { if (mem.mode !== mode) { mem.mode = mode; paint({ keepFocus: `.cmp-mode-${mode}` }); } });
        seg.appendChild(option);
      });
      tools.appendChild(seg);
    }
    if (mem.mode === 'side' || !differences.length) {
      const label = el('label', 'cmp-unchanged');
      label.title = 'Show the keys and rows that did not change instead of folding them to one line';
      label.setAttribute('data-help', 'Side by side');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = mem.showUnchanged;
      box.addEventListener('change', () => { mem.showUnchanged = box.checked; paint({ keepFocus: '.cmp-unchanged input' }); });
      label.append(box, document.createTextNode(' Show unchanged'));
      tools.appendChild(label);
    }
    if (differences.length) {
      const copy = button('icon-btn tiny cmp-copy', 'Copy', 'Copy these differences as JSON. Honours Mask values.');
      copy.setAttribute('data-help', 'Side by side');
      copy.addEventListener('click', () => {
        const text = copyText();
        if (onCopy) onCopy(text, copy); else copyWithButton(text, copy);
      });
      tools.appendChild(copy);
    }
    bar.appendChild(tools);
    return bar;
  }

  /* ------------------------------------------------------------- rows */

  function valueNode(side, highlight) {
    const value = el('span', side.type === 'close' || side.type === 'fold' ? 'cmp-v' : `cmp-v v v-${side.type === 'array' || side.type === 'object' ? 'container' : side.type}`);
    const text = side.text;
    if (!highlight || highlight.end <= highlight.start) { value.textContent = text; return value; }
    if (highlight.start > 0) value.appendChild(document.createTextNode(text.slice(0, highlight.start)));
    value.appendChild(el('span', 'diff-hl', text.slice(highlight.start, highlight.end)));
    if (highlight.end < text.length) value.appendChild(document.createTextNode(text.slice(highlight.end)));
    return value;
  }

  const TONE = { same: '', fold: 'is-fold', changed: 'is-changed', added: 'is-added', removed: 'is-removed' };

  /* One line of one pane: the line number, the indent and twisty, the label
   * and the value. A side with nothing is the hatched gap. */
  function line(row, side, tone, highlight, current) {
    if (!side) {
      const gap = el('div', 'cmp-row is-gap');
      gap.setAttribute('aria-hidden', 'true');
      return gap;
    }
    const node = el('div', `cmp-row ${TONE[tone] || ''}${current ? ' is-current' : ''}`.trim());
    node.dataset.id = row.id;
    node.appendChild(el('span', 'cmp-n', side.line === null || side.line === undefined ? '' : String(side.line)));
    const text = el('span', 'cmp-t');
    text.style.paddingLeft = `${row.depth * 2}ch`;
    const twisty = el('span', 'cmp-tw', row.container ? (row.open ? '▾' : '▸') : '');
    twisty.setAttribute('aria-hidden', 'true');
    text.appendChild(twisty);
    if (side.label) {
      text.appendChild(el('span', side.label.startsWith('|') && /^\|\d+$/.test(side.label) ? 'cmp-k cmp-pos' : 'cmp-k k', side.label));
      text.appendChild(document.createTextNode(': '));
    }
    text.appendChild(valueNode(side, highlight));
    node.appendChild(text);
    const full = `${side.label ? `${side.label}: ` : ''}${side.text}`;
    node.title = full.length > TITLE_MAX ? `${full.slice(0, TITLE_MAX)}…` : full;
    node.addEventListener('click', () => clickRow(row));
    return node;
  }

  /* A fold: one grey line that opens on click; a button on the pane read
   * aloud, so it is reached with Tab too. */
  function foldLine(row, current, focusable) {
    const node = focusable ? button('cmp-row is-fold cmp-fold', '', 'Show these unchanged lines (Enter)') : el('div', 'cmp-row is-fold');
    if (!focusable) node.setAttribute('aria-hidden', 'true');
    if (current) node.classList.add('is-current');
    node.dataset.id = row.id;
    node.appendChild(el('span', 'cmp-n', ''));
    const text = el('span', 'cmp-t', row.right.text);
    text.style.paddingLeft = `${row.depth * 2}ch`;
    node.appendChild(text);
    node.addEventListener('click', (ev) => { ev.stopPropagation(); clickRow(row); });
    return node;
  }

  function highlightsOf(row) {
    if (row.kind !== 'changed' || !row.left || !row.right) return { before: null, after: null };
    return changeHighlight(row.left.text, row.right.text, row.left.value, row.right.value);
  }

  function pane(className, title, label) {
    const node = el('div', `cmp-pane ${className}`);
    node.setAttribute('role', 'region');
    node.setAttribute('aria-label', label);
    node.appendChild(title);
    return node;
  }

  function panes() {
    const wrap = el('div', `cmp-panes${narrow ? ' is-unified' : ''}`);
    if (narrow) {
      const only = pane('cmp-pane-both', (() => {
        const titleRow = el('div', 'cmp-ph');
        titleRow.append(el('b', 'cmp-ph-before', beforeTitle), el('b', 'cmp-ph-after', afterTitle));
        return titleRow;
      })(), `${beforeTitle} and ${afterTitle}`);
      unifiedRows(rows).forEach(({ row, side, tone }) => {
        const current = row.id === mem.row;
        if (row.kind === 'fold') { only.appendChild(foldLine(row, current, true)); return; }
        const hl = highlightsOf(row);
        const node = line(row, row[side], tone, side === 'left' ? hl.before : hl.after, current);
        node.classList.add(side === 'left' ? 'is-before' : 'is-after');
        only.appendChild(node);
      });
      wrap.appendChild(only);
      return wrap;
    }
    const left = pane('cmp-pane-before', paneTitle(beforeTitle), beforeTitle);
    const right = pane('cmp-pane-after', paneTitle(afterTitle), afterTitle);
    rows.forEach((row) => {
      const current = row.id === mem.row;
      if (row.kind === 'fold') {
        left.appendChild(foldLine(row, current, false));
        right.appendChild(foldLine(row, current, true));
        return;
      }
      const hl = highlightsOf(row);
      left.appendChild(line(row, row.left, row.kind, hl.before, current));
      right.appendChild(line(row, row.right, row.kind, hl.after, current));
    });
    wrap.append(left, right);
    return wrap;
  }

  function list() {
    const box = el('div', 'cmp-list');
    changesOf(tree.differences).forEach((change) => box.appendChild(diffLine(change, mask || ((value) => value))));
    return box;
  }

  function footFor() {
    const row = rows[rowIndex(mem.row)];
    if (row && row.diff === undefined && row.kind !== 'fold') return `${formatPath(row.path)} · ←/→ close or open, ↑/↓ the differences`;
    if (row && row.kind === 'fold') return `${row.right.text.replace(/^… /, '')} · Enter shows them`;
    return footText(differences, mem.current, tree.truncated);
  }

  /* ------------------------------------------------------------ paint */

  const self = { element, drawnMask: Mask.on(), refresh: () => paint() };

  function paint({ scroll = false, focus = false, keepFocus = '' } = {}) {
    const hadFocus = element.contains(document.activeElement) && document.activeElement === body;
    self.drawnMask = Mask.on();
    model();
    element.textContent = '';
    element.classList.toggle('is-list', mem.mode === 'list');
    element.appendChild(head());

    const showPanes = differences.length || (mem.showUnchanged && rows.length);
    body = null;
    foot = null;
    if (showPanes && mem.mode === 'list' && differences.length) {
      element.appendChild(list());
    } else if (showPanes) {
      body = el('div', 'cmp-body');
      body.tabIndex = 0;
      body.setAttribute('role', 'group');
      body.setAttribute('aria-label', `${heading ? `${heading}: ` : ''}${beforeTitle} and ${afterTitle}. Up and Down go through the differences, Left and Right close and open a branch`);
      body.addEventListener('keydown', onKey);
      body.appendChild(panes());
      element.appendChild(body);
      foot = el('div', 'cmp-foot', footFor());
      foot.setAttribute('aria-live', 'polite');
      element.appendChild(foot);
    }
    if (tree.truncated) {
      element.appendChild(el('div', 'bar-note cmp-cut', `Showing the first ${differences.length} differences only.`));
    }

    if (body && (focus || hadFocus)) body.focus({ preventScroll: true });
    // Redrawing drops the pressed control: keep the keyboard where it was.
    if (keepFocus) {
      const again = element.querySelector(keepFocus);
      if (again) again.focus();
    }
    if (scroll && body) {
      const target = body.querySelector('.cmp-row.is-current');
      if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
    }
  }

  /* Two panes or one, by the width the view has. A width of 0 (not laid out
   * yet, or a test document) keeps two. */
  function layout() {
    const width = element.clientWidth;
    const now = width > 0 && width < NARROW_AT;
    if (now === narrow) return false;
    narrow = now;
    paint();
    return true;
  }

  paint();
  layout();
  if (mask) watchMask(self);
  if (typeof ResizeObserver === 'function') {
    const watcher = new ResizeObserver(() => {
      if (!element.isConnected) { watcher.disconnect(); return; }
      layout();
    });
    watcher.observe(element);
  }

  return { element, model: () => ({ ...tree, rows, differences }), refresh: () => paint(), layout, copyText };
}
