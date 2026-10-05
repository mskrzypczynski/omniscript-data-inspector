'use strict';

/* What the Structure and Remote actions tabs know about each other, without
 * either importing the other: the script's elements (set by Structure when it
 * loads the definition) and the captured calls (set by Remote actions).
 * Read-only for everyone but the owner. */

let elements = [];
let calls = () => [];
let loader = (done) => done();

export const Shared = {
  setElements(next) { elements = next; },
  elements: () => elements,
  setCalls(getter) { calls = getter; },
  calls: () => calls(),
  /* Structure registers how to load the definition even while its tab is not
   * on screen; done runs once elements are available (possibly still empty). */
  setLoader(fn) { loader = fn; },
  ensureElements(done) { if (elements.length) done(); else loader(done); }
};
