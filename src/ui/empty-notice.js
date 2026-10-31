'use strict';

/* The card the Data and Actions tabs draw in a list's place when a filter lets
 * nothing through. */

/* The longest filter text the no-match card quotes. */
const QUOTE_LIMIT = 40;

/* What a tab draws in its list's place when the filter lets nothing through:
 * one line, “No <things> match “<query>””, with a real Clear filter button
 * beside it. `things` is the plural noun ("rows", "calls"); `query` the text
 * typed (an empty one says "No <things> to show"); `onClear` empties the
 * filter (without it there is no button, for a state a button cannot fix). */
export function noMatchNotice({ things, query = '', onClear = null, hint = '' }) {
  const typed = String(query).trim();
  const quoted = typed.length > QUOTE_LIMIT ? `${typed.slice(0, QUOTE_LIMIT)}…` : typed;

  const box = document.createElement('div');
  box.className = 'notice is-one-line no-match-card';
  box.setAttribute('role', 'status');
  // What else the filter box takes (a tab's prefixes), for whoever hovers the card.
  if (hint) box.title = hint;

  const text = document.createElement('span');
  text.textContent = typed ? `No ${things} match “${quoted}”` : `No ${things} to show`;
  box.appendChild(text);

  if (typeof onClear === 'function') {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'icon-btn tiny';
    clear.textContent = 'Clear filter';
    clear.title = 'Empty the filter box';
    clear.setAttribute('data-help', 'Filter');
    clear.addEventListener('click', onClear);
    box.appendChild(clear);
  }
  return box;
}
