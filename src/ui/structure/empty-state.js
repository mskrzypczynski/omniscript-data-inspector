'use strict';

/* What the Structure tab shows while no OmniScript is selected: one line that
 * says so, a Rescan button and a link to the help, with the toolbar controls
 * switched off and the detail pane folded away, so nothing on screen suggests
 * there is something to work with. The other tabs' wording of "nothing found"
 * stays in ../empty-notice.js. */

/* The controls that need a script. Refresh stays on: it looks again. View stays
 * on too: its switches are remembered settings, which can be set before a script turns up. */
const NEEDS_SCRIPT = [
  'struct-current', 'struct-follow', 'struct-filter', 'struct-expand', 'struct-collapse', 'struct-more'
];

/* The one-line card. `defProp` is only named in the tooltip. */
export function emptyCard(defProp) {
  const box = document.createElement('div');
  box.className = 'notice is-one-line struct-empty';
  box.title = `Nothing on this page exposes ${defProp} yet. Open a page that is running an OmniScript and let it finish loading.`;

  const text = document.createElement('span');
  text.textContent = 'No OmniScript found on this page. Open a page that runs one and let it load, then Rescan.';
  box.appendChild(text);

  const rescan = document.createElement('button');
  rescan.type = 'button';
  rescan.id = 'struct-empty-rescan';
  rescan.className = 'icon-btn tiny';
  rescan.textContent = 'Rescan';
  rescan.title = 'Look for scripts and frames again (the same as Rescan at the top)';
  rescan.addEventListener('click', () => document.getElementById('rescan').click());
  box.appendChild(rescan);

  const more = document.createElement('button');
  more.type = 'button';
  more.id = 'struct-empty-help';
  more.className = 'help-more';
  more.textContent = 'More help';
  more.title = 'Open the help on what to try when nothing is found.';
  more.setAttribute('data-help', 'No OmniScript found');
  more.addEventListener('click', () => {
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true, cancelable: true }));
  });
  box.appendChild(more);
  return box;
}

/* Switches the toolbar and the split between "nothing to work with" and normal. */
export function setEmptyState(empty) {
  NEEDS_SCRIPT.forEach((id) => {
    const control = document.getElementById(id);
    if (control && control.disabled !== empty) control.disabled = empty;
  });
  const split = document.querySelector('#view-structure .split');
  if (split) split.classList.toggle('is-empty', empty);
}
