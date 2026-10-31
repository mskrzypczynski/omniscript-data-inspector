/* The shell every generated documentation page shares: the website's
 * stylesheet, a few rules of its own that follow the site's colour tokens (so
 * light and dark come from prefers-color-scheme, as on the rest of the site),
 * a breadcrumb and a footer naming the extension version.
 * Dev tooling only; never shipped. */

import { escapeHtml } from './docs-markdown.mjs';

/* Where the product page sits relative to a generated page: the reference is
 * beside index.html, a guide is one folder down. */
export const SITE = {
  reference: { stylesheet: '../style.css', home: 'index.html', siteHome: '../index.html' },
  guide: { stylesheet: '../../style.css', home: '../index.html', siteHome: '../../index.html' }
};

/* Fallbacks after each token keep the page readable if the stylesheet is
 * missing; with it, the site's own values win. */
const PAGE_CSS = `
.sub { margin-bottom: 18px; }
.lede { color: var(--dim, #57606a); margin: 0 0 14px; }
kbd {
  display: inline-block; min-width: 1.5em; padding: 0 5px; text-align: center;
  border: 1px solid var(--line, #d8dee4); border-bottom-width: 2px; border-radius: 4px;
  background: var(--card, #f9fafb); font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.ctl-chip {
  display: inline-block; padding: 0 6px; white-space: nowrap; font-size: 0.92em; line-height: 1.45;
  color: var(--fg, #1f2328); background: var(--card, #f9fafb);
  border: 1px solid var(--line, #d8dee4); border-bottom-width: 2px; border-radius: 4px;
}
.search { position: sticky; top: 0; z-index: 2; margin: 0 -22px 18px; padding: 10px 22px; background: var(--bg, #fff); border-bottom: 1px solid var(--line, #d8dee4); }
.search input {
  width: 100%; padding: 8px 10px; font: inherit; color: var(--fg, #1f2328);
  background: var(--card, #f9fafb); border: 1px solid var(--line, #d8dee4); border-radius: 6px;
}
.search input:focus { outline: 2px solid var(--accent, #0969da); outline-offset: 1px; }
.toc { padding: 12px 16px; margin: 0 0 8px; border: 1px solid var(--line, #d8dee4); border-radius: 8px; background: var(--card, #f9fafb); }
.toc > ul { list-style: none; margin: 0; padding: 0; }
.toc > ul > li { margin: 0 0 4px; }
.toc details { margin-top: 2px; }
.toc summary { cursor: pointer; color: var(--dim, #57606a); font-size: 14px; }
.toc details ul { columns: 2; column-gap: 24px; padding-left: 18px; margin: 6px 0; font-size: 14px; }
.toc details li { margin: 0 0 2px; break-inside: avoid; }
.group > h2 { margin-top: 40px; }
h2[id], h3[id], h4[id] { scroll-margin-top: 70px; }
.entry { margin: 0 0 6px; }
.entry h3, .entry h4 { margin: 20px 0 4px; font-size: 16px; }
.entry h3 a, .entry h4 a, .group > h2 a { color: inherit; text-decoration: none; }
.entry h3 a:hover, .entry h4 a:hover, .group > h2 a:hover { text-decoration: underline; }
.entry p, .entry ul { margin: 0 0 6px; }
.entry li { margin-bottom: 4px; }
.subsection { font-size: 15px; color: var(--dim, #57606a); margin: 26px 0 0; }
.start { margin: 4px 0 8px; padding: 10px 16px; border: 1px solid var(--line, #d8dee4); border-radius: 8px; background: var(--card, #f9fafb); }
.start h3 { margin: 0 0 4px; font-size: 15px; }
.start ol { margin: 0; padding-left: 22px; }
table.keys, table.plain { width: 100%; border-collapse: collapse; font-size: 14px; margin: 8px 0 16px; }
table.keys th, table.keys td, table.plain th, table.plain td { padding: 6px 8px; border-bottom: 1px solid var(--line, #d8dee4); vertical-align: top; text-align: left; }
table.keys th { white-space: nowrap; font-weight: 400; width: 1%; }
blockquote.note { margin: 14px 0; padding: 8px 14px; border-left: 3px solid var(--accent, #0969da); background: var(--card, #f9fafb); color: var(--fg, #1f2328); }
.related { margin-top: 30px; }
.empty { color: var(--dim, #57606a); }
[hidden] { display: none !important; }
@media (max-width: 520px) {
  body { padding: 28px 16px 60px; }
  .search { margin: 0 -16px 18px; padding: 10px 16px; }
  .toc details ul { columns: 1; }
}
`;

export function pageHtml({ kind, title, description, body, version, script = '', trail = '' }) {
  const site = SITE[kind];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="stylesheet" href="${site.stylesheet}" />
<style>${PAGE_CSS}</style>
</head>
<body>
<nav class="crumbs"><a href="${site.siteHome}">← All extensions</a> · <a href="${site.home}">OmniScript Data Inspector</a>${trail}</nav>
${body}
<footer>OmniScript Data Inspector ${escapeHtml(version)} · generated from the panel's own help, so it matches that version · Unofficial tool, not affiliated with Salesforce, Inc.</footer>
${script ? `<script>\n${script}\n</script>\n` : ''}</body>
</html>
`;
}
