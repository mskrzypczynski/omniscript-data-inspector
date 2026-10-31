'use strict';

/* Open record: a value that is a Salesforce record Id gets a button and a menu
 * entry that open the record in a new tab of the org the page belongs to. The
 * panel sends nothing; the browser opens the address. The origin is read from
 * the inspected page (as Open in Designer does) and kept for the redraws; ''
 * when it cannot be read, or while a loaded bundle is shown. */

import { isRecordId, recordUrl } from '../../core/data/record-id.js';
import { Targets } from '../targets.js';

/* state: the tab's. render(): a full redraw. */
export function createRecordLink({ state, render }) {
  let token = 0;
  state.pageOrigin = '';

  /* Read the origin again (a new script, page or loaded file can change it)
   * and redraw only when the answer is different. */
  function refresh() {
    const mine = ++token;
    Targets.pageOrigin((origin) => {
      if (mine !== token || origin === state.pageOrigin) return;
      state.pageOrigin = origin;
      if (state.active) render();
    });
  }

  const available = () => !!state.pageOrigin;

  function open(id) {
    const url = recordUrl(state.pageOrigin, id);
    if (url) window.open(url, '_blank', 'noopener');
  }

  return { refresh, available, open, isRecordId };
}
