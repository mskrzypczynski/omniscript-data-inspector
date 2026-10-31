'use strict';

/* Screen-reader announcements for the status bar. The visible bar changes on
 * every poll (clock time, byte size, line counts), and a live region on it
 * would read all of that out once a second. Instead the bar itself is silent
 * and this mirrors it into a hidden polite region, but only when the text
 * differs after the fast-moving parts are removed. */

import { memoDraw } from './memo-draw.js';

const DEBOUNCE_MS = 600;

/* The text of a status element without its quiet parts (data-quiet), which
 * the tab marks structurally, whatever the locale formats them like. */
function announcedText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1 || node.hasAttribute('data-quiet')) return '';
  return Array.from(node.childNodes).map(announcedText).join('');
}

/* Strips what churns while nothing meaningful happens. */
function stableStatus(text) {
  return text
    .replace(/\s*·\s*\d+ value\(s\) updated/g, '')
    .replace(/\s*·\s*[\d.]+ (B|KB|MB)\b/g, '')
    .replace(/\s*·\s*\d+ lines\b/g, '')
    .replace(/\s*·\s*asIndex \d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mountLiveStatus(live, sources) {
  let timer = null;

  /* The announcement is its own signature: a repeat of it is not read again. */
  const announce = memoDraw(
    () => stableStatus(sources.map(announcedText).join(' · ')),
    (next) => { live.textContent = next; },
    ''
  );

  function sync() {
    timer = null;
    announce.redraw();
  }

  const schedule = () => {
    if (timer === null) timer = setTimeout(sync, DEBOUNCE_MS);
  };

  const observer = new MutationObserver(schedule);
  sources.forEach((source) => observer.observe(source, { childList: true, characterData: true, subtree: true }));
  return { flush: sync, disconnect: () => observer.disconnect() };
}
