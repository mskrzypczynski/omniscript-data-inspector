'use strict';

/* What the debug bundle gets from the Structure tab. The script's own structure
 * and names go out as they are; what the data holds (an element's value, the
 * numbers a visibility sentence quotes) goes through `mask`. */

import { resolveElementValue } from '../../core/shared/structure-model.js';
import { Features } from '../features.js';

/* state: the tab's state. The rest are the tab's own readers of it. */
/* A blocker's `reason` is the definition's own words; what a message formula
 * comes to (`shownReason`, the note's error text) holds data, so it is masked. */
function blockerOf(item, mask) {
  const { shownReason, formula, ...rest } = item;
  return {
    ...rest,
    ...(shownReason ? { shownReason: mask(shownReason) } : {}),
    ...(formula ? { formula: { raw: formula.raw, note: mask(formula.note) } } : {})
  };
}

export function createStructureDump({ state, currentElement, rows, explain, isHidden, stoppersOf }) {
  return function dump(mask) {
    const current = currentElement();
    const currentRows = rows();
    const visibility = {};
    state.elements.forEach((element) => {
      const why = explain(element);
      visibility[element.key] = { hidden: isHidden(element), headline: why.headline ? mask(why.headline) : '' };
    });
    return {
      defProp: state.defProp,
      selectedKey: state.selectedKey,
      activeIndex: state.activeIndex,
      elementCount: state.elements.length,
      /* Left out in Free, so Copy report names neither the Problems count nor the May stop Next items. */
      ...(Features.has('structure.problems') ? { problems: state.problems.map((problem) => ({ ...problem })) } : {}),
      ...(Features.has('structure.steps')
        ? { blockers: current ? stoppersOf(current).items.map((item) => blockerOf(item, mask)) : [] } : {}),
      elements: state.elements.map((full) => {
        const element = { ...full };
        delete element.node; // the whole definition node: large, and the elements already say what matters
        return {
          ...element,
          validation: element.validation ? { ...element.validation, raw: undefined } : element.validation,
          value: mask(resolveElementValue(element, state.data, currentRows))
        };
      }),
      visibility,
      progress: { ...state.progress },
      filter: state.filter,
      collapsedCount: state.collapsed.size
    };
  };
}
