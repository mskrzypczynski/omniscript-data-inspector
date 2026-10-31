'use strict';

/* The panel's text size: four steps, applied as a zoom on the whole page so
 * every tab scales together. Pure: which sizes exist, what each one means and
 * how the Ctrl/Cmd +, - and 0 keys move between them. */

export const TEXT_SIZES = Object.freeze(['S', 'M', 'L', 'XL']);
export const DEFAULT_TEXT_SIZE = 'M';

const ZOOM = Object.freeze({ S: 0.9, M: 1, L: 1.12, XL: 1.25 });

const NAMES = Object.freeze({ S: 'Small', M: 'Medium', L: 'Large', XL: 'Extra large' });

/* Anything that is not one of the four (an old or hand-edited stored value)
 * is the default. */
export function normalizeTextSize(value) {
  return TEXT_SIZES.includes(value) ? value : DEFAULT_TEXT_SIZE;
}

export const zoomOf = (size) => ZOOM[normalizeTextSize(size)];

export const textSizeName = (size) => NAMES[normalizeTextSize(size)];

/* What a key does to the current size: 'larger' and 'smaller' move one step
 * and stop at the ends, 'reset' goes back to the default. */
export function sizeAfterKey(size, action) {
  const at = TEXT_SIZES.indexOf(normalizeTextSize(size));
  if (action === 'reset') return DEFAULT_TEXT_SIZE;
  if (action === 'larger') return TEXT_SIZES[Math.min(at + 1, TEXT_SIZES.length - 1)];
  if (action === 'smaller') return TEXT_SIZES[Math.max(at - 1, 0)];
  return TEXT_SIZES[at];
}

/* Where a fixed-position box (a menu, a popover) goes under zoom. The pointer
 * and element rects are in screen pixels, but `left` and `top` are in the
 * zoomed page's own pixels, so they are divided by the zoom; the box's width
 * and height are in those pixels too, so they are multiplied back to check it
 * stays inside the view. x, y: the point in screen pixels. */
export function fixedPosition({ x, y, width, height, viewWidth, viewHeight, zoom = 1 }) {
  const z = zoom > 0 ? zoom : 1;
  const left = Math.max(0, Math.min(x, viewWidth - width * z - 2));
  const top = Math.max(0, Math.min(y, viewHeight - height * z - 2));
  return { left: left / z, top: top / z };
}
