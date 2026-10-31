'use strict';

/* The gates of the panel: features a build may or may not carry. The Free
 * build carries none. Code that draws or wires a gated feature asks the
 * registry first, and the modules of a build that carries a feature register
 * it here at start-up; Free code never imports them (lint). So a tab's code
 * is the same in every build, and in Free every gate is simply closed.
 *
 * Two questions, kept apart on purpose:
 *   has(name)  this build carries the feature (registered; Free: never);
 *   on(name)   it is carried and enabled right now. A carried feature can
 *              be switched off (lock()): has() stays true, so the controls
 *              stay where they are, and on() turns false, so they are
 *              disabled. Free code draws by has(); a feature's own module
 *              enables by on(). */

/* One entry per gate: the name the code uses, the tab it belongs to and a
 * short label that says what the feature is. */
export const GATES = Object.freeze([
  { name: 'shell.compare-json', tab: 'common', label: 'Compare JSON' },
  { name: 'shell.bundle', tab: 'common', label: 'Save and open debug bundles' },
  { name: 'data.changes', tab: 'data', label: 'Track changes, the change log and Where is this set?' },
  { name: 'data.compare', tab: 'data', label: 'Compare data' },
  { name: 'data.watch', tab: 'data', label: 'Watch list and watch expressions' },
  { name: 'data.sizes', tab: 'data', label: 'Sizes and unused keys' },
  { name: 'data.query', tab: 'data', label: '$ queries in the filter' },
  { name: 'structure.timeline', tab: 'structure', label: 'Timeline and step timing' },
  { name: 'structure.steps', tab: 'structure', label: 'Go to an earlier step, Collapse done steps, May stop Next count' },
  { name: 'structure.problems', tab: 'structure', label: 'Problems' },
  { name: 'structure.whatif', tab: 'structure', label: 'What if' },
  { name: 'structure.compare-definition', tab: 'structure', label: 'Compare definition' },
  { name: 'structure.export', tab: 'structure', label: 'Export' },
  { name: 'structure.references', tab: 'structure', label: 'Depends on / Used by / Written by, Actions only' },
  { name: 'calls.test', tab: 'actions', label: 'Test calls' },
  { name: 'calls.debug', tab: 'actions', label: 'Debug runs' },
  { name: 'calls.changes', tab: 'actions', label: 'Data changes after a call' },
  { name: 'calls.compare', tab: 'actions', label: 'Compare two calls' },
  { name: 'calls.select', tab: 'actions', label: 'Select calls and add up their time' },
  { name: 'calls.analysis', tab: 'actions', label: 'Slow calls, oversized input, All Apex calls' },
  { name: 'calls.apex', tab: 'actions', label: 'Copy as Apex' }
].map(Object.freeze));

const GATE_NAMES = new Set(GATES.map((gate) => gate.name));

export function isGate(name) {
  return GATE_NAMES.has(name);
}

/* The gates of one tab ('common' for the shell), in the order above. */
export function gatesOf(tab) {
  return GATES.filter((gate) => gate.tab === tab);
}

/* A registry: what the build registered, whether it is enabled right now,
 * and the mount points the tabs offer. A module is
 *   { mount?: { [point]: (context) => void }, help?: { [tab]: [[title, text], ...] } }
 * and a gate may be registered without a module when it has nothing to mount
 * (a feature the tab draws by itself once has() is true). Registering an
 * unknown gate is a programming error, so it throws and names the gates. */
export function createFeatureRegistry() {
  const modules = new Map();
  let locked = false;

  function register(name, module = {}) {
    if (!isGate(name)) throw new Error(`Unknown feature gate "${name}". The gates are: ${[...GATE_NAMES].join(', ')}.`);
    modules.set(name, module);
  }

  const has = (name) => modules.has(name);
  const on = (name) => !locked && modules.has(name);

  /* Calls every registered module that offers the point, in registration
   * order, with the tab's context. A tab calls this at the end of its own
   * mount(); in Free nothing is registered and nothing happens. */
  function mount(point, context) {
    let count = 0;
    modules.forEach((module) => {
      const fn = module.mount && module.mount[point];
      if (typeof fn === 'function') { fn(context); count++; }
    });
    return count;
  }

  /* The help entries the registered modules add to a tab's help. */
  function help(tab) {
    const entries = [];
    modules.forEach((module) => {
      if (module.help && Array.isArray(module.help[tab])) entries.push(...module.help[tab]);
    });
    return entries;
  }

  return Object.freeze({
    register,
    has,
    on,
    mount,
    help,
    lock() { locked = true; },
    unlock() { locked = false; },
    locked: () => locked,
    registered: () => [...modules.keys()]
  });
}
