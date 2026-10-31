/* The task-based guides: docs/guides/*.md, written by hand, drawn as pages
 * under guides/. A guide links the reference with [text](reference:<anchor>),
 * another guide with [text](guide:<name>) and the bundle viewer with
 * [text](viewer:). Every such link is checked against what the build really
 * produces, so a help entry that is renamed or removed breaks the build here
 * instead of leaving a dead link on the website.
 * Dev tooling only; never shipped. */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './docs-help.mjs';
import { escapeHtml, linksOf, parseFrontMatter, renderMarkdown, wordCountOf } from './docs-markdown.mjs';
import { pageHtml } from './docs-page.mjs';

export const GUIDES_DIR = path.join(ROOT, 'docs', 'guides');

export function loadGuides(dir = GUIDES_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const { meta, body } = parseFrontMatter(readFileSync(path.join(dir, name), 'utf8'));
      return {
        slug: name.replace(/\.md$/, ''),
        title: meta.title || name,
        summary: meta.summary || '',
        order: Number(meta.order) || 99,
        body,
        words: wordCountOf(body)
      };
    })
    .sort((left, right) => left.order - right.order || left.slug.localeCompare(right.slug));
}

/* Where a link written in a guide points on the built site. */
export function resolveLink(href) {
  if (href.startsWith('reference:')) return `../reference.html#${href.slice('reference:'.length)}`;
  if (href.startsWith('guide:')) return `${href.slice('guide:'.length)}.html`;
  if (href === 'viewer:') return '../viewer/';
  return href;
}

/* Problems with a guide's links and front matter: what the build refuses. */
export function checkGuides(guides, anchors) {
  const slugs = new Set(guides.map((guide) => guide.slug));
  const problems = [];
  guides.forEach((guide) => {
    if (!guide.title || guide.title.endsWith('.md')) problems.push(`${guide.slug}: no title in the front matter`);
    if (!guide.summary) problems.push(`${guide.slug}: no summary in the front matter`);
    linksOf(guide.body).forEach((href) => {
      if (href.startsWith('reference:') && !anchors.has(href.slice('reference:'.length))) {
        problems.push(`${guide.slug}: no reference entry "${href.slice('reference:'.length)}"`);
      }
      if (href.startsWith('guide:') && !slugs.has(href.slice('guide:'.length))) {
        problems.push(`${guide.slug}: no guide "${href.slice('guide:'.length)}"`);
      }
    });
  });
  return problems;
}

export function renderGuideHtml(guide, version) {
  const body = `<h1>${escapeHtml(guide.title)}</h1>
<p class="sub">${escapeHtml(guide.summary)}</p>
${renderMarkdown(guide.body, resolveLink)}
<p class="related">Every control is described in the <a href="../reference.html">reference</a>. More <a href="index.html">guides</a>.</p>`;
  return pageHtml({
    kind: 'guide',
    title: `${guide.title} · OmniScript Data Inspector`,
    description: guide.summary,
    body,
    version,
    trail: ' · <a href="index.html">Guides</a>'
  });
}

export function renderGuideIndexHtml(guides, version) {
  const cards = guides.map((guide) => `<a class="card" href="${guide.slug}.html"><h3>${escapeHtml(guide.title)}</h3><p>${escapeHtml(guide.summary)}</p></a>`);
  const body = `<h1>Guides</h1>
<p class="sub">One question at a time, with the exact controls to use. For everything else, see the <a href="../reference.html">reference</a>.</p>
${cards.join('\n')}`;
  return pageHtml({
    kind: 'guide',
    title: 'Guides · OmniScript Data Inspector',
    description: 'Task-based guides for the OmniScript Data Inspector: hidden fields, a blocked Next, failed calls and how to report a problem.',
    body,
    version
  });
}
