'use strict';

/* What the Structure toolbar's two menus hold and say: the View menu (the
 * switches that narrow or dress the list) and the More menu (the deeper-dive
 * views and files). Only decisions live here; src/ui/structure/toolbar-menus.js
 * draws them. A switch that a build does not have (its gate is closed) is not
 * listed, so it can neither be on nor count. */

/* Every View switch, in menu order. `gate` names the gate that opens it,
 * or is null for a switch both builds have. All of them start off. */
const VIEW_OPTIONS = [
  {
    key: 'actionsOnly', label: 'Actions only', gate: 'structure.references',
    title: 'Show only the elements that call a Data Mapper, an Integration Procedure or another action'
  },
  {
    key: 'autoCollapse', label: 'Collapse done steps', gate: 'structure.steps',
    title: 'Fold each step once the script has passed it, so the area you are working in stays in view. Opens again if the script returns to it'
  },
  {
    key: 'hover', label: 'Highlight on hover', gate: null,
    title: 'Outline the hovered element\'s component on the inspected page (best effort: needs the element\'s lwcId from the definition)'
  },
  {
    key: 'visibleOnly', label: 'Visible only', gate: null,
    title: 'Hide elements that are not shown right now: their show rules are false, or a parent is hidden'
  }
];

/* The switches this build has, with their state: [{ key, label, title, checked }].
 * has(gate) says whether a gate is open; values maps a key to on / off. */
export function viewOptions(has, values) {
  return VIEW_OPTIONS
    .filter((option) => !option.gate || has(option.gate))
    .map(({ key, label, title }) => ({ key, label, title, checked: values[key] === true }));
}

/* How many switches are on (all start off), so a filtered list is never a surprise. */
export function viewCount(options) {
  return options.filter((option) => option.checked).length;
}

/* The View button's tooltip: what it holds in this build, and how many are on. */
export function viewButtonTitle(options) {
  const count = viewCount(options);
  const base = `Switches that change which elements the list shows and how it behaves: ${listWords(options.map((option) => option.label))}`;
  if (!count) return base;
  return `${base}. ${count} ${count === 1 ? 'switch is' : 'switches are'} on`;
}

const listWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/* Which entries the More menu has in this build, in order: 'timeline',
 * 'compare', 'export'. Empty means no button is drawn. */
export function moreEntries(has) {
  const entries = [];
  if (has('structure.timeline')) entries.push('timeline');
  if (has('structure.compare-definition')) entries.push('compare');
  if (has('structure.export')) entries.push('export');
  return entries;
}

/* Follow current step keeps its label whatever happens, so the toolbar never
 * reflows; the paused state is said in its tooltip and to assistive
 * technology with this sentence. '' while it is following. */
export const FOLLOW_PAUSED_NOTE = 'Follow current step is paused while you browse';

export function followNote(paused) {
  return paused ? FOLLOW_PAUSED_NOTE : '';
}
