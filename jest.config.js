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
      displayName: 'wiring',
      transform: {},
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/test/wiring.test.js']
    }
  ]
};
