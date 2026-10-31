'use strict';

/* A redraw that does nothing when nothing it depends on has changed.
 *
 * A poll that finds the same data must not rebuild the DOM: a rebuild drops
 * focus, selection and scroll. So a view computes a cheap signature of what it
 * would draw, and draws only when that differs from the last one drawn.
 *
 *   const paint = memoDraw((rows) => rows.map((row) => row.id).join(), (signature, rows) => { ... });
 *   paint.redraw(rows);   // draws, or returns false when the signature is unchanged
 *   paint.reset();        // forget the last drawing: the next redraw draws
 *
 * The arguments of redraw() go to both functions; the draw function gets the
 * signature first. `initial` is a signature that counts as already drawn (for
 * a view that starts out showing nothing). */

const NEVER = Symbol('never drawn');

export function memoDraw(signatureFn, drawFn, initial = NEVER) {
  let drawn = initial;

  function redraw(...args) {
    const signature = signatureFn(...args);
    if (signature === drawn) return false;
    drawn = signature;
    drawFn(signature, ...args);
    return true;
  }

  function reset() {
    drawn = NEVER;
  }

  return { redraw, reset };
}
