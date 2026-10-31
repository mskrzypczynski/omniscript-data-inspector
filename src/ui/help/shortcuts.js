'use strict';

/* [keys, what it does]. Rendered as a table of <kbd> keys in the help overlay;
 * keep in step with the keydown handler in mountShortcuts (panel-shell.js). */
import { Features } from '../features.js';

/* A row that ends in a gate name is shown only where that feature is. The
 * list is built when asked for, so it does not depend on whether a build
 * with gates had registered them when this module was imported. */
const ROWS = [
  [['/'], 'Focus the filter'],
  [['1', '2', '3'], 'Go to the first, second or third tab, in the order shown'],
  [['Alt', 'Shift', '←', '→'], 'On a tab: move it one place left or right (or drag it)'],
  [['n', 'p'], 'Next / previous marked change (Data, with Track changes on)', 'data.changes'],
  [['d'], 'Compare the selected call with the previous one to the same place (Calls)', 'calls.compare'],
  [['Shift', 'D'], 'Compare the selected call with the last successful one to the same place (Calls)', 'calls.compare'],
  [['b'], 'Make the focused call the baseline; press b again to clear (Calls)', 'calls.compare'],
  [['x'], 'Mark or unmark the focused call to add up its time (Calls)', 'calls.select'],
  [['c'], 'Copy the focused row (Data), the selected element (Structure) or the selected call (Calls)'],
  [['Ctrl', 'C'], 'Tree or Raw: copy the highlighted text, else the whole value (Cmd+C on a Mac)'],
  [['↑', '↓', 'j', 'k'], 'Move to the previous / next call (Calls) or element (Structure)'],
  [['Home', 'End', 'PageUp', 'PageDown'], 'Jump to the first / last call or element, or ten at a time'],
  [['←', '→'], 'Structure: → opens a section or enters it, ← folds it or leaves it'],
  [['←', '→'], 'On the tab strip: previous / next tab (Home and End for first and last)'],
  [['↑', '↓', '←', '→', 'Enter'], 'Data tree: ↑ ↓ move, → opens or enters, ← folds, Enter or Space toggles'],
  [['↑', '↓', 'Enter', 't'], 'Changes view: ↑ ↓ move, Enter shows values, t finds it in the tree', 'data.changes'],
  [['Alt', 'click'], 'Open or close a branch and everything inside it (Option-click on a Mac)'],
  [['Ctrl', '\\'], 'Focus mode (Structure and Calls): hide or show the list (Cmd+\\ on a Mac)'],
  [['Ctrl', '=', '-', '0'], 'Text size: larger, smaller, back to Medium (Cmd on a Mac)'],
  [[','], 'Open or close the settings'],
  [['Ctrl', 'Shift', 'L'], 'Open Compare JSON from anywhere in the panel (Cmd+Shift+L on a Mac)', 'shell.compare-json'],
  [['h'], 'Show or hide this help; on a focused control, open its entry'],
];

export const shortcuts = () => ROWS.filter(([, , gate]) => !gate || Features.has(gate));
