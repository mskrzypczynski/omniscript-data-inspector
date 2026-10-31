'use strict';

/* Which tabs the Structure detail pane offers for an element, in what order,
 * with what label, and why one is greyed out. The pane only draws what this
 * says.
 *
 * Pure: no DOM, no chrome.*. */

/* The label of a step's Validation tab: the count of what may stop Next rides
 * along while it is above zero. */
export function validationLabel(count) {
  return count ? `Validation (${count})` : 'Validation';
}

/* [{ id, label, icon, enabled, hint }], in the order they are shown. A tab that
 * does not apply to the element is left out, not greyed: Current value while
 * the data holds none, Properties without properties, Visibility without a rule
 * that nothing else uses (or links to show), Validation on an
 * element with none (a step's: while nothing can stop Next and it holds no
 * custom component), Calls on an element that calls nothing, or whose calls
 * were not captured and whose wiring says nothing. Every tab returned is
 * usable (`enabled` is always true).
 * Value (or Set Values) · Options · Properties · Visibility · Validation ·
 * Calls · JSON. JSON is last: it is the raw source, for when the readable
 * tabs are not enough. A step's Validation tab is "what may stop Next".
 *   element   — the selected element
 *   value     — its current value in the data (undefined when none)
 *   callsCount — what the Calls tab would list
 *   stopCount, customCount — for a step: how many things may stop Next, and how
 *                 many custom components it holds (its Validation tab)
 *   wired — the action says what it sends and where the answer lands, which
 *                 the Calls tab shows even before a call was captured
 *   estimatedCount — for a step: findings that rest on a formula's estimate;
 *                 they keep the tab but are not in the count
 *   usedByCount — how many elements' rules use this element
 *   linkCount — how many names the Visibility tab lists for the
 *                 element (what it depends on, what uses it, what writes it)
 *   propsCount — how many properties the element has (the Properties tab)
 *   optionsCount — how many options the element lists itself (the Options tab)
 *   formula — the element is a Formula one: its Current value tab opens on the
 *                 Formula card even while the data holds no value */
export function detailTabs({
  element, value, callsCount = 0, stopCount = 0, customCount = 0, estimatedCount = 0, usedByCount = 0, propsCount = 0,
  wired = false, linkCount = 0, optionsCount = 0, formula = false
}) {
  const isStep = element.category.key === 'step';
  const tabs = [];

  if (element.isSetValues) {
    if (element.setValues) tabs.push({ id: 'value', label: 'Set Values', icon: 'value', enabled: true });
  } else if (value !== undefined || formula) {
    tabs.push({ id: 'value', label: 'Current value', icon: 'value', enabled: true });
  }

  if (optionsCount > 0) tabs.push({ id: 'options', label: 'Options', icon: 'options', enabled: true });

  if (propsCount > 0) tabs.push({ id: 'props', label: 'Properties', icon: 'props', enabled: true });

  if (element.conditional || usedByCount > 0 || linkCount > 0) {
    tabs.push({ id: 'conditions', label: 'Visibility', icon: 'rules', enabled: true });
  }

  if (isStep) {
    if (stopCount > 0 || customCount > 0 || estimatedCount > 0) {
      tabs.push({
        id: 'validation', label: validationLabel(stopCount), icon: 'validation', enabled: true,
        hint: 'What may stop Next on this step, judged against the data right now'
      });
    }
  } else if (element.validation && element.validation.has) {
    tabs.push({ id: 'validation', label: 'Validation', icon: 'validation', enabled: true });
  }
  if (element.remote && (callsCount > 0 || wired)) {
    tabs.push({ id: 'calls', label: callsCount ? `Calls (${callsCount})` : 'Calls', icon: 'calls', enabled: true });
  }

  tabs.push({ id: 'definition', label: 'JSON', icon: 'definition', enabled: true });
  return tabs;
}

/* The tab's name when the pane is narrow: the same word as the full name, cut
 * short, with the count its full label carries ("Validation (1)" -> "Valid. (1)").
 * One table, so a full name and its short form cannot drift apart; the full name
 * is the button's tooltip (tabTitle). */
export const SHORT_TAB_NAMES = {
  value: 'Value', options: 'Opts.', props: 'Props', conditions: 'Visib.', validation: 'Valid.', calls: 'Calls', definition: 'JSON'
};

export function shortTabLabel(tab) {
  const count = /\((\d+)\)\s*$/.exec(tab.label || '');
  return `${SHORT_TAB_NAMES[tab.id] || tab.label}${count ? ` (${count[1]})` : ''}`;
}

/* The tab button's tooltip: its full name, then what it holds when the tab says. */
export function tabTitle(tab) {
  return tab.hint ? `${tab.label}\n${tab.hint}` : tab.label;
}

/* The tab an element opens on when nobody asked for one, from the tabs it has:
 * Current value (when it has a value; Validation first for the step the script
 * is on, while something may stop Next; also a Set Errors or Messaging element), Visibility (when the element has a rule of its own), then
 * Properties, then whatever else there is. JSON is the raw source and is
 * not a default: only a hand pick shows it, except for an element that has no
 * other tab at all, where it is the only thing to show. */
export function defaultTab(tabs, { isCurrentStep = false, conditional = false, ownsValidation = false } = {}) {
  const has = (id) => tabs.some((tab) => tab.id === id && tab.enabled);
  /* The step the script is on has a value too (everything inside it), but what may
   * stop Next is what its reader came for, so Validation comes first there; so it does
   * for a Set Errors or Messaging element, whose show rule is only its trigger. */
  if ((isCurrentStep || ownsValidation) && has('validation')) return 'validation';
  if (has('value')) return 'value';
  if (conditional && has('conditions')) return 'conditions';
  if (has('props')) return 'props';
  return ['validation', 'conditions', 'calls'].find(has) || 'definition';
}

/* Is the tab one the pane may show right now? Otherwise the default one
 * (`context`: { isCurrentStep, conditional, ownsValidation } of the element).
 * `wanted` is the hand pick, which is kept on its own: an element that lacks it
 * shows its default for now, and the pick is still there for the next element
 * that has the tab. */
export function usableTab(tabs, wanted, context) {
  if (tabs.some((tab) => tab.id === wanted && tab.enabled)) return wanted;
  return defaultTab(tabs, context);
}

/* What a hand pick becomes when another element is selected: it stays, except
 * Definition, which is the raw source and is for the element it was made on. */
export function pickAfterSelection(picked) {
  return picked === 'definition' ? null : (picked || null);
}
