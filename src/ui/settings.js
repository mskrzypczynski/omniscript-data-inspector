'use strict';

/* Settings live in memory and last until DevTools is closed. Exceptions, all
 * in extension storage through stored.js: the tab order (tab-order.js; the
 * tours' yes-or-no flags, tour.js, are kept the same way), the Mask values at start
 * flag (on its own entry, with Remember my settings on or off), and, only while
 * "Remember my settings" is on, the settings themselves
 * (core/shared/remembered-settings.js decides which).
 *
 * Mask values, filter and search text, watch pins, captured calls and payloads
 * are not settings here: modules hold them themselves. */

import { formatOrder, DEFAULT_ORDER } from '../core/shared/tab-order.js';
import {
  REMEMBER_KEY, REMEMBERED_EXTRA_KEYS, REMEMBER_ALLOWED, rememberedToWrite, rememberedToRestore, needsMigration, isRemembering,
  maskAtStartToStore, maskAtStartToRestore
} from '../core/shared/remembered-settings.js';
import { readStored, writeStored, removeStored, MASK_AT_START_KEY } from './stored.js';

/* The one place defaults are written down. Anything not set (or of the wrong
 * type) falls back to these. */
export const DEFAULTS = Object.freeze({
  rememberSettings: true, // on by default: keep the settings between DevTools sessions; unticking it deletes them
  tabOrder: formatOrder(DEFAULT_ORDER),
  showNested: false,
  showFrameRow: false, // the top bar's second row (Frame, Embedded scripts)
  maskAtStart: false, // turn the Mask values switch on each time the panel opens; kept on its own entry, with Remember my settings on or off (the switch itself is never stored)
  // Data
  dataView: 'tree', // the view last chosen, Tree, Form or Raw (Sizes and Changes are not kept)
  dataProp: 'jsonDataStr',
  refreshRate: 'normal', // fast, normal or gentle: how often the Data tab reads while Auto-refresh is on
  dataChanges: false,
  // Structure
  defProp: 'jsonDef',
  structFollow: true,
  structAutoCollapse: false,
  structHover: false,
  structVisibleOnly: false,
  // The views last chosen: kept with Remember my settings, no row in the dialog ('' is none picked)
  structValueView: 'form',
  structDetailTab: '',
  structShowInternal: false,
  // Open in Designer (top bar): auto, native or managed, and the managed namespace
  designerMode: 'auto',
  designerNs: '',
  // Calls
  logDetailTab: '', // the detail tab last picked by hand: input, output or options
  clearOnReload: false, // empty the list of calls when the page reloads (off: the log is kept)
  logShowAll: false, // list every Apex call the page makes (off: only OmniStudio's)
  logErrorsOnly: false,
  logSlowMs: 0,
  timeFormat: 'ms', // 'ms' or 'human' (seconds and minutes)
  allowTestCalls: false, // may the panel send a call the user composes (Calls, Test call)
  testCallsAck: false, // the notice about what a test call can do was accepted (I understand)
  // Everywhere
  textSize: 'M' // S, M, L or XL: a zoom on the whole panel
});

/* Switches that modules hold themselves but that "Restore default settings" also puts
 * back. Kept beside DEFAULTS so there is still one place defaults are written. */
export const SESSION_DEFAULTS = Object.freeze({
  mask: false,
  dataLive: true
});

/* Survives a reset: the choice to remember settings at all. */
const KEEP_ON_RESET = ['rememberSettings'];

let values = {};

const providers = []; // each returns the current value of the settings its module owns
const resetters = []; // each re-reads Settings and syncs its controls and state
const watchers = []; // told after anything that may change the list of custom settings

/* One listener failing must not leave the rest of the panel half reset. */
function callAll(list, ...args) {
  list.forEach((fn) => {
    try { fn(...args); } catch (error) { console.error('Settings listener failed', error); }
  });
}

/* Writes the values in force to extension storage, or removes them (and every
 * entry a tab keeps only while remembering is on) when remembering is off.
 * Best effort: a storage error must not break a setting. */
function persist() {
  const body = rememberedToWrite(values, DEFAULTS, REMEMBER_ALLOWED);
  /* Off: everything kept is deleted, and only the choice itself is written
   * (it is on by default, so "off" is what has to survive a restart). */
  const done = remembering()
    ? writeStored(REMEMBER_KEY, body)
    : Promise.all([
      ...REMEMBERED_EXTRA_KEYS.map((key) => Promise.resolve(removeStored(key))),
      writeStored(REMEMBER_KEY, body)
    ]);
  Promise.resolve(done).catch(() => {});
}

/* Is Remember my settings on? Not set yet means the default, which is on. */
const remembering = () => isRemembering(values, DEFAULTS);

/* Mask values at start is stored by itself: written when ticked, deleted otherwise,
 * whatever Remember my settings says. Best effort, like persist(). */
function persistMaskAtStart() {
  const flag = maskAtStartToStore(values.maskAtStart);
  const done = flag === null ? removeStored(MASK_AT_START_KEY) : writeStored(MASK_AT_START_KEY, flag);
  Promise.resolve(done).catch(() => {});
}

export const Settings = {
  /* The value set, or fallback (default: the built-in default) when it is
   * missing or not the same type as the default. */
  get(name, fallback = DEFAULTS[name]) {
    const stored = values[name];
    if (stored === undefined || stored === null) return fallback;
    if (fallback !== undefined && typeof stored !== typeof fallback) return fallback;
    return stored;
  },

  set(name, value) {
    values[name] = value;
    if (remembering() || name === 'rememberSettings') persist();
    if (name === 'maskAtStart') persistMaskAtStart();
    callAll(watchers);
  },

  /* Boot, before the tabs mount: puts back what was remembered. Resolves
   * whether or not there was anything (or storage at all). */
  async restore() {
    try {
      const stored = await readStored(REMEMBER_KEY);
      Object.assign(values, rememberedToRestore(stored, DEFAULTS, REMEMBER_ALLOWED));
      // An old name was read once: write what is kept back without it.
      if (needsMigration(stored) && remembering()) persist();
    } catch { /* no storage here: start from the defaults */ }
    try {
      if (maskAtStartToRestore(await readStored(MASK_AT_START_KEY))) values.maskAtStart = true;
    } catch { /* no storage here: Mask values at start is off */ }
  },

  /* ---- restoring defaults ---- */

  /* Modules register what they own: provide(() => ({key: currentValue})) says
   * what is in force right now, onReset(scope => ...) puts things back. Scope
   * is a setting name for a single reset and undefined for all of them; a
   * module re-reads Settings.get() for the keys in scope, so defaults are
   * never repeated outside DEFAULTS / SESSION_DEFAULTS. */
  provide: (fn) => providers.push(fn),
  onReset: (fn) => resetters.push(fn),
  onChange: (fn) => watchers.push(fn),
  notify: () => callAll(watchers),

  /* Everything in force right now, for the list of custom settings. */
  current: () => Object.assign({}, ...providers.map((fn) => fn())),
  defaults: () => ({ ...DEFAULTS, ...SESSION_DEFAULTS }),
  inScope: (scope, name) => scope === undefined || scope === name,

  /* Restore every setting, live. Values are cut down to the kept keys first so
   * listeners read defaults for everything else; they are cut down again
   * afterwards because switching a control off writes its value back. */
  reset() {
    const keep = () => {
      const kept = {};
      KEEP_ON_RESET.forEach((name) => { if (name in values) kept[name] = values[name]; });
      values = kept;
    };
    keep();
    callAll(resetters, undefined);
    keep();
    if (remembering()) persist();
    persistMaskAtStart();
    callAll(watchers);
  },

  /* Put several settings in force at once from code (a control that sets several): the
   * values are stored, then each module that owns one re-reads it, as it does
   * after a reset of that one setting. */
  apply(changes) {
    Object.assign(values, changes);
    Object.keys(changes).forEach((name) => callAll(resetters, name));
    if (remembering()) persist();
    if ('maskAtStart' in changes) persistMaskAtStart();
    callAll(watchers);
  },

  /* Restore one setting, live. */
  resetKey(name) {
    delete values[name];
    callAll(resetters, name);
    if (remembering()) persist();
    if (name === 'maskAtStart') persistMaskAtStart();
    callAll(watchers);
  }
};
