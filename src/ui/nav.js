'use strict';

/* Jumping between tabs. The Data and Structure tabs describe the same script
 * but must not import each other (they would form a cycle through the shell),
 * so each registers a handler here and the shell registers how to switch tab.
 *
 *   Nav.go('data', { segments })       // Structure → Data
 *   Nav.go('structure', { segments })  // Data → Structure
 *
 * `segments` is a key list from the payload root, see src/core/path-links.js. */

let switchTab = () => {};
const handlers = {};

export const Nav = {
  setTabSwitcher(fn) { switchTab = fn; },
  on(tab, handler) { handlers[tab] = handler; },
  go(tab, request) {
    switchTab(tab);
    if (handlers[tab]) handlers[tab](request);
  }
};
