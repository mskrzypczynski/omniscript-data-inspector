'use strict';

/* What the Data tab shows, for the debug bundle. Paths and property names are
 * structure and stay; the filter text may hold a value, so it goes through the
 * mask like org data does. */

import { SEP } from '../../core/shared/json-tree-model.js';
import { readablePin } from '../../core/data/pin-follow.js';
import { Features } from '../features.js';

/* state: the tab's state. sizesOf(): the Sizes figures of the current payload. */
export function createDataDump({ state, sizesOf }) {
  return function dumpData(mask) {
    const readable = (path) => path.split(SEP).join('.');
    return {
      prop: state.prop,
      view: state.view,
      filter: mask(state.filter),
      live: state.live,
      stale: state.stale,
      trackChanges: state.trackChanges,
      rawLength: state.raw ? state.raw.length : 0,
      expandedCount: state.expanded.size,
      pins: state.pins.map(readablePin),
      changedCount: state.changed.size,
      touchedCount: state.touched.size,
      sizesTop: state.data === undefined || !Features.has('data.sizes') ? [] : sizesOf().items.map((item) => ({ ...item, path: readable(item.path) }))
    };
  };
}
