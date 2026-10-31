'use strict';

/* The right-click menu every JSON tree offers: copy the value, the key, the
 * OmniScript path or the %merge% field, and open or close the branch. The
 * Data tab adds its own entries (filter, watch, Show in Structure) through
 * `extra`; the detail panes of Structure and Calls use it as is.
 *
 *   openTreeMenu(ev, info, { root, tree, filtering, copy, rerender, extra })
 *
 * info is the row ({ path, value, keyText, container, inArray }) as
 * json-tree-view hands it to onContext. tree is { expanded, filterOpen }, the
 * sets the tree is drawn from; root the whole value the tree shows, so the
 * OmniScript path can count repeat rows. `extra` is a list of items (or '-')
 * placed after the copy entries. */

import { isBranchOpen, lineSize, setSubtreeOpen, subtreeBranches } from '../core/shared/json-tree-model.js';
import { omniPath } from '../core/shared/path-links.js';
import { mergeField } from '../core/shared/filter-query.js';
import { copyValueOf } from './json-tree-view.js';
import { openContextMenu } from './context-menu.js';
import { Mask } from './mask-setting.js';
import { toast } from './toast.js';

/* Every branch under (and including) the row, opened or closed. Says so when
 * the bounds cut the list short. */
function setBranch(tree, info, filtering, open) {
  const { paths, capped } = subtreeBranches(info.value, info.path);
  if (filtering) paths.forEach((path) => tree.filterOpen.set(path, open));
  else paths.forEach((path) => (open ? tree.expanded.add(path) : tree.expanded.delete(path)));
  if (capped && open) toast(`Opened the first ${paths.length.toLocaleString('en-US')} branches`);
}

export function openTreeMenu(ev, info, ctx) {
  const { tree, root } = ctx;
  const items = [
    { label: 'Copy value', action: () => ctx.copy(copyValueOf(Mask.apply(info.value)), 'value') },
    { label: 'Copy key', disabled: !info.keyText, action: () => ctx.copy(info.keyText, 'key') },
    { label: 'Copy OmniScript path', disabled: !info.path,
      action: () => ctx.copy(omniPath(root, info.path), 'path') },
    { label: 'Copy as %merge% field', disabled: !info.path,
      action: () => ctx.copy(mergeField(root, info.path), '%merge% field') }
  ];
  if (ctx.extra && ctx.extra.length) items.push('-', ...ctx.extra);

  if (info.container) {
    const filtering = ctx.filtering();
    const open = isBranchOpen({ filtering, expanded: tree.expanded, filterOpen: tree.filterOpen }, info.path);
    items.push('-', {
      label: open ? 'Collapse this branch' : 'Expand this branch',
      action: () => {
        if (filtering) setBranch(tree, info, true, !open);
        else if (open) tree.expanded.delete(info.path); // closing hides what is under it; their own state is kept
        else setBranch(tree, info, false, true);
        ctx.rerender();
      }
    });
    if (lineSize(info.value) > 1) {
      const inside = (value) => () => {
        setSubtreeOpen({ filtering, expanded: tree.expanded, filterOpen: tree.filterOpen }, info.value, info.path, value);
        ctx.rerender();
      };
      items.push({ label: 'Expand everything inside', action: inside(true) },
        { label: 'Collapse everything inside', action: inside(false) });
    }
  }
  openContextMenu(ev, items);
}
