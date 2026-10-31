'use strict';

/* scripts/lib/flavour.mjs of this tree: the Free build is the tree as it is,
 * and another browser gets a copy with its own manifest. */

import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FLAVOURS, FREE_ENTRY, GATE_REGISTER, GECKO_IDS, freeHtml, freePanelHtml, treeFlavour, writeBuildTree } from '../../scripts/lib/flavour.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

describe('the builds of this tree', () => {
  it('is the Free build, the only flavour it packs, with no gate to register', () => {
    expect(treeFlavour(ROOT)).toBe('free');
    expect(FLAVOURS).toEqual(['free']);
    expect(GATE_REGISTER).toBeNull();
  });

  it('takes the pages as they are, once panel.html loads the Free entry', () => {
    const panel = readFileSync(path.join(ROOT, 'panel.html'), 'utf8');
    expect(freePanelHtml(panel)).toBe(panel);
    expect(panel).toContain(FREE_ENTRY);
    expect(() => freePanelHtml('<body></body>')).toThrow(/does not load/);
    expect(freeHtml('<p>x</p>')).toBe('<p>x</p>');
  });
});

describe('writeBuildTree', () => {
  let root;
  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'build-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('copies the listed paths and writes the Firefox manifest with the add-on id', () => {
    const source = path.join(root, 'source');
    mkdirSync(path.join(source, 'src'), { recursive: true });
    writeFileSync(path.join(source, 'src', 'app.js'), '');
    writeFileSync(path.join(source, 'manifest.json'), JSON.stringify({ name: 'X', minimum_chrome_version: '114' }));
    const out = path.join(root, 'free-firefox');
    writeBuildTree(source, out, ['src', 'manifest.json', 'missing.txt'], { flavour: 'free', browser: 'firefox' });
    expect(existsSync(path.join(out, 'src', 'app.js'))).toBe(true);
    expect(existsSync(path.join(out, 'missing.txt'))).toBe(false);
    const written = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(written.name).toBe('X');
    expect(written.browser_specific_settings.gecko.id).toBe(GECKO_IDS.free);
    expect(written.minimum_chrome_version).toBeUndefined();
  });

  it('refuses a flavour this tree does not pack', () => {
    expect(() => writeBuildTree(root, path.join(root, 'out'), [], { flavour: 'other' })).toThrow(/Unknown flavour "other": use free/);
  });
});
