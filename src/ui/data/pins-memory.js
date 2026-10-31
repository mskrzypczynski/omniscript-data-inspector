'use strict';

/* The watch list between DevTools sessions. Only while Remember my settings is
 * on, the watched paths, the typed expressions and their bells are written to
 * extension storage under `pins`, keyed by the script's Type/SubType/Language,
 * and put back when that script is selected. What is stored is names from the
 * script (and positions of repeat rows), never values. What is valid, and how
 * many are kept, is decided in core/data/pins-store.js. */

import { PINS_KEY, pinsKey, pinsToWrite, pinsToRestore } from '../../core/data/pins-store.js';
import { isGonePin } from '../../core/data/pin-follow.js';
import { expressionId } from '../../core/data/watch-expr.js';
import { Settings } from '../settings.js';
import { readStored, writeStored, removeStored } from '../stored.js';
import { Targets } from '../targets.js';
import { forgetWatchStrip } from './watch-strip.js';
import { Features } from '../features.js';

/* state: the tab's. render(): a full redraw. clear(): empties the watch list
 * (called when the script changes, before the kept one is put back). */
export function createPinsMemory({ state, render, clear }) {
  let loadedKey = ''; // the script the lists in `state` belong to
  let queue = Promise.resolve(); // writes go one after the other: each reads what the last wrote
  /* Free has no watch list, so it neither reads nor writes what a build with one kept: a write
   * of its empty list would delete it. */
  const remembering = () => Features.has('data.watch') && Settings.get('rememberSettings') === true;

  /* A pin whose row was removed means nothing after a reload: not kept. */
  const snapshot = () => ({
    paths: state.pins.filter((path) => !isGonePin(path)),
    expressions: state.exprs,
    notify: [...[...state.notify].filter((path) => !isGonePin(path)), ...[...state.exprNotify].map(expressionId)]
  });

  /* Write the watch list of the current script (a no-op unless remembering). */
  function save() {
    const key = loadedKey;
    if (!key || !remembering()) return;
    const list = snapshot();
    queue = queue.then(async () => {
      if (!remembering()) return; // switched off while waiting: nothing may reappear
      const next = pinsToWrite(await readStored(PINS_KEY), key, list);
      if (Object.keys(next).length) await writeStored(PINS_KEY, next); else await removeStored(PINS_KEY);
    }).catch(() => {}); // best effort: a storage error must not break the tab
  }

  /* Put back what was kept for the script now selected. Nothing is put over a
   * list the user has already started on. */
  async function restore(key) {
    let stored;
    try { stored = await readStored(PINS_KEY); } catch { return; }
    if (key !== loadedKey || !remembering() || state.pins.length || state.exprs.length) return;
    const { paths, expressions, notify } = pinsToRestore(stored, key);
    if (!paths.length && !expressions.length) return;
    state.pins = paths;
    state.exprs = expressions;
    state.notify = new Set(notify.filter((item) => paths.includes(item)));
    state.exprNotify = new Set(expressions.filter((text) => notify.includes(expressionId(text))));
    state.watchPrev = {}; // restored values are not a change
    forgetWatchStrip(state);
    if (state.active) render();
  }

  /* After the top bar changed. A different script (or a pick, which clears
   * the lists, so `forced`) starts from what is kept for it. A page that
   * navigated to another script keeps no pin of the previous one: left in, they
   * would block the restore and then be saved under the new script's key.
   * Returns whether the script changed. */
  function sync(forced) {
    const key = pinsKey(Targets.selected());
    const changed = key !== loadedKey;
    if (!changed && !forced) return false;
    if (changed) clear();
    loadedKey = key;
    if (key && remembering()) restore(key);
    return changed;
  }

  /* Remember my settings ticked while something is watched keeps it from now
   * on; unticked, settings.js has already deleted the entry. */
  let wasRemembering = remembering();
  Settings.onChange(() => {
    const now = remembering();
    if (now && !wasRemembering) save();
    wasRemembering = now;
  });

  return { save, sync };
}
