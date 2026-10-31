'use strict';

/* The export items of the Structure toolbar's More menu: files built from the
 * loaded definition (core/structure/structure-export.js). The files hold the
 * script's structure and labels only, never a value from the live data (the
 * answers a loaded definition carries are masked while Mask values is on). */

import { downloadText } from '../util.js';
import { toast } from '../toast.js';
import { parseObj, maskDefinitionValues } from '../../core/shared/structure-model.js';
import { Mask } from '../mask-setting.js';
import {
  structureMarkdown, structureCsv, customLabelsCsv, hasCustomLabels, exportFileName, exportTitle
} from '../../core/structure/structure-export.js';

/* The definition as it was read. With Mask values on, the answers a loaded
 * script keeps in `response` and `defaultValue` are replaced (keys stay), which
 * means writing it out again instead of passing the page's text through. null
 * when masking is on and the text does not parse: there is no structure to
 * keep, and passing it through would leak the answers in it. */
function definitionText(raw, parsed) {
  if (!Mask.on()) return raw;
  if (!parsed) return null;
  return JSON.stringify(maskDefinitionValues(parsed), null, 2);
}

/* state: the tab's state (elements, header, defRaw). Returns menu items; they
 * are greyed while no definition is loaded. */
export function exportItems(state) {
  const empty = !state.elements.length;
  const definition = () => parseObj(state.defRaw);
  const save = (what, extension, text, type) => {
    downloadText(exportFileName(definition(), what, extension, new Date()), text, type);
  };

  return [
    { label: 'Export structure as Markdown', disabled: empty,
      title: 'A heading per step and a table of its elements. Holds no values from the data',
      action: () => save('structure', 'md',
        structureMarkdown(state.elements, { title: exportTitle(definition()) }), 'text/markdown') },
    { label: 'Export structure as CSV', disabled: empty,
      title: 'One row per element, with depth and parent. Holds no values from the data',
      action: () => save('structure', 'csv', structureCsv(state.elements), 'text/csv') },
    { label: 'Export custom labels as CSV',
      disabled: empty || !hasCustomLabels(state.elements, state.header),
      title: 'Each custom label key, its text and the elements using it; greyed out when none.',
      action: () => save('labels', 'csv', customLabelsCsv(state.elements, state.header), 'text/csv') },
    { label: 'Export definition as JSON', disabled: empty || !state.defRaw,
      title: 'The definition as read: the baseline for Compare definition.',
      action: () => {
        const text = definitionText(state.defRaw, definition());
        if (text === null) { toast('Not saved: Mask values is on and the definition is not valid JSON, so its answers cannot be hidden'); return; }
        save('definition', 'json', text, 'application/json');
      } }
  ];
}
