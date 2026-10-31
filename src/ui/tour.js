'use strict';

/* The tours: small cards, each next to the control it describes. Not modal:
 * nothing is dimmed and the panel stays usable.
 *
 *   panel tour  four steps, the first time the panel opens in this browser
 *   tab tours   at most three steps each (the TOUR export of the tab's help
 *               module), the first time that tab is opened
 *
 * A tab tour never starts while another tour or any dialog is open, and never
 * in the same session as another tour (the panel tour included): a new person
 * sees one small card each time DevTools opens, not several in a row. Every
 * card has a "Don't show tours" link that stops them all. That each tour was
 * seen is one yes-or-no flag per tour (tourSeen, tourSeenData,
 * tourSeenStructure, tourSeenActions) in extension storage, through stored.js,
 * whether or not Remember my settings is on. The steps, the moves and when a
 * tour is due are decided in core/shared/tour.js. */

import {
  TOUR_KEYS, ALL_TOUR_KEYS, tourSteps, tourToShow, nextStep, stepCount, anchorOf, cardLeft, unionBox,
  tabTourSteps, tabTourDue, dismissAllFlags, stepText
} from '../core/shared/tour.js';
import { fixedPosition } from '../core/shared/text-size.js';
import { plainChips } from '../core/shared/chips.js';
import { setMarked } from './chip-text.js';
import { TextSize } from './text-size.js';
import { isFreeBuild } from './free-build.js';
import { readStored, writeStored, removeStored } from './stored.js';
import { TOUR as DATA_TOUR } from './help/data.js';
import { TOUR as STRUCTURE_TOUR } from './help/structure.js';
import { TOUR as ACTIONS_TOUR } from './help/actions.js';

const GAP = 8; // between the control and the card

const TAB_TOURS = { data: DATA_TOUR, structure: STRUCTURE_TOUR, actions: ACTIONS_TOUR };

let open = null; // { card, index, kind, steps, opener, targets } while a tour is on screen
let flags = null; // what storage says of each tour; null while unknown (no storage: no tours)
let shownThisSession = false;
let watching = false;

function currentTab() {
  const on = document.querySelector('[role="tab"][aria-selected="true"]');
  return on && on.id ? on.id.replace(/^tab-/, '') : 'data';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(move, label, title, className) {
  const node = element('button', className, label);
  node.type = 'button';
  node.dataset.move = move;
  node.title = title;
  return node;
}

function buildCard(count) {
  const card = element('div', 'tour-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'tour-title');
  card.setAttribute('aria-describedby', 'tour-text');

  const title = element('h2', 'tour-title');
  title.id = 'tour-title';
  const text = element('p', 'tour-text');
  text.id = 'tour-text';

  const dots = element('span', 'tour-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let at = 0; at < count; at += 1) dots.appendChild(element('i'));

  /* The same count as the title's hidden prefix, drawn for the eye. */
  const counter = element('span', 'tour-counter');
  counter.setAttribute('aria-hidden', 'true');

  const foot = element('div', 'tour-foot');
  foot.append(
    dots,
    counter,
    button('skip', 'Skip', 'Close this tour. Help, under Start here, shows the tours again.', 'tour-skip'),
    button('back', 'Previous tip', 'Go to the previous tip'),
    button('next', 'Next tip', 'Go to the next tip', 'primary')
  );

  /* Always there, on every card of every tour. */
  const off = button('off', 'Don’t show tours', 'Stop all the tours: the panel tour and the one of each tab. Help, under Start here, shows them again.', 'tour-off help-more');

  /* The count is read out when the card appears and at every tip. */
  const status = element('span', 'sr-only');
  status.id = 'tour-count';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  card.append(title, text, foot, off, status);
  return card;
}

/* Puts the card by the control the step is about, and rings the control (or
 * every control of a step that names several). A control that is not on screen
 * leaves the card at the top left. */
function place() {
  if (!open) return;
  const { card } = open;
  const step = open.steps[open.index];
  paintText(step);
  open.targets.forEach((node) => node.classList.remove('tour-target'));
  const found = Array.from(document.querySelectorAll(anchorOf(step, currentTab())))
    .filter((node) => !node.closest('[hidden]'));
  const anchors = step.all ? found : found.slice(0, 1);
  open.targets = anchors;
  anchors.forEach((node) => node.classList.add('tour-target'));
  const box = unionBox(anchors.map((node) => node.getBoundingClientRect()));
  const shown = box !== null;

  const at = fixedPosition({
    x: shown ? cardLeft(step, box, card.offsetWidth) : 8,
    y: shown ? box.bottom + GAP : 40,
    width: card.offsetWidth,
    height: card.offsetHeight,
    viewWidth: window.innerWidth,
    viewHeight: window.innerHeight,
    zoom: TextSize.zoom()
  });
  card.style.left = `${at.left}px`;
  card.style.top = `${at.top}px`;
}

/* The sentence of the step on the tab on screen: the filter step reads
 * differently on each tab. Written only when it changed, so a screen reader
 * hears it again only then. */
function paintText(step) {
  const { card, index, steps } = open;
  const text = stepText(step, currentTab());
  const node = card.querySelector('.tour-text');
  if (node.dataset.mark === text) return;
  node.dataset.mark = text;
  setMarked(node, text);
  card.querySelector('#tour-count').textContent = `${stepCount(index, steps.length)}: ${step.title}. ${plainChips(text)}`;
}

function paint() {
  const { card, index, steps } = open;
  const step = steps[index];
  const last = index === steps.length - 1;
  const count = stepCount(index, steps.length);

  const title = card.querySelector('.tour-title');
  title.textContent = '';
  title.append(element('span', 'sr-only', `${count}: `), document.createTextNode(step.title));
  delete card.querySelector('.tour-text').dataset.mark;
  card.querySelector('.tour-counter').textContent = count;
  card.querySelectorAll('.tour-dots i').forEach((dot, at) => dot.classList.toggle('is-on', at === index));

  card.querySelector('[data-move="back"]').disabled = index === 0;
  card.querySelector('[data-move="skip"]').hidden = last;
  const next = card.querySelector('[data-move="next"]');
  next.textContent = last ? 'Done' : 'Next tip';
  next.title = last ? 'Close the tour' : 'Go to the next tip';
  place();
}

/* Takes the card down. Best effort: no storage means it shows again next time,
 * nothing worse. */
function close() {
  const { card, targets, opener } = open;
  open = null;
  card.remove();
  targets.forEach((node) => node.classList.remove('tour-target'));
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('click', onClick, true);
  window.removeEventListener('resize', place);
  if (opener && opener.isConnected && opener !== document.body && opener.focus) opener.focus();
}

/* Finished or skipped (Esc too): this tour, and only this one, is seen. */
function finish() {
  if (!open) return;
  const key = TOUR_KEYS[open.kind];
  close();
  if (flags) flags[key] = true;
  Promise.resolve().then(() => writeStored(key, true)).catch(() => {});
}

/* Don't show tours: every flag at once, and this card goes. */
function dismissAll() {
  if (open) close();
  const all = dismissAllFlags();
  flags = { ...(flags || {}), ...all };
  Object.entries(all).forEach(([key, value]) => {
    Promise.resolve().then(() => writeStored(key, value)).catch(() => {});
  });
}

function move(how) {
  if (!open) return;
  if (how === 'off') { dismissAll(); return; }
  const to = nextStep(open.index, how, open.steps.length);
  if (to === null) { finish(); return; }
  open.index = to;
  paint();
  open.card.querySelector('[data-move="next"]').focus();
}

/* Esc skips the tour on screen (and only that one), unless the help dialog is
 * open: that one is closed first. */
function onKey(ev) {
  if (ev.key !== 'Escape' || ev.defaultPrevented) return;
  if (document.querySelector('.help-overlay:not([hidden])')) return;
  /* Esc in a filter box clears the filter, and anywhere else outside the card
   * it belongs to whatever has the focus: neither ends the tour (and marks it
   * seen for good). */
  if (ev.target && ev.target.closest && ev.target.closest('input, textarea, select, [contenteditable]')) return;
  if (!open.card.contains(document.activeElement)) return;
  ev.preventDefault();
  finish();
}

/* The filter step of the panel tour follows the tab on screen: look again
 * after a tab is clicked, once the tab has switched. */
function onClick() {
  setTimeout(place, 0);
}

function start(kind, steps) {
  if (open || !steps.length) return;
  const card = buildCard(steps.length);
  card.addEventListener('click', (ev) => {
    const control = ev.target.closest('[data-move]');
    if (control) move(control.dataset.move);
  });
  document.body.appendChild(card);
  shownThisSession = true;
  open = { card, index: 0, kind, steps, opener: document.activeElement, targets: [] };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  window.addEventListener('resize', place);
  paint();
  card.querySelector('[data-move="next"]').focus();
}

export function startTour() {
  start('panel', tourSteps(isFreeBuild()));
}

/* The steps of a tab's tour whose control is on screen now: a step about a
 * control that is hidden (one moved into the … menu, say) would have nothing
 * to point at. */
function visibleSteps(tab) {
  return tabTourSteps(TAB_TOURS[tab]).filter((step) => {
    const node = document.querySelector(step.anchor);
    return node !== null && !node.closest('[hidden]');
  });
}

/* A tab was opened: its tour starts if it is due (see tabTourDue). */
function maybeStartTabTour(tab) {
  if (!flags) return;
  const due = tabTourDue({
    tab, flags,
    tourOpen: open !== null,
    dialogOpen: document.querySelector('.help-overlay:not([hidden])') !== null,
    shownThisSession
  });
  if (due) start(tab, visibleSteps(tab));
}

/* A tab's tour is about that tab's controls. Once another tab is on screen
 * its card would stand at the top left with nothing ringed, so it goes, and
 * without the seen flag: the tour is due again the next time that tab opens.
 * The panel tour is about the panel and follows the tab (its filter step). */
function closeStaleTabTour(tab) {
  if (open && open.kind !== 'panel' && open.kind !== tab) close();
}

/* Tabs are switched by clicks, keys and jumps from another tab alike, so what
 * is watched is the tab strip's selection. */
function watchTabs() {
  if (watching) return;
  const strip = document.querySelector('[role="tablist"]');
  if (!strip || typeof MutationObserver === 'undefined') return;
  watching = true;
  new MutationObserver(() => {
    closeStaleTabTour(currentTab());
    maybeStartTabTour(currentTab());
  }).observe(strip, {
    attributes: true, attributeFilter: ['aria-selected'], subtree: true
  });
}

/* "Take the tour" in a tab's Start here: that tab's tour, on demand. The tab
 * is switched to when another one is on screen. Other tours' seen flags are
 * not touched, and a tour already on screen goes first (without being marked
 * seen). Returns whether a tour started: false for a name that is no tab or a
 * tab with no tip whose control is on screen. */
export function startTabTour(tab) {
  if (!Object.prototype.hasOwnProperty.call(TAB_TOURS, tab)) return false;
  if (open) close();
  if (currentTab() !== tab) {
    const button = document.getElementById(`tab-${tab}`);
    if (!button) return false;
    button.click();
  }
  const steps = visibleSteps(tab);
  if (!steps.length) return false;
  start(tab, steps);
  return open !== null;
}

/* "Show the tour again": forget that any tour was seen, and start the panel
 * tour. */
export function restartTour() {
  /* A tour already on screen goes first (not seen: the flags are forgotten
   * anyway), or start() would return and nothing would show. */
  if (open) close();
  flags = {};
  ALL_TOUR_KEYS.forEach((key) => {
    Promise.resolve().then(() => removeStored(key)).catch(() => {});
  });
  startTour();
}

/* At boot: the flags are read; the panel tour starts when its flag says it was
 * not seen, otherwise the tour of the tab on screen if that one is due. Without
 * storage there would be no way to remember a tour was seen, so none starts. */
export async function mountTour() {
  try {
    const stored = await Promise.all(ALL_TOUR_KEYS.map((key) => readStored(key)));
    flags = Object.fromEntries(ALL_TOUR_KEYS.map((key, at) => [key, stored[at]]));
  } catch {
    return;
  }
  watchTabs();
  if (tourToShow(flags[TOUR_KEYS.panel])) startTour(); else maybeStartTabTour(currentTab());
}
