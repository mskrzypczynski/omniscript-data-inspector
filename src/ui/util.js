'use strict';

/* Small helpers several tabs need. DOM-touching, so they live here and not in
 * core/. */

import { icon, getLabel, setLabel } from './icons.js';

/* Delays fn until ms after the last call; each call restarts the wait. */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* Shows text on a button for a moment, then puts its label back (only the
 * label: a button's icon stays). Flashing
 * again while a flash is showing keeps the original label, not the flash. The
 * button holds the width it had, so "Copy JSON" turning into "Copied" does not
 * move the buttons beside it. */
const flashes = new WeakMap();

export function flashText(button, text, ms = 1200) {
  const running = flashes.get(button);
  const original = running ? running.original : getLabel(button);
  const held = running ? running.held : (button.getBoundingClientRect ? button.getBoundingClientRect().width : 0);
  if (running) clearTimeout(running.timer);
  if (held > 0 && button.style) button.style.minWidth = `${held}px`;
  setLabel(button, text);
  const timer = setTimeout(() => {
    flashes.delete(button);
    if (button.style) button.style.minWidth = '';
    setLabel(button, original);
  }, ms);
  flashes.set(button, { original, timer, held });
}

/* Marks an icon-only button as done for a moment: the icon swaps for a check
 * and the button gets .is-done. Nothing is written as text. */
const dones = new WeakMap();

export function flashDone(button, ms = 1200) {
  const running = dones.get(button);
  if (running) clearTimeout(running.timer);
  const original = running ? running.original : button.querySelector('.ui-icon');
  const mark = icon('check');
  if (original && original.parentNode === button) original.replaceWith(mark); else button.prepend(mark);
  button.classList.add('is-done');
  const timer = setTimeout(() => {
    dones.delete(button);
    button.classList.remove('is-done');
    if (original) mark.replaceWith(original); else mark.remove();
  }, ms);
  dones.set(button, { original, timer });
}

/* Hands text to the user as a file download. */
export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* A self-rescheduling timer for reads that must not overlap: the next tick is
 * set only once the task calls done, and only while canRun() holds.
 *   ms may be a function returning the period.
 *   start()  schedule the next tick (replacing any pending one)
 *   stop()   cancel the pending tick
 *   now()    run the task at once, whatever canRun says; the tick after it is
 *            scheduled as usual */
export function createPoller({ ms, canRun, task }) {
  const delay = () => (typeof ms === 'function' ? ms() : ms); // a function lets the period change between ticks
  let timer = null;

  function start() {
    clearTimeout(timer);
    if (!canRun()) return;
    timer = setTimeout(now, delay());
  }

  function stop() {
    clearTimeout(timer);
  }

  function now() {
    clearTimeout(timer);
    task(start);
  }

  return { start, stop, now };
}
