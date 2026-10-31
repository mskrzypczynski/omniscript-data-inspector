'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { buildDocs } from '../../scripts/docs.mjs';
import { loadHelp, anchorsOf } from '../../scripts/lib/docs-help.mjs';
import { loadGuides, checkGuides, resolveLink } from '../../scripts/lib/docs-guides.mjs';
import { renderMarkdown, renderInline, parseFrontMatter, linksOf, wordCountOf } from '../../scripts/lib/docs-markdown.mjs';

let out;
let model;
let guides;

beforeAll(async () => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-guides-test-'));
  await buildDocs(out);
  model = await loadHelp();
  guides = loadGuides();
});

afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

const page = (name) => new JSDOM(fs.readFileSync(path.join(out, name), 'utf8')).window.document;

describe('the guides', () => {
  it('are 300 to 600 words each, with numbered steps', () => {
    guides.forEach((guide) => {
      expect(guide.words).toBeGreaterThanOrEqual(300);
      expect(guide.words).toBeLessThanOrEqual(600);
      expect(guide.body).toMatch(/^1\. /m);
    });
  });

  it('link only help entries, guides and pages that exist', () => {
    expect(checkGuides(guides, anchorsOf(model))).toEqual([]);
    const anchors = anchorsOf(model);
    guides.forEach((guide) => {
      const targets = linksOf(guide.body).filter((href) => href.startsWith('reference:'));
      expect(targets.length).toBeGreaterThan(0);
      targets.forEach((href) => expect(anchors.has(href.slice('reference:'.length))).toBe(true));
    });
  });

  it('are refused when a link names a help entry that is gone', () => {
    const broken = [{ slug: 'x', title: 'X', summary: 's', body: 'See [it](reference:data-no-such-entry) and [that](guide:nope).' }];
    expect(checkGuides(broken, anchorsOf(model))).toEqual([
      'x: no reference entry "data-no-such-entry"',
      'x: no guide "nope"'
    ]);
  });
});

describe('guide pages', () => {
  it('point reference links at anchors that exist on the reference page', () => {
    const reference = page('reference.html');
    guides.forEach((guide) => {
      const doc = page(`guides/${guide.slug}.html`);
      [...doc.querySelectorAll('a[href*="reference.html#"]')].forEach((a) => {
        expect(a.getAttribute('href')).toMatch(/^\.\.\/reference\.html#/);
        expect(reference.getElementById(a.getAttribute('href').split('#')[1])).not.toBeNull();
      });
    });
  });

  it('list every guide on the index', () => {
    const doc = page('guides/index.html');
    expect([...doc.querySelectorAll('a.card')].map((a) => a.getAttribute('href'))).toEqual(guides.map((guide) => `${guide.slug}.html`));
  });

  it('link the guides to each other with pages that exist', () => {
    guides.forEach((guide) => {
      [...page(`guides/${guide.slug}.html`).querySelectorAll('a[href$=".html"]:not([href^="http"]):not([href^=".."])')].forEach((a) => {
        expect(fs.existsSync(path.join(out, 'guides', a.getAttribute('href')))).toBe(true);
      });
    });
  });
});

describe('the Markdown reader', () => {
  it('reads front matter', () => {
    expect(parseFrontMatter('---\ntitle: A: b\norder: 2\n---\nBody')).toEqual({ meta: { title: 'A: b', order: '2' }, body: 'Body' });
    expect(parseFrontMatter('No front matter')).toEqual({ meta: {}, body: 'No front matter' });
  });

  it('draws headings one level down, lists, notes and tables', () => {
    const html = renderMarkdown('# Title\n\nText `a<b` **bold**.\n\n1. One\n2. Two\n   more\n\n- Dot\n\n> A note\n\n| A | B |\n| - | - |\n| 1 | 2 |\n');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<code>a&lt;b</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<ol><li>One</li><li>Two more</li></ol>');
    expect(html).toContain('<ul><li>Dot</li></ul>');
    expect(html).toContain('<blockquote class="note">A note</blockquote>');
    expect(html).toContain('<td>2</td>');
  });

  it('escapes raw HTML and resolves links', () => {
    expect(renderInline('<script>x</script> [a](guide:b)', resolveLink)).toBe('&lt;script&gt;x&lt;/script&gt; <a href="b.html">a</a>');
    expect(resolveLink('reference:x')).toBe('../reference.html#x');
    expect(resolveLink('viewer:')).toBe('../viewer/');
    expect(resolveLink('https://example.com/')).toBe('https://example.com/');
  });

  it('counts the words a reader sees', () => {
    expect(wordCountOf('# Head\n\n1. See [two words](reference:x) and `code`.\n')).toBe(6);
  });
});
