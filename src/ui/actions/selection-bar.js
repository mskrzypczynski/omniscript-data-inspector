'use strict';

/* Calls: the ticked calls and the bar above the list that adds them
 * up: totals in a sentence, and under it a bar of where the time went. */

import {
  selectionSummary, summaryParts, requestSegments, segmentTitle, segmentLabel, segmentTypes, idsInRange
} from '../../core/actions/actions-selection.js';
import { memoDraw } from '../memo-draw.js';
import { Mask } from '../mask-setting.js';
import { Features } from '../features.js';

const TYPE_NAME = { DR: 'DR', IP: 'IP', RA: 'RA', APEX: 'Apex' };

/* state: the tab's state. el: the elements it looked up. showCall(id): select
 * a call from the bar. paintMarks(): the list's tick boxes. visibleEntries():
 * the calls the filters show. */
export function createSelectionBar({ state, el, showCall, paintMarks, visibleEntries }) {
  function markedEntries() {
    return state.entries.filter((entry) => state.marked.has(entry.id));
  }

  /* What the bar shows now, as a signature of the ticked calls, so a redraw
   * that changes neither the ticks nor those calls leaves the bar (and a focused
   * segment in it) alone. */
  const drawnSelection = { text: '' };

  const signatureOf = (calls) => state.timeFormat + '#' + calls.map((entry) =>
    `${entry.id}:${entry.requestId}:${entry.duration}:${entry.failure ? 1 : 0}:${entry.time.getTime()}`).join('|');

  /* The sentence: plain text, except the slowest call's name, which selects it. */
  function paintSelectionText(parts) {
    el.selectionText.textContent = '';
    parts.forEach((part) => {
      if (part.callId === undefined) {
        el.selectionText.appendChild(document.createTextNode(part.text));
        return;
      }
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'sel-link';
      link.textContent = part.text;
      link.title = 'Select this call';
      link.addEventListener('click', () => showCall(part.callId));
      el.selectionText.appendChild(link);
    });
  }

  /* The thin bar: one segment per ticked request, as wide as it took. */
  function paintSelectionChart(segments) {
    el.selectionBar.textContent = '';
    el.selectionLegend.textContent = '';
    segments.forEach((segment) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sel-seg sel-seg-${segment.type.toLowerCase()}${segment.failed ? ' is-failed' : ''}`;
      button.style.flexGrow = String(segment.duration);
      button.title = segmentTitle(segment, state.timeFormat);
      button.setAttribute('aria-label', segmentLabel(segment, state.timeFormat));
      button.addEventListener('click', () => showCall(segment.id));
      el.selectionBar.appendChild(button);
    });
    const types = segmentTypes(segments);
    types.forEach((type) => {
      const key = document.createElement('span');
      key.className = 'sel-key';
      const swatch = document.createElement('i');
      swatch.className = `sel-swatch sel-seg-${type.toLowerCase()}`;
      swatch.setAttribute('aria-hidden', 'true');
      key.append(swatch, document.createTextNode(TYPE_NAME[type]));
      el.selectionLegend.appendChild(key);
    });
    el.selectionLegend.hidden = !types.length;
    el.selectionChart.hidden = !segments.length;
  }

  /* The bar above the list: totals of the ticked calls and, under them, where
   * the time went. Redrawn only when the ticks or the ticked calls changed. */
  const selectionDraw = memoDraw(signatureOf, (signature, chosen) => {
    const parts = summaryParts(selectionSummary(chosen), state.timeFormat);
    drawnSelection.text = parts.map((part) => part.text).join('');
    el.selection.hidden = !parts.length;
    paintSelectionText(parts);
    paintSelectionChart(requestSegments(chosen));
  });

  function render() {
    if (!Features.has('calls.select')) return; // the bar is not in the Free markup
    selectionDraw.redraw(markedEntries());
  }

  function markChanged() {
    paintMarks();
    render();
  }

  /* Ticks or unticks one call; with Shift, everything from the call ticked last
   * to this one gets the same state. */
  function markCall(entry, shift) {
    const on = !state.marked.has(entry.id);
    const ids = shift && state.markAnchor !== null
      ? idsInRange(visibleEntries().map((visible) => visible.id), state.markAnchor, entry.id)
      : [entry.id];
    ids.forEach((id) => (on ? state.marked.add(id) : state.marked.delete(id)));
    state.markAnchor = entry.id;
    markChanged();
  }

  /* A chain's box ticks its hops (the ones the filters show), or clears them
   * when they are all ticked already. */
  function markChain(group) {
    const ids = visibleEntries().filter((entry) => group.hops.includes(entry.id)).map((entry) => entry.id);
    const on = !ids.every((id) => state.marked.has(id));
    ids.forEach((id) => (on ? state.marked.add(id) : state.marked.delete(id)));
    state.markAnchor = null;
    markChanged();
  }

  function markAllVisible(on) {
    visibleEntries().forEach((entry) => (on ? state.marked.add(entry.id) : state.marked.delete(entry.id)));
    state.markAnchor = null;
    markChanged();
  }

  function clearMarks() {
    state.marked.clear();
    state.markAnchor = null;
    markChanged();
  }

  return {
    markedEntries, markCall, markChain, markAllVisible, clearMarks, render,
    /* Other calls are ticked now: draw the bar again whatever it showed. */
    reset: () => selectionDraw.reset(),
    /* The sentence as plain text, for the Copy summary button: it leaves the
     * panel, so a name read from a call's input goes through Mask values. */
    text: () => (Mask.on()
      ? summaryParts(selectionSummary(markedEntries()), state.timeFormat, Mask.apply).map((part) => part.text).join('')
      : drawnSelection.text)
  };
}
