'use strict';

/* Calls: which calls the filters show, and what depends on the list of
 * calls as a whole (the repeats). Nothing here draws. */

import { matchesFilter } from '../../core/shared/actions-model.js';
import { parseQuery } from '../../core/shared/actions-search.js';
import { findRepeats, repeatIds } from '../../core/actions/actions-repeats.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { Features } from '../features.js';

/* Which step each call was made on: the live script's step timeline, or, while
 * a loaded session is on screen, the one saved in the file (the live script
 * has nothing to say about calls from another day). */
export function visitsFor(state) {
  if (state.session) return state.session.visits || [];
  const step = Shared.step();
  return step && Array.isArray(step.visits) ? step.visits : [];
}

/* state: the tab's state. */
export function createFiltering({ state }) {
  /* Repeats are worked out again only when the list of calls changed (a call
   * came in, went out, or the list was swapped), not on every redraw. Chains
   * come first: their hops are never repeats of each other. */
  const repeatMemo = { entries: null, key: '' };
  function refreshRepeats() {
    const list = state.entries;
    const key = `${list.length}:${list.length ? list[0].id : ''}:${list.length ? list[list.length - 1].id : ''}:${state.chains.length}`;
    if (repeatMemo.entries === list && repeatMemo.key === key) return;
    repeatMemo.entries = list;
    repeatMemo.key = key;
    state.repeats = findRepeats(list, undefined, state.chains);
    state.repeatIds = repeatIds(state.repeats);
  }

  const visitsNow = () => visitsFor(state);

  /* The filter box, parsed again only when its text changed. */
  const parsedCache = { text: null, value: parseQuery('') };
  function parsedQuery() {
    if (parsedCache.text !== state.filter) {
      parsedCache.value = parseQuery(state.filter);
      // Slow calls is behind a gate: without it slow: filters nothing.
      if (!Features.has('calls.analysis')) parsedCache.value.slow = null;
    }
    parsedCache.text = state.filter;
    return parsedCache.value;
  }

  function filterOpts() {
    return {
      onlyOmni: !state.showAll, query: state.filter, parsed: parsedQuery(),
      errorsOnly: state.errorsOnly, slowMs: state.slowMs,
      masked: Mask.on(), visits: visitsNow(), repeatIds: state.repeatIds
    };
  }

  function visibleEntries() {
    const opts = filterOpts();
    return state.entries.filter((entry) => matchesFilter(entry, opts));
  }

  return { refreshRepeats, visitsNow, parsedQuery, filterOpts, visibleEntries };
}
