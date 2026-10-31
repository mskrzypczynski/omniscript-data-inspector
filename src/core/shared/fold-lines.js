'use strict';

/* Folding a long multi-line text (a pretty-printed value) to its first lines.
 *
 * Pure: no DOM, no chrome.* */

/* The number of lines in `text`. */
export function lineCount(text) {
  let count = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) count++;
  return count;
}

/* The offset where the first `max` lines of `text` end (just before the
 * newline that follows them), or the text's length when it has no more lines
 * than that. */
export function lineCut(text, max) {
  let at = -1;
  for (let line = 0; line < max; line++) {
    at = text.indexOf('\n', at + 1);
    if (at === -1) return text.length;
  }
  return at;
}
