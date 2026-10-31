'use strict';

/* The Data tab's Changes view (with Track changes on): the last values that changed,
 * oldest first, newest at the bottom. Each entry is one line (time, path, and a
 * short was → now beside it; the step is in its tooltip) that opens in place to
 * the values before and after, and a small button that shows the path in the tree.
 *
 * The list is updated in place — rows that fell off the end of the log are
 * removed and new ones appended — so a read that adds one entry does not
 * rebuild the others: the scroll position, the text selection and the entries
 * the user has opened all survive. */

import { clockText, changeParts } from '../../core/shared/change-log.js';
import { maskIdentity } from '../../core/shared/diff.js';
import { diffLine } from '../diff-lines.js';
import { icon, decorateButton } from '../icons.js';

const NEAR_BOTTOM_PX = 24;

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

const whereOf = (entry, on) => (entry.identity ? `${entry.text} (${maskIdentity(entry.identity, on.mask)})` : entry.text);

/* The step the script was on is not a column of its own: it is the line's
 * tooltip, and the head of the opened values. */
const stepOf = (entry) => (entry.step ? `on ${entry.step}` : 'step not known');

/* The words of the entry's line: time, path, and was → now as two columns
 * (old, arrow, new) that line up from one entry to the next. */
function fillLine(line, entry, on) {
  const where = whereOf(entry, on);
  const whereNode = line.querySelector('.log-where');
  whereNode.textContent = where;
  /* A repeat-block position, |3, is the OmniScript's own count from 1. */
  whereNode.title = /\|\d/.test(where) ? `${where}\n|3 is row 3 of the list` : where;
  const { before, after } = changeParts(entry, on.mask);
  line.querySelector('.log-old').textContent = before;
  line.querySelector('.log-new').textContent = after;
}

/* old, arrow and new are three cells of the list's grid (log-what takes no box
 * of its own); the text of the whole is still "old → new". */
function what() {
  const wrap = span('log-what', '');
  wrap.append(span('log-old', ''), span('log-arrow', ' → '), span('log-new', ''));
  return wrap;
}

function entryRow(entry, on, open) {
  const item = document.createElement('div');
  item.className = `log-item is-${entry.kind}`;
  item.dataset.id = String(entry.id);
  item.dataset.path = entry.path;

  const bar = document.createElement('div');
  bar.className = 'log-bar';

  const line = document.createElement('div');
  line.className = `log-entry is-${entry.kind}`;
  line.setAttribute('role', 'button');
  line.tabIndex = -1;
  line.setAttribute('aria-expanded', 'false');
  line.title = `${stepOf(entry)}: show the values before and after (Enter)`;
  line.__entry = entry; // for a copy that has to apply Mask values
  line.append(
    span('log-caret', ''),
    span('log-time', clockText(entry.time)),
    span('log-where', ''),
    what()
  );
  line.querySelector('.log-caret').setAttribute('aria-hidden', 'true');
  fillLine(line, entry, on);
  line.addEventListener('click', () => toggle(item, on, open));

  const tree = document.createElement('button');
  tree.type = 'button';
  tree.className = 'icon-btn tiny log-tree';
  tree.setAttribute('aria-label', `Show ${entry.text} in the tree`);
  tree.title = 'Show in the tree (t)';
  tree.appendChild(icon('tree'));
  tree.addEventListener('click', () => on.reveal(entry));

  bar.append(line, tree);
  item.appendChild(bar);
  if (open.has(entry.id)) setOpen(item, entry, on, true);
  return item;
}

/* Show or hide the values under an entry. The diff block is built when it is
 * first needed (and again after Mask values changed), not for 200 entries up
 * front. */
function setOpen(item, entry, on, isOpen) {
  const line = item.querySelector('.log-entry');
  line.setAttribute('aria-expanded', String(isOpen));
  item.classList.toggle('is-open', isOpen);
  let diff = item.querySelector('.log-diff');
  if (!isOpen) {
    if (diff) diff.hidden = true;
    return;
  }
  if (!diff) {
    diff = document.createElement('div');
    diff.className = 'log-diff';
    item.appendChild(diff);
  }
  if (diff.__masked !== on.masked() || !diff.firstChild) {
    diff.textContent = '';
    const step = document.createElement('div');
    step.className = 'log-diff-step';
    step.textContent = `${clockText(entry.time)} · ${stepOf(entry)}`;
    diff.appendChild(step);
    /* The block names the path as the line does, not by its internal form. */
    diff.appendChild(diffLine({ ...entry, path: entry.text }, on.mask, { pretty: true }));
    diff.__masked = on.masked();
  }
  diff.hidden = false;
}

function toggle(item, on, open) {
  const entry = item.querySelector('.log-entry').__entry;
  const isOpen = !open.has(entry.id);
  if (isOpen) open.add(entry.id); else open.delete(entry.id);
  setOpen(item, entry, on, isOpen);
}

/* ------------------------------------------------------------ keyboard */

const lines = (list) => [...list.querySelectorAll('.log-entry')];

/* One line at a time has the Tab stop; arrows move it. */
function setStop(list, line) {
  lines(list).forEach((other) => { other.tabIndex = other === line ? 0 : -1; });
}

function onKey(ev, box) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const item = ev.target.closest && ev.target.closest('.log-item');
  if (!item) return;
  const list = box.querySelector('.changelog-list');
  const line = item.querySelector('.log-entry');
  const entry = line.__entry;
  const all = lines(list);
  const at = all.indexOf(line);
  const go = (to) => {
    const target = all[Math.max(0, Math.min(all.length - 1, to))];
    if (!target) return;
    setStop(list, target);
    target.focus();
  };
  switch (ev.key) {
    case 'ArrowDown': ev.preventDefault(); go(at + 1); break;
    case 'ArrowUp': ev.preventDefault(); go(at - 1); break;
    case 'Home': ev.preventDefault(); go(0); break;
    case 'End': ev.preventDefault(); go(all.length - 1); break;
    case 'Enter':
    case ' ':
      if (ev.target !== line) return; // the tree button handles its own
      ev.preventDefault();
      toggle(item, box.__on, box.__open);
      break;
    case 't':
      ev.preventDefault();
      box.__on.reveal(entry);
      break;
    default: break;
  }
}

/* ---------------------------------------------------------------- view */

/* The whole view, empty; fill it with updateChangeLog.
 * on: { reveal(entry), copy(button), open: Set of the ids of opened entries,
 * mask(value) -> the value as it should be shown, masked() -> whether Mask
 * values is on } */
export function buildChangeLog(on) {
  const box = document.createElement('div');
  box.className = 'changelog';

  const head = document.createElement('div');
  head.className = 'bar changelog-head';
  const title = document.createElement('span');
  title.className = 'bar-label';
  title.textContent = 'Changes';
  const count = document.createElement('span');
  count.className = 'bar-note changelog-count';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'icon-btn changelog-copy';
  copy.setAttribute('data-help', 'Changes view');
  decorateButton(copy, 'copy', 'Copy log');
  copy.title = 'Copy the changes as text, one per line. Honours Mask values.';
  copy.addEventListener('click', () => on.copy(copy));
  head.append(title, count, copy);

  const empty = document.createElement('div');
  empty.className = 'bar-note changelog-empty';
  empty.textContent = 'No changes yet. Values that change while this tab is open are listed here; Clear marks empties the list.';

  const list = document.createElement('div');
  list.className = 'changelog-list';
  list.addEventListener('keydown', (ev) => onKey(ev, box));
  list.addEventListener('focusin', (ev) => {
    const line = ev.target.closest && ev.target.closest('.log-item');
    if (line) setStop(list, line.querySelector('.log-entry'));
  });
  box.append(head, empty, list);
  box.__on = on;
  box.__open = on.open;
  box.__masked = on.masked();
  return box;
}

/* Draw every entry's words again, and the values of the opened ones: Mask
 * values was switched. */
function repaint(list, on) {
  list.querySelectorAll('.log-item').forEach((item) => {
    const line = item.querySelector('.log-entry');
    fillLine(line, line.__entry, on);
    if (item.classList.contains('is-open')) setOpen(item, line.__entry, on, true);
  });
}

/* Bring the view up to date with `log` (oldest first, ids rising). */
export function updateChangeLog(box, log, scroller) {
  const list = box.querySelector('.changelog-list');
  const on = box.__on;
  const stick = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= NEAR_BOTTOM_PX
    || !list.childElementCount;

  const firstId = log.length ? log[0].id : Infinity;
  while (list.firstElementChild && Number(list.firstElementChild.dataset.id) < firstId) list.firstElementChild.remove();
  box.__open.forEach((id) => { if (id < firstId) box.__open.delete(id); });

  if (on.masked() !== box.__masked) {
    box.__masked = on.masked();
    repaint(list, on);
  }

  const lastShown = list.lastElementChild ? Number(list.lastElementChild.dataset.id) : -1;
  const fresh = log.filter((entry) => entry.id > lastShown);
  if (fresh.length) {
    const frag = document.createDocumentFragment();
    fresh.forEach((entry) => frag.appendChild(entryRow(entry, on, box.__open)));
    list.appendChild(frag);
  }
  if (!list.querySelector('.log-entry[tabindex="0"]') && list.firstElementChild) {
    setStop(list, list.firstElementChild.querySelector('.log-entry'));
  }

  box.querySelector('.changelog-empty').hidden = log.length > 0;
  box.querySelector('.changelog-count').textContent = log.length ? `${log.length} (the last 200 are kept)` : '';
  box.querySelector('.changelog-copy').disabled = log.length === 0;
  if (stick && fresh.length && scroller) scroller.scrollTop = scroller.scrollHeight;
}
