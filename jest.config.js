'use strict';

/* Jest runs the shipped ES modules natively — no Babel, no transpilation, so
 * the code under test is byte-for-byte the code that ships (same guarantee
 * test/helpers/load.js used to provide with a vm sandbox, now for free from
 * real `import`). That needs Node's `--experimental-vm-modules` flag, which
 * both npm scripts in package.json pass.
 *
 * src/core/** is pure — no DOM — so it runs under the plain "node" test
 * environment. src/ui/** touches the DOM, so it needs jsdom. Splitting the
 * environment by path keeps the fast, DOM-free suite fast. */
export default {
  transform: {},
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  /* A worker's heap grows across the files it runs (native ESM keeps each
   * file's module graph alive) and reaches Node's 2 GB default near the end
   * of the suite, killing the file it is on. Recycling a worker that comes
   * back from a file above this size, and giving workers more room than the
   * default (the test script sets --max-old-space-size through NODE_OPTIONS),
   * keeps every run under the limit. */
  workerIdleMemoryLimit: '600MB',
  projects: [
    {
      displayName: 'core',
      transform: {},
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/core/**/*.test.js']
    },
    {
      displayName: 'ui',
      transform: {},
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/test/ui/**/*.test.js']
    },
    {
      displayName: 'scripts',
      transform: {},
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/scripts/**/*.test.js']
    },
    {
      displayName: 'wiring',
      transform: {},
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/test/wiring.test.js']
    }
  ]
};
