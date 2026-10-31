'use strict';

/* What the tabs know about each other, without any of them importing another:
 * the script's elements (set by Structure when it loads the definition), the
 * current step (Structure), the payload and its history (Data) and the
 * captured calls (Calls). Read-only for everyone but the owner. */

let elements = [];
let calls = () => [];
let onlyOmni = () => true;
let loader = (done) => done();
let payload = () => ({ prop: '', raw: null, data: undefined, history: [] });
let step = () => null;
const dumps = {};

export const Shared = {
  setElements(next) { elements = next; },
  elements: () => elements,
  setCalls(getter) { calls = getter; },
  calls: () => calls(),
  /* Whether the Calls list is showing OmniStudio's calls only (All
   * calls off): the tab's live state, which Clear filter can change without
   * touching the stored setting. The bundle and the report follow the list. */
  setOnlyOmni(getter) { onlyOmni = getter; },
  onlyOmni: () => onlyOmni(),
  /* Structure registers how to load the definition even while its tab is not
   * on screen; done runs once elements are available (possibly still empty). */
  setLoader(fn) { loader = fn; },
  ensureElements(done) { if (elements.length) done(); else loader(done); },
  /* Data: { prop, raw, data, history: [{ raw, time, step? }] }, the history
   * being the panel-wide one (payload-history.js), oldest first. */
  setPayload(getter) { payload = getter; },
  payload: () => payload(),
  /* Structure: { key, name, asIndex, visits: [{ key, name, from, to }] } for
   * the step the script is on, or null when unknown. `visits` is the step
   * timeline, oldest first; `to` is null for the step still open. */
  setStep(getter) { step = getter; },
  step: () => step(),
  /* Each tab registers what it shows, for the debug bundle: a plain object
   * from (mask) => ..., where mask is the value filter in force (Mask values
   * or identity). The getter decides what to mask: org data yes, the names
   * and structure of the script no. */
  setDump(tab, getter) { dumps[tab] = getter; },
  dumps(mask) {
    const out = {};
    Object.keys(dumps).forEach((tab) => {
      try { out[tab] = dumps[tab](mask); } catch (error) { out[tab] = { error: String(error && error.message || error) }; }
    });
    return out;
  }
};
