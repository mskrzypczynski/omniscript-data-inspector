/* A small Markdown reader for the guides in docs/guides/ and the escaping the
 * Markdown output of the reference needs. It understands only what the guides
 * use: front matter, headings, paragraphs, bullet and numbered lists, block
 * quotes (drawn as notes), tables, and inline code, bold, italic and links.
 * Raw HTML in a guide is escaped, never passed through. A control name written
 * [[Rescan]] is drawn as a chip (src/core/shared/chips.js is the one place that
 * knows the mark).
 * Dev tooling only; never shipped. */

import { chipSegments } from '../../src/core/shared/chips.js';

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Text that must read literally in a Markdown file: every character that
 * could start emphasis, a link, a tag or a table cell is backslash-escaped. */
export function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]<>|~&#]/g, (char) => `\\${char}`);
}

/* A text with control names marked [[like this]] as HTML: the text escaped, each
 * name a chip. */
export function chipHtml(text) {
  return chipSegments(text)
    .map((piece) => (piece.chip !== undefined ? `<span class="ctl-chip">${escapeHtml(piece.chip)}</span>` : escapeHtml(piece.text)))
    .join('');
}

/* The same as Markdown, where a chip cannot be drawn: the name in bold. */
export function chipMarkdown(text) {
  return chipSegments(text)
    .map((piece) => (piece.chip !== undefined ? `**${escapeMarkdown(piece.chip)}**` : escapeMarkdown(piece.text)))
    .join('');
}

/* "---\nkey: value\n---\nbody" -> { meta, body }. */
export function parseFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) meta[pair[1]] = pair[2].trim();
  });
  return { meta, body: match[2] };
}

/* Inline: code spans first (their content is literal), then links, bold and
 * italic on what is left. `resolveLink` may rewrite an href. */
export function renderInline(text, resolveLink = (href) => href) {
  const pieces = String(text).split(/(`[^`]+`)/);
  return pieces.map((piece) => {
    if (/^`[^`]+`$/.test(piece)) return `<code>${escapeHtml(piece.slice(1, -1))}</code>`;
    /* Control names are set aside while links, bold and italic are read, so
     * a name inside **bold** or a link label still comes out as a chip. */
    const chips = [];
    const held = chipSegments(piece).map((part) => {
      if (part.chip === undefined) return part.text;
      chips.push(part.chip);
      return `\uE000${chips.length - 1}\uE001`;
    }).join('');
    let html = escapeHtml(held);
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_all, label, href) => {
      const target = resolveLink(href.replace(/&amp;/g, '&'));
      return `<a href="${escapeHtml(target)}">${label}</a>`;
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:!?])/g, '$1<em>$2</em>');
    return html.replace(/\uE000(\d+)\uE001/g, (_all, at) => `<span class="ctl-chip">${escapeHtml(chips[Number(at)])}</span>`);
  }).join('');
}

const isBlank = (line) => !line.trim();
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const startsBlock = (line) => /^#{1,6}\s/.test(line) || BULLET.test(line) || NUMBERED.test(line) || /^>\s?/.test(line) || /^\|/.test(line);

function splitRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

/* Body Markdown -> HTML. Headings are shifted so that "#" is an h2 on the page
 * (the page's own title is the h1). */
export function renderMarkdown(body, resolveLink) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const inline = (text) => renderInline(text, resolveLink);
  let at = 0;

  while (at < lines.length) {
    const line = lines[at];
    if (isBlank(line)) { at++; continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      at++;
      continue;
    }

    if (/^\|/.test(line) && /^\|\s*:?-+/.test(lines[at + 1] || '')) {
      const head = splitRow(line);
      at += 2;
      const rows = [];
      while (at < lines.length && /^\|/.test(lines[at])) rows.push(splitRow(lines[at++]));
      out.push('<table class="plain"><thead><tr>' + head.map((cell) => `<th>${inline(cell)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((row) => '<tr>' + row.map((cell) => `<td>${inline(cell)}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted = [];
      while (at < lines.length && /^>\s?/.test(lines[at])) quoted.push(lines[at++].replace(/^>\s?/, ''));
      out.push(`<blockquote class="note">${inline(quoted.join(' ').trim())}</blockquote>`);
      continue;
    }

    const kind = NUMBERED.test(line) ? 'ol' : BULLET.test(line) ? 'ul' : '';
    if (kind) {
      const pattern = kind === 'ol' ? NUMBERED : BULLET;
      const items = [];
      while (at < lines.length && !isBlank(lines[at]) && pattern.test(lines[at])) {
        let text = pattern.exec(lines[at++])[1];
        /* A wrapped item continues on indented lines. */
        while (at < lines.length && /^\s{2,}\S/.test(lines[at]) && !pattern.test(lines[at])) text += ` ${lines[at++].trim()}`;
        items.push(text);
      }
      out.push(`<${kind}>` + items.map((item) => `<li>${inline(item)}</li>`).join('') + `</${kind}>`);
      continue;
    }

    const paragraph = [];
    while (at < lines.length && !isBlank(lines[at]) && !(paragraph.length && startsBlock(lines[at]))) paragraph.push(lines[at++].trim());
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return out.join('\n');
}

/* The links a guide body holds, as written: [label](href) outside code spans. */
export function linksOf(body) {
  const hrefs = [];
  body.split('\n').forEach((line) => {
    line.split(/(`[^`]+`)/).forEach((piece) => {
      if (/^`[^`]+`$/.test(piece)) return;
      for (const match of piece.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) hrefs.push(match[1]);
    });
  });
  return hrefs;
}

/* Words a reader sees: link targets, emphasis marks, heading hashes and list
 * markers are not words. */
export function wordCountOf(body) {
  return body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*#>|]/g, ' ')
    .replace(/^\s*(?:[-]|\d+[.)])\s+/gm, '')
    .split(/\s+/)
    .filter((word) => /[A-Za-z0-9]/.test(word)).length;
}
