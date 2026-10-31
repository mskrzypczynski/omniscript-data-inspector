'use strict';

/* Draws the Data tab's status bar from the pure text in core/data/data-status.js. */

import { statusText } from '../../core/data/data-status.js';
import { rawView, hasUnsafeNumbers } from '../../core/shared/raw-json.js';
import { Targets } from '../targets.js';
import { StatusLine } from '../status-line.js';

/* marked: how many changes are marked in the tree right now. */
export function renderStatusBar(el, state, marked) {
  const host = Targets.selected();
  /* The Raw layout is built for the Raw view; here it is only asked for when
   * the payload holds a number above 2^53, to say whether Raw is exact. */
  const readable = state.data !== undefined && !state.parseError;
  const view = readable && hasUnsafeNumbers(state.raw) ? rawView(state.raw, state.data) : null;
  const { left, rightParts, title } = statusText({
    host,
    prop: state.prop,
    session: Targets.sessionName(),
    shown: host ? Targets.visibleHosts().length : 0,
    nested: host ? Targets.nestedCount() : 0,
    elementHosts: host ? Targets.elementHostCount() : 0,
    note: state.windowNote || '',
    truncated: host ? Targets.truncated() : false,
    rawLength: state.raw ? state.raw.length : 0,
    scanError: state.scanError,
    visible: state.visible,
    stale: state.stale,
    live: state.live,
    lastUpdateText: state.lastUpdate ? state.lastUpdate.toLocaleTimeString() : '',
    changedCount: state.changed.size,
    changeInfo: state.changeInfo || null,
    view: state.view,
    hasData: state.data !== undefined,
    rawLines: state.rawLines,
    rawMatches: state.rawMatches,
    filter: state.filter,
    query: state.queryInfo,
    unsafeNumbers: !!view && view.unsafe,
    rawExact: !!view && view.exact
  });

  const span = document.createElement('span');
  left.forEach((part) => {
    if (part.bold) {
      const b = document.createElement('b');
      b.textContent = part.text;
      span.appendChild(b);
    } else {
      span.appendChild(document.createTextNode(part.text));
    }
  });
  StatusLine.left(span);
  StatusLine.title(title);

  /* The Changes bar is behind a gate: Free has none of these. */
  if (el.changeCount) el.changeCount.textContent = marked ? `${marked} marked` : 'none marked';
  if (el.prevChange) el.prevChange.disabled = marked === 0;
  if (el.nextChange) el.nextChange.disabled = marked === 0;
  /* The clock time is marked quiet so the screen-reader mirror skips it. */
  StatusLine.right(rightParts.map((part) => {
    if (!part.quiet) return part.text;
    const quiet = document.createElement('span');
    quiet.dataset.quiet = '';
    quiet.textContent = part.text;
    return quiet;
  }));
}
