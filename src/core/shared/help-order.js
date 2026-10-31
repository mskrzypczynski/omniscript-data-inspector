'use strict';

/* The order of a tab's help entries: the ones about a control come first, in
 * the order the controls stand on screen (so the first thing the help says is
 * about the first button), the explanations that have no control of their own
 * follow in their written order, and the entries about rarely used controls
 * (flagged `advanced: true`) come last, since they are not on the first screen.
 *
 * Pure: no DOM, no chrome.*. */

/* entries: [[title, text]]. controls: [{ help, advanced }] in the order they
 * appear on screen, where `help` is the control's data-help (the entry title,
 * any case). A control that shows up twice counts at its first place, and as
 * Advanced only when every one of its places is. Returns a new list. */
export function orderEntriesByControls(entries, controls) {
  const list = Array.isArray(entries) ? entries : [];
  const places = new Map();
  (Array.isArray(controls) ? controls : []).forEach((control, rank) => {
    const key = String(control.help || '').trim().toLowerCase();
    if (!key) return;
    const seen = places.get(key);
    if (!seen) places.set(key, { rank, advanced: !!control.advanced });
    else if (!control.advanced) seen.advanced = false;
  });

  const keyOf = (entry) => String(entry[0]).trim().toLowerCase();
  const placed = list.map((entry, at) => ({ entry, at, place: places.get(keyOf(entry)) }));
  const byRank = (a, b) => a.place.rank - b.place.rank || a.at - b.at;
  const near = placed.filter((item) => item.place && !item.place.advanced).sort(byRank);
  const loose = placed.filter((item) => !item.place);
  const advanced = placed.filter((item) => item.place && item.place.advanced).sort(byRank);
  return [...near, ...loose, ...advanced].map((item) => item.entry);
}
