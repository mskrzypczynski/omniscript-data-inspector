'use strict';

/* The time a step may take, in milliseconds. Generous: see jest.perf.config.js. */
export const BUDGET_MS = Number(process.env.PERF_BUDGET_MS) || 10000;

/* Runs `step` and returns how long it took. */
export async function timed(step) {
  const started = performance.now();
  await step();
  return performance.now() - started;
}
