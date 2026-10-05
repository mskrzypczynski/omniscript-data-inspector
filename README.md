# OmniScript Data Inspector

Unofficial developer tool. A Chrome DevTools panel for inspecting Salesforce
OmniStudio **OmniScripts** while you build and debug them:

- **Data** — the JSON the selected OmniScript is holding right now, re-read on a
  timer, with changed values highlighted.
- **Structure** — every element read from the definition and joined to the live
  data: type glyphs, visibility rules, validation, Set Errors, Set Values, and
  (for multi-language scripts) resolved custom labels with missing-label
  warnings.
- **Remote actions** — the Apex / Data Mapper / Integration Procedure calls the
  page makes, decoded, with input, output and options per call.

The tabs link to each other (Show in Data / in structure, a Calls tab per
element), explain why an element is hidden, mark and navigate changes, compare
payloads and calls, and can mask values before anything is copied or exported.
Press `?` in the panel for everything it does and the keyboard shortcuts.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/), or load unpacked:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick
   this folder.
2. Open a page running an OmniScript, open DevTools (`F12`), and select the
   **OmniScript** tab.

## Architecture

No build step: every file under `src/` is a native ES module (`import`/
`export`), loaded by one `<script type="module">` in `panel.html` — no
bundler, no transpiler, no runtime dependencies.

Two layers, one-directional:

- **`src/core/`** — pure domain logic (decoding remote-action payloads,
  reading an OmniScript's structure, formatting JSON tree rows). Plain
  functions on plain objects, no DOM, no `chrome.*`. Fully unit-tested.
- **`src/ui/`** — DOM rendering and `chrome.devtools.*` wiring. One entry file
  per tab (`data-tab.js`, `structure-tab.js`, `actions-tab.js`) owns that
  tab's state, polling and wiring; the pieces it draws live beside it in
  `src/ui/data/` and `src/ui/structure/` (watch strip, compare panel, row menu,
  element list, detail pane, …). Shared building blocks — the JSON tree
  (`json-tree-view.js`, `tree-window.js`, `tree-copy.js`), the scope bar
  (`targets.js`), panel shell, toast, context menu — sit at the top level.
  Imports from `src/core/` freely; `src/core/` never imports from here.

One exception: the `hostScan` / `hostFetch` / `frameScan` functions in
`src/ui/targets.js` are shipped into the inspected page by stringifying them
(`chrome.devtools.inspectedWindow.eval`), so they stay fully self-contained —
no imports, no closures over anything outside their own body.

```sh
npm install
npm test          # Jest: core unit tests, jsdom UI tests, a boot/wiring test
npm run lint       # ESLint
npm run package    # zip the shipped files for the Chrome Web Store
npm run bump -- minor   # bump manifest.json, package.json and the lockfile together
```

### Releasing

1. `npm run bump -- patch|minor|major`, then commit, `git tag vX.Y.Z` and
   `git push --follow-tags`.
2. The **Release** workflow checks the tag against the manifest, lints, tests,
   builds the zip and attaches it to a GitHub Release.
3. If the repository secrets `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN` are set, it also uploads the zip
   to the Chrome Web Store as a draft. Submit it for review in the dashboard, or
   run the workflow manually with *publish* ticked.
4. Check the [privacy policy](https://mskrzypczynski.github.io/omniscript-data-inspector/privacy.html)
   still matches before submitting.

CI (lint, tests, packaging) runs on every pull request.

## Permissions and privacy

This extension declares **no permissions and no host access**. It uses only the
DevTools APIs (`chrome.devtools.*`) that are available to any DevTools page.

- It reads the inspected page and its network traffic **only while DevTools is
  open**, and only to render the panel.
- It **does not** collect, store, or transmit any data. Nothing is sent to any
  server. There is no analytics or telemetry.
- Payloads shown in the panel may contain org data — the Save / Export buttons
  warn about this. Handle exported files accordingly.
- What it writes to the page: `window.__omniHosts` (an array of the host
  elements found) while scanning, and `window.$omni` + a call to the DevTools
  `inspect()` helper when you click **Reveal element**. It does not modify
  OmniScript data.

## Not affiliated with Salesforce

This is an independent, unofficial tool. It is not affiliated with, endorsed by,
or sponsored by Salesforce, Inc. "Salesforce", "OmniStudio" and "OmniScript" are
trademarks of Salesforce, Inc., used here only to describe what the tool works
with.

## Licence

[MIT](LICENSE).
