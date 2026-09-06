'use strict';

import js from '@eslint/js';
import globals from 'globals';

/* Encodes the one architectural rule this project actually enforces:
 * src/core/** may not reach for the DOM or chrome.*. Everything else here is
 * ES2023 + browser/extension globals — nothing this project bundles or
 * transpiles, so the lint rules only need to describe what already runs. */
const DOM_AND_CHROME_GLOBALS = ['document', 'window', 'chrome', 'navigator', 'localStorage', 'sessionStorage'];

export default [
  js.configs.recommended,

  {
    ignores: ['node_modules/**', 'coverage/**', '*.zip']
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
      /* The rule the rest of CLAUDE.md's architecture depends on: a core
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
  }
];
