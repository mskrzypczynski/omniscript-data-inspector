'use strict';

/* The latest raw payload read per (host, property), shared by every tab so a
 * second tab asking within a moment, or the page answering "unchanged",
 * reuses the string instead of pulling it across the bridge again.
 *
 * Holds strings only; no DOM and no chrome.*. Targets owns the instance and
 * clears it whenever host indices or properties can have shifted. */

const MAX_ENTRIES = 8;

export function createPayloadFeed(now = () => Date.now()) {
  const entries = new Map();

  return {
    get: (key) => entries.get(key) || null,

    /* entry: { value, sig, peek }. Keeps the newest MAX_ENTRIES. */
    put(key, entry) {
      entries.delete(key);
      const at = now();
      entries.set(key, { ...entry, at, peekAt: entry.peek !== undefined ? at : 0 });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
    },

    /* The page confirmed the entry is still current. */
    touch(key, peek) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.at = now();
      /* A confirmation that carried no peek leaves the old one as it was, and
       * as old as it was. */
      if (peek !== undefined) { entry.peek = peek; entry.peekAt = entry.at; }
    },

    /* Is the entry younger than maxAge ms? With withPeek, its peek must be
     * that young too: the payload string can stay the same while the field
     * peeked from another property moves. */
    fresh: (key, maxAge, withPeek = false) => {
      const entry = entries.get(key);
      if (!entry) return false;
      return now() - (withPeek ? entry.peekAt : entry.at) < maxAge;
    },

    drop: (key) => { entries.delete(key); },
    clear: () => entries.clear()
  };
}
