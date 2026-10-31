'use strict';

/* What the Structure tab works out from the definition and the live data, and
 * keeps while neither has changed: the reference index, the repeat rows the
 * detail pane reads, the formula estimates and what
 * may stop a step from continuing. Pure reading: nothing here draws. */

import { resolveElementValue } from '../../core/shared/structure-model.js';
import { createReferences } from '../../core/shared/references.js';
import { rowsByName } from '../../core/structure/repeat-rows.js';
import { createEstimator } from '../../core/structure/formula-values.js';
import { valueMismatch } from '../../core/structure/value-types.js';
import { stepStoppers } from '../../core/structure/step-validation.js';
import { scriptLanguageCode } from '../../core/structure/message-text.js';

/* state: the tab's state. elementsByKey(): the elements by key (visibility-state.js). */
export function createValues({ state, elementsByKey }) {
  /* The reference index is rebuilt only when the definition is a new object. */
  let refsCache = { elements: null, value: null };
  function refs() {
    if (refsCache.elements !== state.elements) refsCache = { elements: state.elements, value: createReferences(state.elements) };
    return refsCache.value;
  }

  /* The repeat rows the detail pane reads: { blockName: row }. */
  const rows = () => rowsByName(state.rowsChosen, elementsByKey(), state.data);

  /* The formula estimator for the data and definition now; rebuilt when either is a new object. */
  let estimatorCache = { elements: null, data: null, value: null };
  function estimator() {
    if (estimatorCache.elements !== state.elements || estimatorCache.data !== state.data) {
      estimatorCache = { elements: state.elements, data: state.data, value: createEstimator(state.elements, state.data) };
    }
    return estimatorCache.value;
  }

  /* The script's language as a code (en or en_US), '' when it has none or only a name: the script header's, else the definition's own. */
  const language = () => scriptLanguageCode(state.header && state.header.bpLang, state.root && state.root.bpLang);

  /* What is off about the value in the data for the element's type, or '' (a hint,
   * counted nowhere). Judged on the value the data holds: an estimate is never
   * looked at, and nothing without data. */
  function hintOf(element) {
    if (state.data === undefined) return '';
    const found = valueMismatch(element, resolveElementValue(element, state.data, rows()));
    return found ? found.text : '';
  }

  /* What may stop a step from continuing, judged from the live data. Asked for
   * several times per redraw (the head, the tabs, the badge), so the answer is
   * kept while nothing it reads has changed. Every row of a repeating block is
   * judged, so the row the stepper shows does not enter into it. */
  let stoppersCache = { elements: null, data: null, visibility: null, language: '', byStep: new Map() };
  function stoppersOf(step) {
    const code = language();
    const same = stoppersCache.elements === state.elements && stoppersCache.data === state.data &&
      stoppersCache.visibility === state.visibility && stoppersCache.language === code;
    if (!same) {
      stoppersCache = { elements: state.elements, data: state.data, visibility: state.visibility, language: code, byStep: new Map() };
    }
    if (!stoppersCache.byStep.has(step.key)) {
      stoppersCache.byStep.set(step.key, stepStoppers(state.elements, step.key, state.data, state.visibility, { language: code }));
    }
    return stoppersCache.byStep.get(step.key);
  }

  return { refs, rows, estimator, language, hintOf, stoppersOf };
}
