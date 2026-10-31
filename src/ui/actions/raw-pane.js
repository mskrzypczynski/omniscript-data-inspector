'use strict';

/* The Calls tab's Raw view. It takes the detail pane's place for one
 * call (the list stays), is opened from Show raw in the row menu, and shows
 * what went over the wire: the request as the page sent it and the answer as
 * it came back, each as numbered, wrapped text with its own Copy. What to show
 * (text, the note about a cut or a missing one, what Mask values hides) is
 * decided in src/core/actions/raw-view.js; this module draws it. Back, or Esc,
 * returns to the call's normal detail. */

import { Mask } from '../mask-setting.js';
import { copyWithToast } from '../clipboard.js';
import { decorateButton } from '../icons.js';
import { buildRawBlock } from '../data/raw-view.js';
import { rawView } from '../../core/actions/raw-view.js';

function node(tag, className, text) {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/* state: the tab's state (rawFor is the id of the call shown, or null). el:
 * { detail, list }. paint(): draws the detail pane again. */
export function createRawPane({ state, el, paint }) {
  /* Whether the pane shows the raw view for this call: a chain's row has no
   * request of its own, and another call has its own detail. */
  const showing = (entry) => state.rawFor !== null && !!entry && !entry.chain && entry.id === state.rawFor;

  function open(entry) {
    if (!entry || entry.chain) return;
    state.rawFor = entry.id;
    paint();
    const back = el.detail.querySelector('.raw-back');
    if (back) back.focus();
  }

  function close({ restore = false } = {}) {
    if (state.rawFor === null) return;
    state.rawFor = null;
    paint();
    if (restore) {
      const row = el.list.querySelector('.log-row.is-selected');
      if (row && row.focus) row.focus();
    }
  }

  /* Esc returns from the list too: a click on the row leaves the focus there,
   * outside the pane's own handler. The list is looked up when the key is
   * pressed (the tab finds its elements when it mounts). */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || state.rawFor === null) return;
    if (!el.list || !el.list.contains(ev.target)) return;
    ev.preventDefault();
    close({ restore: true });
  });

  /* What decides a redraw: the call and Mask values (the text changes with it). */
  const key = (entry) => `raw:${entry ? entry.id : ''}:${Mask.on()}`;

  function section(title, tip, copyLabel, view) {
    const part = node('section', 'raw-part');
    const head = node('div', 'raw-part-head');
    const heading = node('span', 'raw-part-title', title);
    heading.id = `raw-title-${title.toLowerCase()}`;
    part.setAttribute('aria-labelledby', heading.id);
    head.appendChild(heading);
    const copy = node('button', 'icon-btn tiny raw-copy');
    copy.type = 'button';
    decorateButton(copy, 'copy', 'Copy');
    copy.setAttribute('aria-label', `Copy ${title.toLowerCase()}`);
    copy.title = view.text === null
      ? `Nothing to copy: ${view.note}`
      : `${tip} Honours Mask values.`;
    copy.disabled = view.text === null;
    copy.addEventListener('click', () => { if (view.text !== null) copyWithToast(view.text, copyLabel); });
    head.appendChild(copy);
    part.appendChild(head);
    if (view.note) {
      const note = node('div', 'raw-note', view.note);
      note.setAttribute('role', view.text === null ? 'status' : 'note');
      part.appendChild(note);
    }
    if (view.text !== null) {
      const block = buildRawBlock(view.text, { wrap: true });
      block.node.classList.add('raw-wire');
      // A block that scrolls is reached and read with the keyboard.
      block.node.tabIndex = 0;
      block.node.setAttribute('role', 'region');
      block.node.setAttribute('aria-label', `${title} text`);
      part.appendChild(block.node);
    }
    return part;
  }

  function render(pane, entry) {
    pane.textContent = '';
    const views = rawView(entry, Mask.on() ? Mask.apply : undefined);

    const root = node('div', 'raw-pane');
    root.tabIndex = -1; // a click in the text keeps Esc working
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close({ restore: true }); }
    });

    const head = node('div', 'detail-head raw-head');
    const back = node('button', 'icon-btn tiny raw-back');
    back.type = 'button';
    decorateButton(back, 'arrow-left', 'Back');
    back.title = 'Back to the call (Esc)';
    back.setAttribute('aria-label', 'Back to the call');
    back.addEventListener('click', () => close({ restore: true }));
    head.appendChild(back);
    const title = node('div', 'detail-title', entry.name || entry.signature || 'Call');
    title.title = entry.signature || '';
    head.appendChild(title);
    head.appendChild(node('div', 'detail-meta', 'Raw: what went over the wire'));
    root.appendChild(head);

    const body = node('div', 'raw-body');
    body.appendChild(section('Request', 'Copy the request as the page sent it.', 'Copied request', views.request));
    body.appendChild(section('Response', 'Copy the answer as the page received it.', 'Copied response', views.response));
    root.appendChild(body);
    pane.appendChild(root);
  }

  return { showing, open, close, render, key };
}
