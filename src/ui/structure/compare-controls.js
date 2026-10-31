'use strict';

/* The Structure tab's two deeper-dive views of the detail pane, both opened
 * from the More menu: the comparison with an earlier definition (a file the user picks),
 * and the step timeline. The pane itself is ./compare-pane.js and
 * ./timeline-view.js. */

import { flatten } from '../../core/shared/structure-model.js';
import { diffDefinitions, definitionFromFile } from '../../core/structure/definition-diff.js';
import { readFileText } from './compare-pane.js';
import { Features } from '../features.js';

/* state, el: the tab's. renderDetail(), updateProblemsChip(): its redraws.
 * selectElement(element, options): its selection. */
export function createCompareControls({ state, el, renderDetail, updateProblemsChip, selectElement }) {
  function closeCompare() {
    state.compare = null;
    renderDetail();
  }

  /* The loaded script's element for one of a comparison. */
  function findCompared(element) {
    return state.elements.find((candidate) => candidate.key === element.key && candidate.name === element.name) || null;
  }

  /* A line of the comparison: the list follows, the comparison stays and keeps its scroll. */
  function selectCompared(target) {
    const top = el.detail.scrollTop;
    selectElement(target, { clearFilters: true, keepCompare: true });
    el.detail.scrollTop = top;
  }

  /* The picked file is Before, the loaded script After. Both
   * are read without the label map, so a label key is compared as a key on both sides. */
  async function compareFile(file) {
    const loaded = definitionFromFile(await readFileText(file));
    let compare;
    if (loaded.error) {
      compare = { fileName: file.name, error: loaded.error };
    } else if (!state.defRaw) {
      compare = { fileName: file.name, error: 'There is no definition loaded to compare with. Pick a script and press Refresh.' };
    } else {
      try {
        const result = diffDefinitions(flatten(loaded.definition, null), flatten(JSON.parse(state.defRaw), null));
        compare = { fileName: file.name, from: loaded.from, result };
      } catch (error) {
        compare = { fileName: file.name, error: `The definitions could not be compared: ${error.message}` };
      }
    }
    state.compare = compare;
    state.showProblems = false;
    updateProblemsChip();
    renderDetail();
  }

  /* The Timeline item of the More menu: the pane shows the step timeline instead of the element. */
  function toggleTimeline() {
    if (!Features.has('structure.timeline')) return;
    state.showTimeline = !state.showTimeline;
    if (state.showTimeline) { state.compare = null; state.showProblems = false; updateProblemsChip(); }
    renderDetail();
  }

  /* The Compare definition… item: opens the file picker. */
  function pickFile() {
    if (!Features.has('structure.compare-definition')) return;
    document.getElementById('struct-compare-file').click();
  }

  function mountCompare() {
    if (!Features.has('structure.compare-definition')) return;
    const input = document.getElementById('struct-compare-file');
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) compareFile(file);
    });
  }

  return { closeCompare, findCompared, selectCompared, toggleTimeline, pickFile, mountCompare };
}
