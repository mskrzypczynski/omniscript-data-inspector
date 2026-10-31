'use strict';

/* The Export button of the Data toolbar: a small menu with the two ways the
 * data leaves the panel, Copy JSON and Save file. Both write the page's own
 * text and honour Mask values (payload-actions.js). The two used to be buttons
 * of their own; as one menu they leave the room a filter and the Track changes
 * switch need to keep the bar on one row. */

import { openContextMenu } from '../context-menu.js';
import { anchorRect } from '../toolbar-overflow.js';
import { copyPayload, downloadPayload } from './payload-actions.js';

/* button: the Export button; state: the tab's. */
export function openExportMenu(ev, button, state) {
  /* Under the button, whether it was clicked or pressed with the keyboard; in a
   * narrow panel the button is in the "…" menu, so under that. The button is
   * passed on as currentTarget so the menu can say aria-expanded on it. */
  const rect = anchorRect(button);
  openContextMenu({ clientX: rect.left, clientY: rect.bottom, type: ev.type, detail: ev.detail, currentTarget: button }, [
    { label: 'Copy JSON', action: () => copyPayload(state) },
    { label: 'Save file…', action: () => downloadPayload(state) }
  ]);
}
