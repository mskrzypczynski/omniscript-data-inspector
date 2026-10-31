'use strict';

/* Which settings differ from their defaults. Pure: the UI hands in the current
 * values and the defaults, and gets back what to show. */

import { DESIGNER_MODE_LABELS } from './designer-link.js';
import { REFRESH_LABELS } from './refresh-rate.js';

/* Every setting the panel lets people change and "Restore default settings"
 * puts back, in the order the list shows them.
 * The views last chosen (Data's Tree, Form or Raw, Structure's value view and tabs,
 * the Calls tab) are here too, marked `kept`, though the dialog has no
 * row for them: they count as settings that differ only while Remember my
 * settings is keeping them (a view clicked in a session that remembers nothing
 * is a choice of what to look at, not a setting), and Restore default settings
 * puts them back either way. Data's Sizes and Changes never differ.
 * Mask values is the session's switch: while it equals what Mask values at start says
 * it is that one choice, listed once (`sameAs`), not twice.
 * Track changes is not here: like the Raw view it is a way of looking, so it
 * not count on the gear.
 */
const VIEW_WORDS = Object.freeze({ tree: 'Tree', raw: 'Raw', form: 'Form' });
/* The names the tabs print on their buttons, not the ids that are stored. */
const STRUCT_TAB_WORDS = Object.freeze({
  value: 'Current value', options: 'Options', props: 'Properties', conditions: 'Visibility', validation: 'Validation', calls: 'Calls'
});
const LOG_TAB_WORDS = Object.freeze({ input: 'Input', output: 'Output', options: 'Options' });

export const SETTING_SPECS = Object.freeze([
  { key: 'tabOrder', label: 'Tab order' },
  { key: 'showNested', label: 'Embedded scripts' },
  { key: 'showFrameRow', label: 'Show the Frame row' },
  { key: 'mask', label: 'Mask values', sameAs: 'maskAtStart' },
  { key: 'maskAtStart', label: 'Mask values at start' },
  { key: 'dataLive', label: 'Auto-refresh' },
  { key: 'refreshRate', label: 'Refresh rate', words: REFRESH_LABELS },
  { key: 'dataView', label: 'Data view', kept: true, words: VIEW_WORDS },
  { key: 'dataProp', label: 'Data property' },
  { key: 'defProp', label: 'Definition property' },
  { key: 'structFollow', label: 'Follow current step' },
  { key: 'structAutoCollapse', label: 'Collapse done steps' },
  { key: 'structHover', label: 'Highlight on hover' },
  { key: 'structVisibleOnly', label: 'Visible only' },
  { key: 'structValueView', label: 'Current value view', kept: true, words: VIEW_WORDS },
  { key: 'structDetailTab', label: 'Structure detail tab', kept: true, words: STRUCT_TAB_WORDS },
  { key: 'structShowInternal', label: 'Show internal properties', kept: true },
  { key: 'designerMode', label: 'Open in Designer', words: DESIGNER_MODE_LABELS },
  { key: 'designerNs', label: 'Designer namespace' },
  { key: 'logShowAll', label: 'All Apex calls' },
  { key: 'clearOnReload', label: 'Clear on reload' },
  { key: 'logDetailTab', label: 'Call detail tab', kept: true, words: LOG_TAB_WORDS },
  { key: 'logErrorsOnly', label: 'Failed only' },
  { key: 'logSlowMs', label: 'Slow call threshold (ms)' },
  { key: 'timeFormat', label: 'Time format' },
  { key: 'allowTestCalls', label: 'Allow test calls' },
  { key: 'textSize', label: 'Text size' }
]);

/* The settings behind the fold "Reading another page" in the dialog: the two
 * property names and the Frame row. The fold opens by itself while any of them
 * differs from its default, so a changed one is never hidden. */
export const READING_KEYS = Object.freeze(['dataProp', 'defProp', 'showFrameRow']);

export function readingDiffers(current, defaults, specs = SETTING_SPECS) {
  return customSettings(current, defaults, specs).some((row) => READING_KEYS.includes(row.key));
}

/* Property names are trimmed on commit, and an empty one means the default. */
function normalize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

/* Is a property-name field holding something other than its default? Used to
 * keep a property-name field on screen while it matters. */
export function isCustomProperty(value, fallback) {
  const text = normalize(value);
  return typeof text === 'string' && text !== '' && text !== fallback;
}

/* words: what a stored value is called on the control that sets it, when that
 * is not the stored text itself (Settings' buttons say "Designer (managed)",
 * the stored value is "managed"). */
export function formatSettingValue(value, words) {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string') return value === '' ? '(default)' : (words && words[value]) || value;
  return String(value);
}

/* Does a kept view (see SETTING_SPECS) differ from its default? Such a view is
 * no row and no count without Remember my settings, but Restore default
 * settings still has something to put back. */
export function keptViewsDiffer(current, defaults, specs = SETTING_SPECS) {
  const kept = new Set(specs.filter((spec) => spec.kept).map((spec) => spec.key));
  return customSettings(current, defaults, specs, { remembered: true }).some((row) => kept.has(row.key));
}

/* One row per setting whose current value differs from its default. A setting
 * missing from `current` is not known, so it is not reported. `remembered`:
 * Remember my settings is on, so the views it keeps are settings too. */
export function customSettings(current, defaults, specs = SETTING_SPECS, { remembered = false } = {}) {
  const rows = [];
  specs.forEach(({ key, label, words, kept, sameAs }) => {
    if (kept && !remembered) return;
    if (!(key in current)) return;
    let now = normalize(current[key]);
    const base = normalize(defaults[key]);
    if (typeof base === 'string' && now === '') now = base;
    if (now === base) return;
    if (sameAs && sameAs in current && now === normalize(current[sameAs])) return;
    rows.push({
      key, label,
      current: formatSettingValue(now, words),
      default: formatSettingValue(base, words)
    });
  });
  return rows;
}
