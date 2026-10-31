'use strict';

/* Performance budgets, run on their own (npm run test:perf) so that npm test
 * stays quick and does not depend on how fast the machine is. The files are
 * test/perf/*.perf.js; the thresholds are generous on purpose: they catch a
 * change that makes a big payload or a long call list ten times slower, not a
 * few percent. PERF_BUDGET_MS overrides the 10 s default. */
export default {
  transform: {},
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/perf/**/*.perf.js'],
  testTimeout: 60000
};
