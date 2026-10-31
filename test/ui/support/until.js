'use strict';

/* Wait for a condition instead of for a fixed time: a fixed delay is too long
 * when the machine is quick and too short when it is not, and either way hides
 * what the test is waiting for. Polls every few milliseconds on real timers;
 * fails with the name of what it waited for. */

export async function until(predicate, { timeout = 3000, what = 'the condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
