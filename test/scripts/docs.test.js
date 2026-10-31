'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildDocs } from '../../scripts/docs.mjs';
import { loadHelp, allEntries, anchorsOf, slugify, entryLines } from '../../scripts/lib/docs-help.mjs';
import { escapeMarkdown, chipHtml, chipMarkdown, renderInline } from '../../scripts/lib/docs-markdown.mjs';
import { plainChips } from '../../src/core/shared/chips.js';

let out;
let model;
let doc;
let markdown;

beforeAll(async () => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'));
  await buildDocs(out);
  model = await loadHelp();
  doc = new JSDOM(fs.readFileSync(path.join(out, 'reference.html'), 'utf8')).window.document;
  markdown = fs.readFileSync(path.join(out, 'reference.md'), 'utf8');
});

afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

const squash = (text) => text.replace(/\s+/g, ' ').trim();

describe('the model read from the help modules', () => {
  it('has a section per tab and the shared one', () => {
    expect(model.tabs.map((tab) => tab.id)).toEqual(['data', 'structure', 'actions', 'everywhere']);
    expect(model.tabs.map((tab) => tab.title)).toEqual(['Data', 'Structure', 'Calls', 'Everywhere']);
  });

  it('gives every entry a unique, plain anchor', () => {
    const ids = allEntries(model).map(({ entry }) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('keeps slugs stable: made from the title, not from a position', () => {
    expect(slugify('Refresh')).toBe('refresh');
    expect(slugify('Failed only / Slower than')).toBe('failed-only-slower-than');
    expect(slugify('Depends on / Used by / Written by')).toBe('depends-on-used-by-written-by');
    expect(slugify('Refresh')).toBe(slugify('Refresh'));
    const refresh = allEntries(model).filter(({ entry }) => entry.title === 'Refresh').map(({ entry }) => entry.id);
    expect(refresh).toEqual(expect.arrayContaining(['data-refresh', 'structure-refresh']));
  });

  it('falls back to a stable hash for a title with no letters in it', () => {
    expect(slugify('✓ ✓')).toBe(slugify('✓ ✓'));
    expect(slugify('✓ ✓')).toMatch(/^entry-[0-9a-f]{8}$/);
  });
});

describe('reference.html', () => {
  it('shows every help title once, as an anchored heading', () => {
    const headings = [...doc.querySelectorAll('.entry h3, .entry h4')];
    const entries = allEntries(model);
    expect(headings).toHaveLength(entries.length);
    entries.forEach(({ entry }) => {
      const heading = doc.getElementById(entry.id);
      expect(heading).not.toBeNull();
      expect(heading.tagName).toMatch(/^H[34]$/);
      expect(squash(heading.textContent)).toBe(squash(entry.title));
      expect(heading.querySelector('a').getAttribute('href')).toBe(`#${entry.id}`);
    });
  });

  it('has unique ids and every anchor the model promises', () => {
    const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    anchorsOf(model).forEach((anchor) => expect(ids).toContain(anchor));
  });

  it('loses no entry text, and draws several lines as a lead and bullets', () => {
    allEntries(model).filter(({ entry }) => entry.text !== undefined).forEach(({ entry }) => {
      const section = doc.getElementById(entry.id).closest('.entry');
      const { lead, items } = entryLines(entry.text);
      /* The details, drawn after the text, may have bullets of their own. */
      const detailItems = entry.more ? entryLines(entry.more).items : [];
      expect(squash(section.querySelector('p:not(.short)').textContent)).toBe(squash(plainChips(lead)));
      expect([...section.querySelectorAll('li')].map((li) => squash(li.textContent))).toEqual([...items, ...detailItems].map((item) => squash(plainChips(item))));
    });
  });

  it('draws a marked control name as a chip, and leaves no mark showing', () => {
    expect(doc.querySelectorAll('.ctl-chip').length).toBeGreaterThan(10);
    expect(doc.body.textContent).not.toContain('[[');
    expect(markdown).not.toContain('[[');
    expect(markdown).toContain('**Rescan**');
    const refresh = doc.getElementById('data-refresh').closest('.entry');
    expect([...refresh.querySelectorAll('.ctl-chip')].map((chip) => chip.textContent)).toContain('Auto-refresh');
  });

  it('flattens the "more" folds: the longest entry is whole on the page', () => {
    const longest = allEntries(model).map(({ entry }) => entry).filter((entry) => entry.text).sort((a, b) => b.text.length - a.text.length)[0];
    expect(doc.getElementById(longest.id).closest('.entry').textContent).toContain(squash(plainChips(longest.text)).slice(-60));
    expect(doc.querySelector('.help-more, .help-rest')).toBeNull();
  });

  it('lists the Start here steps first in each tab that has them', () => {
    model.tabs.filter((tab) => tab.start.length).forEach((tab) => {
      const box = doc.getElementById(`${tab.id}-start`);
      expect([...box.querySelectorAll('ol > li')].map((li) => squash(li.textContent))).toEqual(tab.start.map((item) => squash(plainChips(item))));
      const group = box.closest('.group');
      expect(group.querySelector('.start')).toBe(box);
      expect(group.querySelector('.entry').compareDocumentPosition(box) & 2).toBeTruthy(); // box precedes the first entry
    });
  });

  it('draws the Keys table with one row per shortcut', () => {
    const rows = [...doc.querySelectorAll('#keys-group tr')];
    expect(rows).toHaveLength(model.keys.length);
    expect(rows[0].querySelector('kbd').textContent).toBe(model.keys[0].keys[0]);
    expect(squash(rows[0].querySelector('td').textContent)).toBe(squash(model.keys[0].text));
  });

  it('has a table of contents that links every entry', () => {
    const hrefs = [...doc.querySelectorAll('.toc a')].map((a) => a.getAttribute('href').slice(1));
    allEntries(model).forEach(({ entry }) => expect(hrefs).toContain(entry.id));
    hrefs.forEach((id) => expect(doc.getElementById(id)).not.toBeNull());
  });

  it('is self-contained apart from the website stylesheet, and carries the version', () => {
    const html = fs.readFileSync(path.join(out, 'reference.html'), 'utf8');
    expect([...doc.querySelectorAll('link[rel=stylesheet]')].map((link) => link.getAttribute('href'))).toEqual(['../style.css']);
    expect(doc.querySelector('script[src]')).toBeNull();
    expect(html).not.toMatch(/https?:\/\/(?!mskrzypczynski)/);
    expect(doc.querySelector('footer').textContent).toContain(model.version);
    expect(doc.querySelector('footer').textContent).toContain("generated from the panel's own help");
    expect(html).toMatch(/prefers-color-scheme|var\(--/);
  });

  it('is built the same way every time', async () => {
    const again = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-test-'));
    try {
      await buildDocs(again);
      expect(fs.readFileSync(path.join(again, 'reference.html'), 'utf8')).toBe(fs.readFileSync(path.join(out, 'reference.html'), 'utf8'));
      expect(fs.readFileSync(path.join(again, 'reference.md'), 'utf8')).toBe(markdown);
    } finally {
      fs.rmSync(again, { recursive: true, force: true });
    }
  });
});

describe('reference.md', () => {
  it('has every title and escapes what Markdown would swallow', () => {
    allEntries(model).forEach(({ entry }) => expect(markdown).toContain(`<a id="${entry.id}"></a>`));
    expect(markdown).toContain('\\<string\\>');
    expect(markdown).not.toMatch(/[^\\]<string>/);
  });

  it('writes bullets for the lines of an entry', () => {
    const settings = model.tabs.find((tab) => tab.id === 'everywhere').sections[0].entries.find((entry) => entry.title === 'Settings');
    const { items } = entryLines(settings.text);
    expect(items.length).toBeGreaterThan(1);
    expect(markdown).toContain(`- ${escapeMarkdown(items[0])}`);
  });
});

describe('control names in the generators', () => {
  it('chipHtml escapes the text and the name', () => {
    expect(chipHtml('a <b> [[Rescan & go]] c')).toBe('a &lt;b&gt; <span class="ctl-chip">Rescan &amp; go</span> c');
    expect(chipHtml('plain')).toBe('plain');
  });

  it('chipMarkdown puts a name in bold and escapes the rest', () => {
    expect(chipMarkdown('use [[Track changes]] _now_')).toBe('use **Track changes** \\_now\\_');
  });

  it('renderInline draws a name inside bold and inside a link label', () => {
    expect(renderInline('**press [[Rescan]]**')).toBe('<strong>press <span class="ctl-chip">Rescan</span></strong>');
    expect(renderInline('[the [[?]] button](x.html)')).toBe('<a href="x.html">the <span class="ctl-chip">?</span> button</a>');
    expect(renderInline('`[[Rescan]]` stays code')).toBe('<code>[[Rescan]]</code> stays code');
  });
});
