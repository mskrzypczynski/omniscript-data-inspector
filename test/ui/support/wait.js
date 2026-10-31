'use strict';

/* Wait for something that happens on a real timer (a debounce, a FileReader),
 * by looking for the condition instead of guessing a delay, so a loaded machine
 * cannot make a test flake. Gives up after `timeout` ms and returns false; the
 * assertion that follows then reports what was missing. */
export async function until(condition, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return !!condition();
}
