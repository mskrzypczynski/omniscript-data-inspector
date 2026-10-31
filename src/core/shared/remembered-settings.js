'use strict';

/* "Remember my settings" (on by default): which of the panel's settings are
 * written to extension storage, and what is accepted back from it. Only the
 * switches and views that Settings holds (including the views last chosen,
 * remembered-views.js); never data, filters that hide rows, the property names
 * (Data property, Definition property), captured calls or history, and not
 * Mask values or Allow test calls (they start off every time, on purpose). The tab order has its own stored entry,
 * and so has Mask values at start (below), which is kept whether or not this is on.
 *
 * Pure: the caller hands in the values and the defaults. */

import { DESIGNER_MODES } from './designer-link.js';
import { REFRESH_RATES } from './refresh-rate.js';
import { VIEW_CHOICES } from './remembered-views.js';
import { TEXT_SIZES } from './text-size.js';
import { TIME_FORMATS } from './time-format.js';

export const REMEMBER_KEY = 'settings';

/* Other stored entries that exist only while remembering is on (each written
 * by its own tab, keyed by script): all of them go when the switch goes off.
 * A tab that adds one lists it here, so the switch stays the one place that
 * decides what is kept. */
export const REMEMBERED_EXTRA_KEYS = ['pins'];

/* Settings that are never written to storage even when remembering is on.
 * Allow test calls and its acknowledgement are among them: a setting that lets
 * the panel send into an org must be a fresh choice at every DevTools start,
 * not one carried from yesterday's sandbox into today's production. So are the
 * filters that hide rows (Failed only, Visible only) and the two property names
 * (Data property, Definition property): carried over, they would make a list
 * look short or a page look empty with nothing on screen to say why. They stay
 * changeable in the session and still count under Settings that differ.
 * (Structure's Actions only is not a setting at all: the tab holds it.) */
export const NOT_REMEMBERED = Object.freeze([
  'tabOrder', 'maskAtStart', 'mask', 'dataLive', 'allowTestCalls', 'testCallsAck',
  'logErrorsOnly', 'structVisibleOnly', 'dataProp', 'defProp'
]);

/* Mask values at start is a flag of its own, stored like the tab order and the tour
 * flags, with Remember my settings on or off: a safety choice that is kept only
 * under another opt-in would silently do nothing in the default configuration.
 * Ticked, the flag is written; unticked (or restored to its default) the entry
 * is deleted, so nothing is stored for the default. */
export const maskAtStartToStore = (value) => (value === true ? true : null);
export const maskAtStartToRestore = (stored) => stored === true;

/* The values a setting with a fixed set of choices may have: a stored value
 * outside its list (an old version's, or one edited by hand) is dropped, so
 * the default stays in force rather than a view that does not exist. */
export const REMEMBER_ALLOWED = Object.freeze({
  ...VIEW_CHOICES,
  refreshRate: REFRESH_RATES,
  timeFormat: TIME_FORMATS,
  textSize: TEXT_SIZES,
  designerMode: DESIGNER_MODES
});

const known = (defaults, name) => Object.prototype.hasOwnProperty.call(defaults, name) && !NOT_REMEMBERED.includes(name);

/* Only names in `defaults`, each with a value of the default's type, and,
 * for a name in `allowed` (a map from name to its list of choices), one of
 * those choices, so a stored object from another version (or edited by hand)
 * cannot inject anything else. A new object; the input is not changed. */
export function pickRemembered(values, defaults, allowed = {}) {
  const picked = {};
  if (!values || typeof values !== 'object') return picked;
  Object.keys(values).forEach((name) => {
    if (!known(defaults, name)) return;
    const value = values[name];
    if (value === undefined || value === null) return;
    if (typeof value !== typeof defaults[name]) return;
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    if (Array.isArray(allowed[name]) && !allowed[name].includes(value)) return;
    picked[name] = value;
  });
  return picked;
}

/* Is the switch on? A value that was never set is the default, which is on. */
export function isRemembering(values, defaults) {
  const set = values && typeof values.rememberSettings === 'boolean' ? values.rememberSettings : defaults.rememberSettings;
  return set === true;
}

/* What to write for the settings in force. With the switch on, the remembered
 * settings (the switch included, so the stored object always says so). With it
 * off, only the switch itself, as false: since it is on by default, a stored
 * "off" is the one thing that has to survive, and nothing else is kept. */
export function rememberedToWrite(values, defaults, allowed = {}) {
  if (!isRemembering(values, defaults)) return { rememberSettings: false };
  return pickRemembered({ ...values, rememberSettings: true }, defaults, allowed);
}

/* Settings that were renamed or turned round between versions, read once from
 * what an earlier version stored: "Preserve on reload" (logPreserve, on by
 * default) became "Clear on reload" (clearOnReload, off by default), so an
 * old false is a new true; "OmniStudio only" (logOnlyOmni, on by default)
 * became "All Apex calls" (logShowAll, off by default), so an old false is a new
 * true. An old key is dropped, and never overrides a value already stored
 * under the new name. A new object; the input is not changed, and a value of
 * another type is dropped without effect. */
const TURNED_ROUND = Object.freeze([
  { old: 'logPreserve', now: 'clearOnReload' },
  { old: 'logOnlyOmni', now: 'logShowAll' }
]);

export function migrateSettings(stored) {
  if (!needsMigration(stored)) return stored;
  const next = { ...stored };
  TURNED_ROUND.forEach(({ old, now }) => {
    if (!(old in next)) return;
    if (typeof next[old] === 'boolean' && typeof next[now] !== 'boolean') next[now] = !next[old];
    delete next[old];
  });
  return next;
}

/* Whether the stored object holds a setting under a name migrateSettings
 * drops, so the caller can write it back migrated. */
export function needsMigration(stored) {
  return !!stored && typeof stored === 'object' && !Array.isArray(stored)
    && TURNED_ROUND.some(({ old }) => old in stored);
}

/* What to put back at boot. Remembered values only count when the stored
 * object says the switch was on. One that says it was turned off puts back
 * just that (the default is on); one that says nothing puts back nothing. */
export function rememberedToRestore(stored, defaults, allowed = {}) {
  const picked = pickRemembered(migrateSettings(stored), defaults, allowed);
  if (picked.rememberSettings === false) return { rememberSettings: false };
  return picked.rememberSettings === true ? picked : {};
}
