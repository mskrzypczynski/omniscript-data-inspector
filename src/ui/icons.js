'use strict';

/* Inline stroke icons, drawn on a 16x16 grid in the same style as the tab
 * icons in panel.html (round caps, currentColor), so they follow the theme and
 * the button's state. Defined once here: row buttons, toolbar buttons and the
 * detail panes all ask for them by name.
 *
 *   icon('copy')              -> a new <svg class="ui-icon"> element
 *   decorateButtons(root)     -> prepends the icon named in each [data-icon]
 *                                button, so panel.html only carries a name
 *   setLabel(button, text)    -> changes the button's label span, never its icon */

const SVG_NS = 'http://www.w3.org/2000/svg';

/* Each entry is a list of [tag, attributes] shapes. */
const P = (d) => ['path', { d }];
const C = (cx, cy, r, extra = {}) => ['circle', { cx, cy, r, ...extra }];
const R = (x, y, width, height, rx) => ['rect', { x, y, width, height, rx }];

const SHAPES = {
  copy: [R(5.5, 5.5, 8, 8, 1.6), P('M10.5 5.5V4.1c0-.9-.7-1.6-1.6-1.6H4.1c-.9 0-1.6.7-1.6 1.6v4.8c0 .9.7 1.6 1.6 1.6h1.4')],
  check: [P('M3.5 8.5l3 3 6-7')],
  /* A % sign: two rings and the slash between them (the %merge% field button). */
  percent: [C(4.8, 4.8, 1.7), C(11.2, 11.2, 1.7), P('M12 3.5l-8 9')],
  expand: [R(2.5, 2.5, 11, 11, 2), P('M8 5.5v5M5.5 8h5')],
  collapse: [R(2.5, 2.5, 11, 11, 2), P('M5.5 8h5')],
  eye: [P('M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z'), C(8, 8, 2)],
  bell: [P('M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8zM6.5 14.2h3')],
  'eye-off': [P('M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z'), C(8, 8, 2), P('M3 13L13 3')],
  data: [P('M5.5 2.5C4 2.5 4 3.5 4 5v1.2c0 .9-.6 1.6-1.5 1.8.9.2 1.5.9 1.5 1.8V11c0 1.5 0 2.5 1.5 2.5M10.5 2.5c1.5 0 1.5 1 1.5 2.5v1.2c0 .9.6 1.6 1.5 1.8-.9.2-1.5.9-1.5 1.8V11c0 1.5 0 2.5-1.5 2.5M6.8 6.8h2.4M6.8 9.2h2.4')],
  structure: [P('M3 3h4M3 3v10M5 8h4M5 13h4M3 8h2M3 13h2'), R(9, 6.5, 4.5, 3, .8), R(9, 11.5, 4.5, 3, .8), R(7, 1.5, 4.5, 3, .8)],
  refresh: [P('M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3')],
  /* Two arrows chasing each other: look again (Refresh is the single arrow). */
  rescan: [P('M2.8 7.3A5.4 5.4 0 0 1 12 4.6M13 2.2v2.7h-2.7M13.2 8.7A5.4 5.4 0 0 1 4 11.4M3 13.8v-2.7h2.7')],
  download: [P('M8 2.5v7M5 7l3 3 3-3M3 13h10')],
  bundle: [R(2.5, 5, 11, 8.5, 1.6), P('M5.5 5V3.5h5V5M2.5 8.5h11')],
  upload: [P('M8 10.5v-7M5 6l3-3 3 3M3 13h10')],
  inspect: [P('M13.5 7V4c0-.8-.7-1.5-1.5-1.5H4c-.8 0-1.5.7-1.5 1.5v8c0 .8.7 1.5 1.5 1.5h3M8 8l5.5 2.2-2.4 1-1 2.4z')],
  compare: [R(2.5, 3, 4.5, 10, 1), R(9, 3, 4.5, 10, 1)],
  clear: [C(8, 8, 5.5), P('M4.1 11.9l7.8-7.8')],
  /* Two bars: Pause, the action the Record button offers while it captures. */
  pause: [R(4.5, 3.5, 2.5, 9, .6), R(9, 3.5, 2.5, 9, .6)],
  /* A filled-looking triangle: Resume, where Record shows its dot. */
  play: [P('M5 3.5v9l7.5-4.5z')],
  target: [C(8, 8, 5.5), C(8, 8, 2)],
  crosshair: [C(8, 8, 3.5), P('M8 1.5v3.5M8 11v3.5M1.5 8H5M11 8h3.5')],
  'chevron-left': [P('M10 3.5L5.5 8l4.5 4.5')],
  'chevron-right': [P('M6 3.5L10.5 8 6 12.5')],
  /* An arrow pointing back: Previous step in the head of a step. */
  'arrow-left': [P('M13 8H3M7 4L3 8l4 4')],
  sliders: [P('M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6'), C(10, 5, 1.5), C(6, 11, 1.5)],
  /* A cog with eight teeth: the settings button. */
  gear: [P('M6.8 3.4L7.2 1.8L8.8 1.8L9.2 3.4L10.4 3.9L11.8 3.0L13.0 4.2L12.1 5.6L12.6 6.8L14.2 7.2L14.2 8.8L12.6 9.2L12.1 10.4L13.0 11.8L11.8 13.0L10.4 12.1L9.2 12.6L8.8 14.2L7.2 14.2L6.8 12.6L5.6 12.1L4.2 13.0L3.0 11.8L3.9 10.4L3.4 9.2L1.8 8.8L1.8 7.2L3.4 6.8L3.9 5.6L3.0 4.2L4.2 3.0L5.6 3.9z'), C(8, 8, 2)],
  /* Apex / code, and the braces of a bare JSON input. */
  code: [P('M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3l-2 10')],
  braces: [P('M6 2.5C4.5 2.5 4.5 3.5 4.5 5v1.2c0 .9-.6 1.6-1.5 1.8.9.2 1.5.9 1.5 1.8V11c0 1.5 0 2.5 1.5 2.5M10 2.5c1.5 0 1.5 1 1.5 2.5v1.2c0 .9.6 1.6 1.5 1.8-.9.2-1.5.9-1.5 1.8V11c0 1.5 0 2.5-1.5 2.5')],
  /* Tree / Raw / Sizes views, and the detail-pane tabs. */
  tree: [P('M3 3.5h4M5 8h5M7 12.5h5M5 3.5v4.5M7 8v4.5')],
  raw: [P('M3 3.5h10M3 6.5h10M3 9.5h7M3 12.5h5')],
  sizes: [P('M2.5 12.5h11M4 12.5V8M7 12.5V4M10 12.5V6.5M13 12.5V10')],
  value: [P('M2.5 3.5h8l3 3-3 3h-8z'), C(5.5, 6.5, 1)],
  /* A list with a tick on its second line: the options of a choice and the one held. */
  options: [P('M6.5 4h7M6.5 8h7M6.5 12h7M2.5 8.2l1.2 1.2 2-2.4'), C(3.4, 4, .6), C(3.4, 12, .6)],
  props: [P('M3 4h10M3 8h10M3 12h10'), C(6, 4, 1.3), C(10, 8, 1.3), C(7, 12, 1.3)],
  rules: [P('M4 2.5v11M4 5.5h5.5a2 2 0 0 1 2 2v1M4 10h7.5'), C(12, 10, 1.5), C(11.5, 5.5, 1.5)],
  validation: [P('M8 1.5l5.5 2v4.5c0 3-2.5 5-5.5 6.5C5 13 2.5 11 2.5 8V3.5zM5.5 8l2 2 3.5-4')],
  calls: [P('M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13')],
  definition: [P('M4 2.5h5.5l3 3V13.5H4zM9.5 2.5v3h3M6 8h4M6 10.5h4')],
  external: [P('M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5v3c0 .6-.4 1-1 1H3.5c-.6 0-1-.4-1-1V5c0-.6.4-1 1-1h3')],
  /* Bars of different lengths, one under the other: the Structure timeline. */
  timeline: [P('M2.5 4h6M5 8h8.5M3.5 12h5')],
  /* The Structure list: one family of marks and element kinds, drawn to be told
   * apart at 12 px. Progress: a tick (done), a solid dot (current), a dash (skipped). */
  dot: [C(8, 8, 3.2, { fill: 'currentColor' })],
  minus: [P('M4 8h8')],
  /* Row marks besides the eye and the branch glyph above: a warning triangle (a label is missing),
   * an unequal sign (the value does not fit the type) and a cube (a custom component draws it). */
  /* A diamond, as a flowchart draws a condition: an element with a show rule. */
  diamond: [P('M8 2l5.5 6L8 14 2.5 8z')],
  alert: [P('M8 2.5l6 10.5H2zM8 6.8v3M8 11.5v.2')],
  'not-equal': [P('M3.5 6h9M3.5 10h9M10 3L6 13')],
  component: [P('M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8zM2.5 4.8L8 8l5.5-3.2M8 8v6.2')],
  /* Element kinds: a window (step), brackets round a line (block), a text box with a
   * caret (input), a ticked box (choice), lines of text (display), a bolt (action),
   * a circled ! (validation), a dot (anything else); a custom component keeps `code`. */
  'el-step': [R(2.5, 3, 11, 10, 1.5), P('M2.5 6.2h11')],
  'el-block': [P('M5.5 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h1M10.5 3h1A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-1M6 8h4')],
  'el-input': [R(2, 4.5, 12, 7, 1.5), P('M5.5 6.8v2.4')],
  'el-choice': [R(2.5, 2.5, 11, 11, 2.5), P('M5.5 8.2l1.8 1.8 3.2-3.8')],
  'el-text': [P('M3 4h10M3 7.3h10M3 10.6h6.5')],
  'el-action': [P('M9 1.8L3.8 9h3.7l-1 5.2L12.2 7H8.5z')],
  'el-error': [C(8, 8, 5.5), P('M8 5v3.5M8 10.9v.1')],
  'el-other': [C(8, 8, 1.8, { fill: 'currentColor' })]
};

export const ICON_NAMES = Object.keys(SHAPES);

export function icon(name) {
  const shapes = SHAPES[name];
  if (!shapes) throw new Error(`Unknown icon: ${name}`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', `ui-icon ic-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  shapes.forEach(([tag, attrs]) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    svg.appendChild(node);
  });
  return svg;
}

/* A toolbar button's visible text lives in .btn-label so a narrow toolbar can
 * hide it (the icon and the title remain) without removing it from the
 * accessibility tree. */
function labelOf(button) {
  return button.querySelector ? button.querySelector(':scope > .btn-label') : null;
}

export function setLabel(button, text) {
  const label = labelOf(button);
  if (label) label.textContent = text; else button.textContent = text;
}

export function getLabel(button) {
  const label = labelOf(button);
  return label ? label.textContent : button.textContent;
}

/* Gives a [data-icon] button its icon and wraps its text in .btn-label (the
 * icon comes after the label with data-icon-end). Safe to run twice. */
export function decorateButton(button, name = button.dataset.icon, text = button.textContent.trim()) {
  if (!name || button.querySelector(':scope > .ui-icon')) return;
  button.textContent = '';
  const label = document.createElement('span');
  label.className = 'btn-label';
  label.textContent = text;
  if (button.hasAttribute('data-icon-end')) button.append(label, icon(name)); else button.append(icon(name), label);
  if (!button.title) button.title = text;
}

export function decorateButtons(root = document) {
  root.querySelectorAll('button[data-icon]').forEach((button) => decorateButton(button));
}
