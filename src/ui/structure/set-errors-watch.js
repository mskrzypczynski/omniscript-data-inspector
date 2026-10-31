'use strict';

/* Tells the user when Set Errors start to fire on the current step while they
 * are on another tab; on the Structure tab the step's badge says so. */

import { nextErrorWatch, NEW_WATCH } from '../../core/structure/error-watch.js';
import { computeVisibility } from '../../core/structure/visibility.js';
import { firingErrors } from '../../core/structure/step-validation.js';
import { toast } from '../toast.js';

/* state: the tab's state. currentElement(): the element the script is on. */
export function createSetErrorsWatch({ state, currentElement }) {
  let errorWatch = NEW_WATCH;
  /* The payload read while another tab is on screen, parsed and judged once. */
  let watched = { raw: null, elements: null, data: undefined, visibility: {} };

  /* Errors firing on the step the script is on, judged from the newest payload.
   * While this tab is on screen its own data is current; otherwise the payload
   * the tracker just read is parsed here, once per change, since the tab's own
   * state is not updated then. null when it cannot be told. */
  function firingOnCurrentStep(current, read) {
    let data = state.data;
    let visibility = state.visibility;
    if (!state.active) {
      if (!read || read.error || typeof read.raw !== 'string' || !read.raw) return null;
      if (watched.raw !== read.raw || watched.elements !== state.elements) {
        let parsed;
        try { parsed = JSON.parse(read.raw); } catch { return null; }
        watched = { raw: read.raw, elements: state.elements, data: parsed, visibility: computeVisibility(state.elements, parsed) };
      }
      ({ data, visibility } = watched);
    }
    return firingErrors(state.elements, current.key, data, visibility).filter((item) => !item.estimated).length;
  }

  function watch(read) {
    const current = state.elements.length ? currentElement() : null;
    const count = current ? firingOnCurrentStep(current, read) : 0;
    if (count === null) return;
    const result = nextErrorWatch(errorWatch, current && { key: current.key, name: current.name }, count, Date.now());
    errorWatch = result.memory;
    if (result.message && !state.active) toast(result.message);
  }

  /* A different script: what was seen belongs to the old one. */
  function reset() {
    errorWatch = NEW_WATCH;
  }

  return { watch, reset };
}
