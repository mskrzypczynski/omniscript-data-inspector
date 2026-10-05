'use strict';

/* The right-click menu of a Data tree row. */

import { addAllPaths } from '../../core/json-tree-model.js';
import { omniPath } from '../../core/path-links.js';
import { copyValueOf } from '../json-tree-view.js';
import { openContextMenu } from '../context-menu.js';
import { Mask } from '../mask-setting.js';

/* info: { path, value, keyText, container } from the row.
 * ctx: { state: { data, pins, expanded }, copy(text), filterTo(key), togglePin(path),
 *        canShowInStructure(path), showInStructure(path), rerender() } */
export function openRowMenu(ev, info, ctx) {
  const { state } = ctx;
  const pinned = state.pins.includes(info.path);
  const items = [
    { label: 'Copy value', action: () => ctx.copy(copyValueOf(Mask.apply(info.value))) },
    { label: 'Copy key', action: () => ctx.copy(info.keyText) },
    { label: 'Copy OmniScript path', disabled: !info.path,
      action: () => ctx.copy(omniPath(state.data, info.path)) },
    '-',
    { label: 'Filter to this key', disabled: /^\d+$/.test(info.keyText),
      action: () => ctx.filterTo(info.keyText) },
    { label: pinned ? 'Remove from watch list' : 'Add to watch list', disabled: !info.path,
      action: () => ctx.togglePin(info.path) },
    { label: 'Show in Structure', disabled: !ctx.canShowInStructure(info.path),
      action: () => ctx.showInStructure(info.path) }
  ];
  if (info.container) {
    items.push('-', {
      label: state.expanded.has(info.path) ? 'Collapse this branch' : 'Expand this branch',
      action: () => {
        if (state.expanded.has(info.path)) state.expanded.delete(info.path);
        else addAllPaths(info.value, info.path, state.expanded, 0);
        ctx.rerender();
      }
    });
  }
  openContextMenu(ev, items);
}
