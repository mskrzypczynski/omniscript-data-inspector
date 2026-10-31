'use strict';

import { existsSync } from 'node:fs';
import js from '@eslint/js';
import globals from 'globals';

/* Encodes the one architectural rule this project actually enforces:
 * src/core/** may not reach for the DOM or chrome.*. Everything else here is
 * ES2023 + browser/extension globals — nothing this project bundles or
 * transpiles, so the lint rules only need to describe what already runs. */
const DOM_AND_CHROME_GLOBALS = ['document', 'window', 'chrome', 'navigator', 'localStorage', 'sessionStorage'];

/* eslint.extra.js, where this tree has it, adds the rules of folders that only
 * that tree has: { forbiddenImports: patterns of no-restricted-imports that
 * every module outside those folders obeys, configs: more config objects }. */
const EXTRA_FILE = new URL('./eslint.extra.js', import.meta.url);
const EXTRA = existsSync(EXTRA_FILE) ? (await import(EXTRA_FILE.href)).default : { forbiddenImports: [], configs: [] };

export default [
  js.configs.recommended,

  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**', '*.zip', '.*/**']
  },

  /* src/kit/ is the shared kit, copied in by its sync and checked by
   * npm run kit:check; it follows the same two layers as src/. */
  {
    files: ['src/kit/ui/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions }
    }
  },

  {
    files: ['src/kit/core/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { URL: 'readonly', URLSearchParams: 'readonly' }
    },
    rules: {
      'no-restricted-globals': ['error', ...DOM_AND_CHROME_GLOBALS.map((name) => ({
        name,
        message: `kit/core/ modules must stay pure — no ${name}.`
      }))]
    }
  },

  {
    files: ['src/ui/**/*.js', 'devtools.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions }
    }
  },

  {
    files: ['src/core/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      /* URL/URLSearchParams are WHATWG globals, not DOM or chrome.* — both the
       * browser and Node provide them identically, so using them here does not
       * compromise purity. */
      globals: { URL: 'readonly', URLSearchParams: 'readonly' }
    },
    rules: {
      /* The rule the rest of CONTRIBUTING.md's architecture depends on: a core
       * module that reaches for the DOM or the extension APIs has stopped
       * being pure, and every caller's "it's just a function" assumption
       * breaks. no-undef catches this for free once no browser globals are
       * declared above, but restricted-globals gives a message that says why. */
      'no-restricted-globals': ['error', ...DOM_AND_CHROME_GLOBALS.map((name) => ({
        name,
        message: `core/ modules must stay pure — no ${name}. DOM/chrome.* access belongs in src/ui/.`
      }))]
    }
  },

  /* Inside core/, shared/ holds what more than one tab reads and imports only
   * itself; each tab's folder may import shared/ and itself, never another tab. */
  ...['shared', 'data', 'structure', 'actions'].map((area) => ({
    files: [`src/core/${area}/**/*.js`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['shared', 'data', 'structure', 'actions']
          .filter((other) => other !== area && other !== 'shared')
          .map((other) => ({
            group: [`../${other}/*`],
            message: `core/${area}/ may not import core/${other}/. Move what both need to core/shared/.`
          }))
          .concat(EXTRA.forbiddenImports)
      }]
    }
  })),

  /* What sits directly under src/core/ (the tab folders have the rule above),
   * the UI and the kit obey the imports eslint.extra.js forbids too. */
  ...(EXTRA.forbiddenImports.length ? [{
    files: ['src/ui/**/*.js', 'devtools.js', 'src/core/*.js', 'src/kit/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: EXTRA.forbiddenImports }] }
  }] : []),

  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest, ...globals.browser }
    }
  },

  {
    files: ['*.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    }
  },

  {
    /* Runs in Node but stringifies page-side code (the chrome.devtools stub and
     * the scene helpers) into a browser, so both sets of globals apply. */
    files: ['scripts/screenshots.mjs', 'scripts/marketing.mjs', 'scripts/a11y-check.mjs', 'scripts/demo-bundle.mjs', 'scripts/lib/demo-panel.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },

  ...EXTRA.configs
];
