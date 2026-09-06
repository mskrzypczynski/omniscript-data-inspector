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
- **`src/ui/`** — DOM rendering and `chrome.devtools.*` wiring, one file per
  tab plus the shared scope bar and panel shell. Imports from `src/core/`
  freely; `src/core/` never imports from here.

One exception: the `hostScan` / `hostFetch` / `frameScan` functions in
`src/ui/targets.js` are shipped into the inspected page by stringifying them
(`chrome.devtools.inspectedWindow.eval`), so they stay fully self-contained —
no imports, no closures over anything outside their own body.

```sh
npm install
npm test          # Jest: core unit tests, jsdom UI tests, a boot/wiring test
npm run lint       # ESLint
npm run package    # zip the shipped files for the Chrome Web Store
```

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
