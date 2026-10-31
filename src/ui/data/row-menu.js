'use strict';

/* The right-click menu of a Data tree row: the menu every tree offers
 * (tree-menu.js) plus the entries only this tab has. */

import { openTreeMenu } from '../tree-menu.js';
import { isRecordId } from '../../core/data/record-id.js';
import { Features } from '../features.js';

/* info: { path, value, keyText, container, inArray } from the row.
 * ctx: { state: { data, pins, expanded, filterOpen }, filtering(), copy(text), filterTo(key), togglePin(path),
 *        watchExpression(path),
 *        canShowInStructure(path), showInStructure(path), whereFrom(ev, path), rerender(),
 *        recordLink: { available(), open(id) } } */
export function openRowMenu(ev, info, ctx) {
  const { state } = ctx;
  const pinned = state.pins.includes(info.path);
  openTreeMenu(ev, info, {
    root: state.data,
    tree: state,
    filtering: ctx.filtering,
    copy: ctx.copy,
    rerender: ctx.rerender,
    extra: [
      { label: 'Filter to this key', disabled: !!info.inArray,
        action: () => ctx.filterTo(info.keyText) },
      ...(Features.has('data.watch') ? [
        { label: pinned ? 'Remove from watch list' : 'Add to watch list', disabled: !info.path,
          action: () => ctx.togglePin(info.path) },
        { label: 'Watch an expression…', disabled: !info.path,
          action: () => ctx.watchExpression(info.path) }
      ] : []),
      { label: 'Show in Structure', disabled: !ctx.canShowInStructure(info.path),
        action: () => ctx.showInStructure(info.path) },
      ...(Features.has('data.changes') ? [
        { label: 'Where is this set?', disabled: !info.path,
          action: () => ctx.whereFrom(ev, info.path) }
      ] : []),
      ...recordEntry(info, ctx)
    ]
  });
}

/* A record Id also offers to open the record; without a page to take the
 * address from, the entry is there but greyed out. */
function recordEntry(info, ctx) {
  if (info.container || !isRecordId(info.value)) return [];
  const can = ctx.recordLink.available();
  return [{ label: can ? 'Open record in a new tab' : 'Open record (no page)', disabled: !can,
    action: () => ctx.recordLink.open(info.value) }];
}
