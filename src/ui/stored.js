'use strict';

/* The only module that touches chrome.storage: the few things the panel keeps
 * between DevTools sessions, in this browser's extension storage on this
 * computer: the tab order, that each tour was seen (the yes-or-no flags tourSeen,
 * tourSeenData, tourSeenStructure and tourSeenActions), the Mask values at start flag
 * (kept with Remember my settings on or off; unticking it deletes it), and,
 * only while Remember my settings is on, the settings and each script's watch
 * pins. What is valid is decided by the callers' core modules. */

/* The Mask values at start flag's own entry. */
export const MASK_AT_START_KEY = 'maskAtStart';

function area() {
  return chrome.storage.local;
}

export async function readStored(key) {
  const stored = await area().get(key);
  return stored[key];
}

export async function writeStored(key, value) {
  await area().set({ [key]: value });
}

export async function removeStored(key) {
  await area().remove(key);
}
