'use strict';

/* The status bar at the foot of the panel. Every tab shows its own status
 * there, so this is the one module that writes to it: tabs hand over text or
 * nodes and never reach for its elements themselves. Both sides are cut with
 * an ellipsis when they do not fit, so each also carries its full text as its
 * tooltip. */

const part = (id) => document.getElementById(id);

/* A note a tab asked for (such as "1,800 rows, drawn a window at a time"),
 * added to the left side's tooltip. */
let leftTitle = '';

/* The selected script, named at the end of the left side on every tab, so
 * scripts can be told apart whichever tab is on screen. The tab's own text
 * (its counts) comes first and keeps its room: the name has a width of its own
 * (see .status-script) and is cut with its own ellipsis. A tab that already
 * names the script itself is left alone. What a tab last asked for is kept, so
 * a change of script repaints without the tab. */
let scriptName = '';
let leftContent = '';

const asList = (content) => (Array.isArray(content) ? content : [content]).filter((item) => item !== null && item !== undefined && item !== '');

function fill(node, content) {
  if (!node) return;
  node.textContent = '';
  asList(content).forEach((item) => {
    node.appendChild(typeof item === 'string' ? document.createTextNode(item) : item);
  });
}

function paintLeft() {
  const node = part('status-left');
  if (!node) return;
  const items = asList(leftContent);
  const text = items.map((item) => (typeof item === 'string' ? item : item.textContent)).join('');
  const tail = [];
  if (scriptName && !text.includes(scriptName)) {
    const bold = document.createElement('b');
    bold.className = 'status-script';
    bold.textContent = scriptName;
    if (items.length) tail.push(' · ');
    tail.push(bold);
  }
  fill(node, [...items, ...tail]);
}

/* The full text, so what the ellipsis cuts is one hover away. */
function paintTitles() {
  const left = part('status-left');
  const right = part('status-right');
  if (left) left.title = [left.textContent.trim(), leftTitle].filter(Boolean).join('\n');
  if (right) right.title = right.textContent.trim();
}

export const StatusLine = {
  /* left / right: a string, a node, or a list of them. */
  set(left, right) {
    leftContent = left;
    paintLeft();
    fill(part('status-right'), right);
    paintTitles();
  },
  left(content) { leftContent = content; paintLeft(); paintTitles(); },
  /* The selected script's name ('' for none); repaints the left side only when it changed. */
  script(name) {
    const next = name || '';
    if (next === scriptName) return;
    scriptName = next;
    paintLeft();
    paintTitles();
  },
  right(content) { fill(part('status-right'), content); paintTitles(); },
  /* An extra tooltip on the left side, '' to go back to its own text. */
  title(text) {
    leftTitle = text || '';
    paintTitles();
  }
};
