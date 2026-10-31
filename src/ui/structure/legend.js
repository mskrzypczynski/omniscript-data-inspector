'use strict';

/* The legend of the Structure list's marks: the Marks column header is a
 * button that opens a small popover with each real icon beside what it means.
 * What the lines say is core/structure/row-marks.js (legendGroups); only the
 * drawing and the keys are here. Enter or Space opens it, Escape or a click
 * elsewhere closes it, and focus goes back to the header. */

import { icon as svgIcon } from '../icons.js';
import { legendGroups } from '../../core/structure/row-marks.js';

let open = null; // { node, button, off() } while the popover is on show

export function closeLegend({ restoreFocus = false } = {}) {
  if (!open) return;
  const { node, button, off } = open;
  open = null;
  off();
  node.remove();
  button.setAttribute('aria-expanded', 'false');
  if (restoreFocus) {
    /* The list may have been redrawn meanwhile: the header button is a new node. */
    const now = button.isConnected ? button : document.querySelector('.el-legend-btn');
    if (now) now.focus();
  }
}

function drawGroup(group) {
  const section = document.createElement('div');
  section.className = 'legend-group';
  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = group.title;
  section.appendChild(title);
  group.items.forEach((item) => {
    const line = document.createElement('div');
    line.className = 'legend-line';
    const mark = document.createElement('span');
    mark.className = 'legend-mark';
    if (item.icon) mark.appendChild(svgIcon(item.icon)); else mark.textContent = item.text || item.looks;
    mark.title = item.looks;
    const means = document.createElement('span');
    means.className = 'legend-means';
    means.textContent = item.means;
    line.append(mark, means);
    section.appendChild(line);
  });
  return section;
}

/* Turns the header cell `button` into the legend's trigger. */
export function wireLegend(button) {
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', open && open.button === button ? 'true' : 'false');
  button.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (open) { closeLegend({ restoreFocus: true }); return; }
    showLegend(button);
  });
}

function showLegend(button) {
  const node = document.createElement('div');
  node.className = 'legend-pop';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', 'What the marks in the list mean');
  legendGroups().forEach((group) => node.appendChild(drawGroup(group)));
  document.body.appendChild(node);

  const rect = button.getBoundingClientRect();
  const width = node.offsetWidth;
  node.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - width - 4))}px`;
  node.style.top = `${rect.bottom + 2}px`;

  const onDown = (down) => { if (!node.contains(down.target) && !button.contains(down.target)) closeLegend(); };
  const onKey = (key) => {
    if (key.key !== 'Escape') return;
    key.stopPropagation();
    closeLegend({ restoreFocus: true });
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeLegend);
  open = {
    node, button,
    off: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeLegend);
    }
  };
  button.setAttribute('aria-expanded', 'true');
}
