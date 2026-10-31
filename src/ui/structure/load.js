'use strict';

/* The Structure tab's retrieval: reading the definition, its script header and
 * the data from the page, building the elements from them, and noticing that
 * the definition changed under a running tab (editing in the Designer). The
 * tab owns the state; this fills it and says when to redraw. */

import { flatten, parseObj } from '../../core/shared/structure-model.js';
import { scriptIdentity } from '../../core/shared/script-identity.js';
import { structureSignature, remapKeys, remapSet } from '../../core/structure/definition-change.js';
import { rootOf } from '../../core/structure/script-summary.js';
import { Targets } from '../targets.js';
import { Shared } from '../shared.js';

/* Editing in the Designer changes the definition under a running tab. Every
 * third pulse (about six seconds) the definition is read again; the page
 * answers "unchanged" from its hash when nothing was edited. */
const DEFINITION_EVERY = 3;

/* The chosen repeat rows, carried over to the new keys. */
function remapRows(chosen, moved) {
  const out = {};
  Object.keys(chosen).forEach((key) => { if (moved.has(key)) out[moved.get(key)] = chosen[key]; });
  return out;
}

/* state: the tab's state. render(): a full redraw. applyPendingReveal() and
 * followStep(): what the tab does once the elements are in. */
export function createLoader({ state, render, applyPendingReveal, followStep }) {
  /* Callbacks waiting for the next load to finish, however it ends. */
  const afterLoad = [];

  function finishLoad() {
    Shared.setElements(state.elements);
    afterLoad.splice(0).forEach((done) => done());
  }

  /* Which load is the newest. A load is three reads in a row; when the selection
   * changes in the middle, an older one may still finish after the newer one and
   * would mix two definitions, so every callback of an older load returns
   * without touching anything. */
  let loadGeneration = 0;

  /* The script the elements were read from, to tell "the same script with a host
   * added or removed around it" from a different one. */
  let loadedScript = null;

  function failLoad(message) {
    state.elements = [];
    state.problems = [];
    state.error = message;
    render();
    finishLoad();
  }

  /* Puts a new element list in place of the old one, keeping the selection, the
   * folds and the visits on the elements that are still there. Used by both a
   * full load and a definition change noticed while polling. */
  function adoptElements(next) {
    const moved = remapKeys(state.elements, next);
    state.elements = next;
    state.rowsChosen = remapRows(state.rowsChosen, moved);
    state.selectedKey = moved.get(state.selectedKey) || null;
    state.followedKey = moved.get(state.followedKey) || null;
    state.collapsed = remapSet(state.collapsed, moved);
    state.autoFolded = remapSet(state.autoFolded, moved);
    state.handFolded = remapSet(state.handFolded, moved);
    state.visits = state.visits.map((visit) => ({ ...visit, key: moved.get(visit.key) || visit.key }));
  }

  function load() {
    const generation = ++loadGeneration;
    const stale = () => generation !== loadGeneration;
    loadedScript = scriptIdentity(Targets.selected());
    state.defRaw = null;
    state.defSignature = '';

    if (!Targets.selected()) {
      state.elements = [];
      state.problems = [];
      state.error = null;
      render();
      finishLoad();
      return;
    }

    Targets.fetch(state.defProp, (definitionRaw, error) => {
      if (stale()) return;
      if (error) {
        failLoad(error.value || error.description || error.error || 'The definition could not be read.');
        return;
      }

      state.error = null;

      if (!definitionRaw) {
        state.elements = [];
        state.problems = [];
        render();
        finishLoad();
        return;
      }

      let definition;
      try {
        definition = JSON.parse(definitionRaw);
      } catch (e) {
        failLoad(`The definition is not valid JSON: ${e.message}`);
        return;
      }

      state.activeIndex = typeof definition.asIndex === 'number' ? definition.asIndex : null;
      state.root = rootOf(definition);

      /* scriptHeaderDef is a sibling property: allCustomLabels resolves label
       * text, labelMap gives each element's JSONPath. Optional — the tab works
       * without it. */
      Targets.fetch('scriptHeaderDef', (headerRaw) => {
        if (stale()) return;
        state.header = parseObj(headerRaw);

        try {
          adoptElements(flatten(definition, state.header));
        } catch (e) {
          state.elements = [];
          state.problems = [];
          state.error = `Could not read the definition: ${e.message}`;
        }
        state.defRaw = definitionRaw;
        state.defSignature = structureSignature(state.elements);

        Targets.fetch(state.dataProp, (raw, dataError) => {
          if (stale()) return;
          /* A failed read (or text that does not parse) keeps the last good
           * data, as the pulse does, instead of blanking every value. */
          if (!dataError) {
            state.dataRaw = raw || null;
            state.dataParseError = false;
            try {
              state.data = raw ? JSON.parse(raw) : undefined;
            } catch {
              state.dataParseError = true;
            }
          }
          render();
          finishLoad();
          applyPendingReveal();
          if (state.follow && !state.selectedKey) followStep();
        });
      });
    });
  }

  /* Replaces the elements only when their structure differs, keeping the
   * selection and the folds on the elements that are still there. */
  function applyDefinition(raw, definition, header) {
    let next;
    try {
      next = flatten(definition, header);
    } catch {
      return;
    }
    state.defRaw = raw;
    state.header = header;
    state.root = rootOf(definition);
    const signature = structureSignature(next);
    if (signature === state.defSignature && !state.error) return;

    adoptElements(next);
    state.defSignature = signature;
    state.error = null;
    if (typeof definition.asIndex === 'number') state.activeIndex = definition.asIndex;

    Shared.setElements(next);
    render();
    if (state.follow && !state.selectedKey) followStep();
  }

  function checkDefinition(done) {
    const generation = loadGeneration;
    Targets.fetch(state.defProp, (raw, error) => {
      /* The text also changes while the script merely runs (asIndex, bShow):
       * only a changed structure is worth a redraw, decided in applyDefinition. */
      if (error || !raw || raw === state.defRaw || generation !== loadGeneration) { done(); return; }
      let definition;
      try {
        definition = JSON.parse(raw);
      } catch {
        done(); // half-saved text: keep what is shown until it parses
        return;
      }
      Targets.fetch('scriptHeaderDef', (headerRaw) => {
        if (generation === loadGeneration) applyDefinition(raw, definition, parseObj(headerRaw) || state.header);
        done();
      });
    });
  }

  let pulseCount = 0;

  /* Called at the end of every pulse of the step tracker. */
  function afterPulse(done) {
    if (++pulseCount % DEFINITION_EVERY !== 0) { done(); return; }
    checkDefinition(done);
  }

  return {
    load,
    afterPulse,
    /* For the other tabs, which ask for the elements: run `done` once the next load ends. */
    whenLoaded: (done) => { afterLoad.push(done); load(); },
    loadedScript: () => loadedScript
  };
}
