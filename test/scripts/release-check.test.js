'use strict';

import { checkVersions, checkLicence, checkControlHelp, checkDescription, checkFreeTexts } from '../../scripts/release-check.mjs';

const json = (version) => JSON.stringify({ version });
const lock = (version, root = version) => JSON.stringify({ version, packages: { '': { version: root } } });
const sources = (over = {}) => ({
  manifest: json('2.0.0'), packageJson: json('2.0.0'), lock: lock('2.0.0'),
  ...over
});

describe('checkVersions', () => {
  it('passes when every file says the same', () => {
    expect(checkVersions(sources())).toEqual([]);
  });

  it('names each file that disagrees with the manifest', () => {
    const problems = checkVersions(sources({ packageJson: json('2.0.1'), lock: lock('2.0.0', '1.9.0') }));
    expect(problems).toEqual([
      'package.json says 2.0.1, manifest.json says 2.0.0',
      'package-lock.json (root package) says 1.9.0, manifest.json says 2.0.0'
    ]);
  });

});

describe('checkLicence', () => {
  const gpl = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007';
  const own = 'Copyright (c) 2026 Someone. All rights reserved.';
  const pkg = (license) => JSON.stringify({ license });

  it('asks the Free build for a README naming GPL-3.0 and the GPL text', () => {
    const readme = '## Licence\n\nThe extension is licensed under the GPL-3.0.';
    expect(checkLicence({ free: true, readme, licence: gpl })).toEqual([]);
    expect(checkLicence({ free: true, readme: 'No note here', licence: gpl })[0]).toMatch(/no Licence section naming GPL-3.0/);
    expect(checkLicence({ free: true, readme: '## Licence\n\nMIT', licence: gpl })[0]).toMatch(/no Licence section/);
    expect(checkLicence({ free: true, readme, licence: own })[0]).toMatch(/not the GPL-3.0 text/);
  });

  it('asks the build with every gate for its own licence, not the GPL', () => {
    const readme = '## Licence\n\nAll rights reserved.';
    expect(checkLicence({ readme, licence: own, packageJson: pkg('SEE LICENSE IN LICENSE') })).toEqual([]);
    expect(checkLicence({ readme: '## Licence\n\nGPL-3.0', licence: own, packageJson: pkg('SEE LICENSE IN LICENSE') })[0]).toMatch(/All rights reserved/);
    expect(checkLicence({ readme, licence: gpl, packageJson: pkg('SEE LICENSE IN LICENSE') }).join('\n')).toMatch(/holds the GPL text/);
    expect(checkLicence({ readme, licence: own, packageJson: pkg('GPL-3.0-only') })[0]).toMatch(/SEE LICENSE IN LICENSE/);
  });
});

describe('checkControlHelp', () => {
  const page = `
    <header class="scope">
      <label data-help="Top bar"><select id="target"></select></label>
      <button id="rescan" data-help="Rescan">Rescan</button>
      <button id="bare">Bare</button>
    </header>
    <header class="toolbar"><div class="bar"><input id="other" type="search" data-help="Missing entry" /></div></header>
    <footer><button id="outside">Outside the bars</button></footer>`;
  const titles = ['Top bar', 'Rescan'];

  it('lists a control without data-help and one whose entry does not exist', () => {
    const problems = checkControlHelp(page, titles);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/#bare has no data-help/);
    expect(problems[1]).toMatch(/#other names the help entry "Missing entry"/);
  });

  it('lets an allowed control stay without help, and says when the allowance is stale', () => {
    expect(checkControlHelp(page, [...titles, 'Missing entry'], { bare: 'not yet' })).toEqual([]);
    expect(checkControlHelp(page, [...titles, 'Missing entry'], { bare: 'x', rescan: 'x', gone: 'x' })).toEqual([
      '#rescan has data-help now: remove it from scripts/release-check.allow.json',
      'scripts/release-check.allow.json lists #gone, which is not a control in the top bar or a toolbar'
    ]);
  });

  it('matches titles whatever their case', () => {
    expect(checkControlHelp('<div class="bar"><button id="a" data-help="rescan"></button></div>', ['Rescan'])).toEqual([]);
  });
});

describe('checkDescription', () => {
  it('finds a removed feature by its name, with the line', () => {
    const problems = checkDescription('Fine line\nThe Next step tab is gone\nAlso a route map');
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/line 2 mentions "Next step"/);
    expect(problems[1]).toMatch(/line 3 mentions "Route"/);
  });

  it('passes a description that names none of them', () => {
    expect(checkDescription('Inspect OmniScripts.\nThe Validation tab.')).toEqual([]);
  });
});

describe('checkFreeTexts', () => {
  it('finds a listed word and an earlier licence named in a Free text, with the file and line', () => {
    const problems = checkFreeTexts({ 'README.md': 'Fine\nMore in Example Plus.', 'CHANGELOG.md': 'Licence: MIT' }, [/\bPlus\b/, /\bMIT\b/]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^README\.md line 2 /);
    expect(problems[1]).toMatch(/^CHANGELOG\.md line 1 /);
  });

  it('passes words that only contain the letters', () => {
    expect(checkFreeTexts({ 'README.md': 'Properties, a process, profiles and GPL-3.0.' })).toEqual([]);
  });
});
