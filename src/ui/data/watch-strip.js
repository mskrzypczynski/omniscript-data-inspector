'use strict';

/* The watch list: a strip above the tree with the value of each pinned path.
 * Rebuilt only when what it shows changed, so a poll that changes nothing
 * leaves hover and focus alone. */

import { watchRows } from '../../core/watch.js';

/* state: { data, pins, watchSig, watchPrev } (the last two are this module's
 * memory, kept there so a selection change can reset them).
 * on: { reveal(path), remove(path) } */
export function renderWatchStrip(container, state, on) {
  const rows = watchRows(state.data, state.pins);
  container.hidden = rows.length === 0;
  const signature = JSON.stringify(rows.map((row) => [row.path, row.text]));
  if (signature === state.watchSig) return;
  state.watchSig = signature;

  container.textContent = '';
  const title = document.createElement('span');
  title.className = 'bar-label';
  title.textContent = 'Watching';
  container.appendChild(title);

  const next = {};
  rows.forEach((row) => {
    next[row.path] = row.text;
    const item = document.createElement('span');
    item.className = `watch-item${row.present ? '' : ' is-gone'}`;
    if (state.watchPrev[row.path] !== undefined && state.watchPrev[row.path] !== row.text) item.classList.add('is-changed');

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'watch-name';
    name.textContent = row.label;
    name.title = 'Show in the tree';
    name.addEventListener('click', () => on.reveal(row.path));
    item.appendChild(name);

    const value = document.createElement('span');
    value.className = 'watch-value';
    value.textContent = row.text;
    value.title = row.text;
    item.appendChild(value);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'watch-remove';
    remove.textContent = '×';
    remove.title = 'Stop watching';
    remove.addEventListener('click', () => on.remove(row.path));
    item.appendChild(remove);

    container.appendChild(item);
  });
  state.watchPrev = next;
}
