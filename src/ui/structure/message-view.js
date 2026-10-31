'use strict';

/* Message text that is a formula, drawn for the detail pane: what it comes to,
 * marked ≈ with a tooltip, and the raw formula in a small fold under it. Plain
 * text is drawn as before. Every decision (what the formula comes to, where a
 * language came from) is core/structure/message-text.js; only DOM here.
 *
 * `formulaOpen` is the tab's Set of formulas the user opened, so a redraw keeps
 * a fold open. */

import { icon as svgIcon } from '../icons.js';
import { TAGS } from '../../core/structure/fact-words.js';
import { tagNode, unknownNode } from './fact-card.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* The fold: "formula" (or `label`) opens the raw text. Open or closed is the user's choice and survives redraws. */
export function formulaFold(raw, note, formulaOpen, label = 'formula') {
  const details = document.createElement('details');
  details.className = 'msg-formula';
  details.open = formulaOpen.has(raw);
  const summary = document.createElement('summary');
  summary.appendChild(svgIcon('chevron-right')); // the same chevron as the Rule card's header
  summary.appendChild(document.createTextNode(label));
  summary.title = 'The message as written in the definition';
  details.appendChild(summary);
  const code = el('code', 'msg-formula-raw', raw);
  if (note) code.title = note;
  details.appendChild(code);
  details.addEventListener('toggle', () => {
    if (details.open) formulaOpen.add(raw); else formulaOpen.delete(raw);
  });
  return details;
}

/* Puts the message into `parent`: “text” for plain text, for a formula what it
 * comes to: "estimated “text”" in a sentence, ≈ “text” in a compact table cell
 * (`compact`; the tooltip says what ≈ means either way). Returns the fold to put
 * after the line, or null for plain text. `describe(text)` is describeMessage
 * bound to the live data and the language. */
export function appendMessageText(parent, text, describe, formulaOpen, { compact = false } = {}) {
  const described = describe(text);
  if (!described.formula) {
    parent.appendChild(document.createTextNode(`“${text}”`));
    return null;
  }
  const shown = el('span', 'msg-estimate', compact ? described.cell : described.line);
  shown.title = described.note;
  parent.appendChild(shown);
  return formulaFold(described.raw, described.note, formulaOpen);
}

/* A message on a fact card: what it comes to, then the "estimated ≈" tag and a
 * "Message formula" fold for a formula; the text itself for plain text. Returns
 * { nodes, formula } where `formula` is describeMessage()'s result for a formula
 * (null for plain text), so a copy can leave out what came from the data. */
export function messageFact(text, describe, formulaOpen) {
  const described = describe(text);
  if (!described.formula) {
    const plain = el('span', 'fc-prose', text);
    return { nodes: [plain], formula: null };
  }
  const nodes = [];
  if (described.ok) nodes.push(el('span', 'fc-prose', described.text));
  else nodes.push(unknownNode(described.text));
  const tag = tagNode(TAGS.estimated);
  if (described.note) tag.title = described.note;
  nodes.push(tag);
  const fold = formulaFold(described.raw, described.note, formulaOpen, 'Message formula');
  fold.classList.add('fc-fold');
  nodes.push(fold);
  return { nodes, formula: described };
}
