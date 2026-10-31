'use strict';

/* "Start here": the five things to try first on each tab, shown at the top of
 * its help before the reference entries. Kept short on purpose; the entries
 * below explain each one. Keep these in step with what the tab does. */

import { Features } from '../features.js';

export const START = {
  /* Getters, so a line about a gated feature is left out whenever its gate is
   * closed, whatever order the modules loaded in. */
  get data() {
    return [
      'Pick your OmniScript in the top bar (press [[Rescan]] if the list is empty). Its data appears as a tree.',
      'Use the page: changed values flash amber, and [[Auto-refresh]] keeps the tree live.',
      'Type in the filter to narrow the tree. A path such as Step:Rows|2:Field or key=value works too.',
      Features.has('data.watch')
        ? 'Hover a row for its buttons (copy, watch, show in Structure), or right-click it.'
        : 'Hover a row for its buttons (copy, show in Structure), or right-click it.',
      Features.has('data.changes')
        ? 'Tick [[Track changes]] to mark and compare changed values. Raw and Sizes show the data as text and by size.'
        : null
    ].filter(Boolean);
  },
  get structure() {
    return [
      'Pick your OmniScript in the top bar. The list shows every element of its definition.',
      'Click an element to see its value, properties, rules and calls on the right.',
      '[[Follow current step]] keeps the script\'s current step selected; [[Current step]] jumps back to it.',
      Features.has('structure.references')
        ? 'Type in the filter to find an element by name, type or label. Actions only lists what calls something.'
        : 'Type in the filter to find an element by name, type or label.',
      Features.has('structure.problems') ? 'Problems (N) appears only while the definition has something provably wrong.' : null
    ].filter(Boolean);
  },
  get actions() {
    return [
      'Use the page as you normally do: its Apex calls appear here as they are made, decoded.',
      'Click a call to see its input, options and output on the right.',
      'A call that failed opens on its output, where the reason is.',
      'Type in the filter to find a call by class or method. in: searches inputs and outputs.',
      ...(Features.has('calls.compare') ? ['Compare with previous (or press d) shows what changed between two calls to the same place.'] : [])
    ];
  }
};
