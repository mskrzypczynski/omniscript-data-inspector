'use strict';

/* "Where is this set?" on the Data tab: the tooltip line a changed row carries, and
 * the small popover the row menu opens. What is known about a value is decided
 * in core/data/lineage.js; this draws it, and turns a click on the call or on a Set
 * Values element into a jump to the tab that shows it. */

import { lineageFor, callFor, changeNote } from '../../core/data/lineage.js';
import { changeText, clockText } from '../../core/shared/change-log.js';
import { omniPath } from '../../core/shared/path-links.js';
import { fixedPosition } from '../../core/shared/text-size.js';
import { Shared } from '../shared.js';
import { Nav } from '../nav.js';
import { Mask } from '../mask-setting.js';
import { TextSize } from '../text-size.js';

let open = null;

function closeLineage() {
  if (!open) return;
  open.cleanup();
  open.node.remove();
  open = null;
}

function line(text) {
  const node = document.createElement('div');
  node.className = 'lineage-line';
  node.textContent = text;
  return node;
}

function link(text, title, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lineage-link';
  button.textContent = text;
  button.title = title;
  button.addEventListener('click', () => { closeLineage(); action(); });
  return button;
}

/* A line of words with one link in it: "After call <link> (started 10:42:01)". */
function linkLine(before, linkNode, after = '') {
  const node = line('');
  node.append(document.createTextNode(before), linkNode);
  if (after) node.append(document.createTextNode(after));
  return node;
}

const SHORT = 60;
const cut = (text) => (text.length > SHORT ? `${text.slice(0, SHORT)}…` : text);

/* The popover's lines for what is known. `mask` filters the values shown
 * (Mask values is on). Pure enough to test without a click. */
function lineageLines(lineage, { mask, jumpCall, jumpElement }) {
  const lines = [];
  const { change, call, writers } = lineage;

  if (change) {
    lines.push(line(`Last changed ${clockText(change.time)}${change.step ? ` on ${change.step}` : ''}: ${changeText(change, mask)}`));
  }
  if (call) {
    lines.push(linkLine('After the call ', link(call.name, 'Show this call in Calls', () => jumpCall(call)),
      ` (started ${clockText(call.time instanceof Date ? call.time : new Date(call.time))})`));
  }
  writers.forEach((writer) => {
    lines.push(linkLine('Set by ', link(writer.name, 'Show this Set Values element in Structure', () => jumpElement(writer)),
      ` (${writer.target} ← ${cut(writer.expression)})`));
  });
  return lines;
}

/* Opens the popover at the pointer. */
function openLineagePopover(at, title, lineage, handlers) {
  closeLineage();

  const node = document.createElement('div');
  node.className = 'lineage-pop';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', 'Where did this value come from?');
  node.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'lineage-head';
  head.textContent = title;
  node.appendChild(head);

  if (lineage.empty) {
    node.appendChild(line('Nothing is known about where this value came from.'));
    const hint = line(Shared.elements().length
      ? 'Tick Track changes to keep a record of what changes; the call behind a change is listed here, and any Set Values that writes this value.'
      : 'Tick Track changes to keep a record of what changes; the call behind a change is listed here.');
    hint.classList.add('lineage-hint');
    node.appendChild(hint);
  } else {
    lineageLines(lineage, handlers).forEach((row) => node.appendChild(row));
  }

  document.body.appendChild(node);
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  /* Under Text size the page is zoomed: the pointer is in screen pixels, left
   * and top in the page's own. */
  const place = fixedPosition({
    x: at.x, y: at.y, width, height,
    viewWidth: window.innerWidth, viewHeight: window.innerHeight, zoom: TextSize.zoom()
  });
  node.style.left = `${place.left}px`;
  node.style.top = `${place.top}px`;

  const onDown = (down) => { if (!node.contains(down.target)) closeLineage(); };
  const onKey = (key) => { if (key.key === 'Escape') { key.stopPropagation(); closeLineage(); } };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeLineage);
  document.addEventListener('scroll', closeLineage, true);
  open = {
    node,
    cleanup: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeLineage);
      document.removeEventListener('scroll', closeLineage, true);
    }
  };

  const first = node.querySelector('.lineage-link');
  (first || node).focus();
}

/* The Data tab's side of it. `state` is the tab's state (log, data). */
export function createLineage(state) {
  /* The newest entry per path, rebuilt only when the log is replaced (a new
   * entry makes a new array). A tooltip is asked for on every row drawn. */
  let loggedFrom = null;
  let newest = new Map();
  const index = () => {
    if (state.log !== loggedFrom) {
      loggedFrom = state.log;
      newest = new Map();
      (state.log || []).forEach((entry) => newest.set(entry.path, entry));
    }
    return newest;
  };

  return {
    /* The line a row's tooltip gets, or ''. */
    note(path) {
      const change = index().get(path);
      return change ? changeNote(change, callFor(change, Shared.calls())) : '';
    },

    /* The popover for a row, opened at the pointer. */
    show(ev, path) {
      Shared.ensureElements(() => {
        const lineage = lineageFor(path, {
          changes: state.log, calls: Shared.calls(), elements: Shared.elements(), data: state.data
        });
        openLineagePopover({ x: ev.clientX, y: ev.clientY }, omniPath(state.data, path) || path, lineage, {
          mask: Mask.apply,
          jumpCall: (call) => Nav.go('actions', { id: call.id }),
          jumpElement: (writer) => Nav.go('structure', { elementKey: writer.key })
        });
      });
    }
  };
}
