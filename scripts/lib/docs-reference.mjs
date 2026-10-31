/* The reference page (HTML and Markdown), drawn from the model docs-help.mjs
 * builds out of the panel's help modules. The text of an entry is written the
 * way the panel draws it: a text with several lines is a lead and bullets, and
 * the "more" fold is flattened, so nothing is hidden.
 * Dev tooling only; never shipped. */

import { entryLines } from './docs-help.mjs';
import { chipHtml, chipMarkdown, escapeHtml } from './docs-markdown.mjs';
import { pageHtml } from './docs-page.mjs';

/* The same rule as the panel's help filter: an entry stays when every word
 * of the query is in its title or text, in any order and any case. */
const SEARCH_SCRIPT = `(function () {
  var box = document.getElementById('q');
  if (!box) return;
  box.parentNode.hidden = false;
  var entries = [].slice.call(document.querySelectorAll('.entry, tr[data-keys]'));
  var texts = entries.map(function (el) { return el.textContent.toLowerCase(); });
  var groups = [].slice.call(document.querySelectorAll('.group'));
  var starts = [].slice.call(document.querySelectorAll('.start'));
  var tocLinks = [].slice.call(document.querySelectorAll('.toc [data-for]'));
  var tocDetails = [].slice.call(document.querySelectorAll('.toc details'));
  var none = document.getElementById('none');

  function words() { return box.value.toLowerCase().split(/\\s+/).filter(Boolean); }

  function apply() {
    var want = words();
    var filtering = want.length > 0;
    entries.forEach(function (el, at) {
      el.hidden = !want.every(function (word) { return texts[at].indexOf(word) !== -1; });
    });
    var shown = 0;
    groups.forEach(function (group) {
      var any = !!group.querySelector('.entry:not([hidden]), tr[data-keys]:not([hidden])');
      group.hidden = !any;
      if (any) shown += 1;
    });
    starts.forEach(function (el) { el.hidden = filtering; });
    tocLinks.forEach(function (li) {
      var target = document.getElementById(li.getAttribute('data-for'));
      var holder = target && target.closest('.entry, .group');
      li.hidden = !!holder && holder.hidden;
    });
    tocDetails.forEach(function (d) { if (filtering) d.open = true; });
    none.hidden = !filtering || shown > 0;
  }

  function revealTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    if (target && target.closest('[hidden]')) { box.value = ''; apply(); target.scrollIntoView(); }
  }

  box.addEventListener('input', apply);
  box.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { box.value = ''; apply(); }
  });
  window.addEventListener('hashchange', revealTarget);
  document.addEventListener('keydown', function (event) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); box.focus(); }
  });
  apply();
  revealTarget();
})();`;

const para = (text) => `<p>${chipHtml(text)}</p>`;

function textHtml(text) {
  const { lead, items } = entryLines(text);
  if (!items.length) return para(lead);
  return `${para(lead)}\n<ul>\n${items.map((item) => `<li>${chipHtml(item)}</li>`).join('\n')}\n</ul>`;
}

function keysCells(keys) {
  return keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join(' ');
}

function keysTable(rows, attributes = '') {
  return `<table class="keys"${attributes}>\n${rows.map((row) =>
    `<tr data-keys><th scope="row">${keysCells(row.keys)}</th><td>${chipHtml(row.text)}</td></tr>`).join('\n')}\n</table>`;
}

function anchored(level, id, title) {
  return `<h${level} id="${id}"><a href="#${id}">${escapeHtml(title)}</a></h${level}>`;
}

/* A layered entry reads short line, how to use it, then the details the panel
 * leaves to this page. */
function layeredHtml(entry) {
  const parts = [];
  if (entry.short) parts.push(`<p class="short"><strong>${escapeHtml(entry.short)}</strong>${entry.keys ? ` <kbd>${escapeHtml(entry.keys)}</kbd>` : ''}</p>`);
  parts.push(textHtml(entry.text));
  if (entry.more) parts.push(textHtml(entry.more));
  return parts.join('\n');
}

function entryHtml(entry, level) {
  const body = entry.rows ? keysTable(entry.rows) : layeredHtml(entry);
  return `<section class="entry">\n${anchored(level, entry.id, entry.title)}\n${body}\n</section>`;
}

/* A tab with one section lists its entries under the tab's heading. With
 * several, each section gets a heading of its own and the entries go a level
 * down, so the outline stays true. */
function tabHtml(tab) {
  const nested = tab.sections.length > 1;
  const parts = [`<section class="group" id="${tab.id}-group">`, anchored(2, tab.id, tab.title)];
  if (tab.lede) parts.push(`<p class="lede">${escapeHtml(tab.lede)}</p>`);
  if (tab.start.length) {
    parts.push(`<div class="start" id="${tab.id}-start"><h3>Start here</h3>\n<ol>\n${tab.start.map((item) => `<li>${chipHtml(item)}</li>`).join('\n')}\n</ol></div>`);
  }
  tab.sections.forEach((section) => {
    if (nested) parts.push(`<h3 class="subsection">${escapeHtml(section.heading)}</h3>`);
    section.entries.forEach((entry) => parts.push(entryHtml(entry, nested ? 4 : 3)));
  });
  parts.push('</section>');
  return parts.join('\n');
}

function keysHtml(keys) {
  return `<section class="group" id="keys-group">
${anchored(2, 'keys', 'Keys')}
<p class="lede">Single keys; ignored while typing in a field.</p>
${keysTable(keys)}
</section>`;
}

function tocHtml(model) {
  const groups = model.tabs.map((tab) => {
    const entries = tab.sections.flatMap((section) => section.entries);
    return `<li data-for="${tab.id}"><a href="#${tab.id}">${escapeHtml(tab.title)}</a>
<details><summary>${entries.length} entries</summary>
<ul>
${entries.map((entry) => `<li data-for="${entry.id}"><a href="#${entry.id}">${escapeHtml(entry.title)}</a></li>`).join('\n')}
</ul></details></li>`;
  });
  groups.push('<li data-for="keys"><a href="#keys">Keys</a></li>');
  return `<nav class="toc" aria-label="Contents"><ul>\n${groups.join('\n')}\n</ul></nav>`;
}

export function renderReferenceHtml(model) {
  const body = `<h1>Reference</h1>
<p class="sub">Every entry of the panel's help (the <span class="ctl-chip">?</span> button), by tab. The same words, laid out to read and search here.</p>
<p>New here? <a href="guides/">The guides</a> follow one question at a time.${model.viewer === false ? '' : ' <a href="viewer/">Try the panel with a debug bundle</a> without installing anything.'}</p>

<div class="search" hidden><input id="q" type="search" placeholder="Search the reference (press / to focus, Esc to clear)" aria-label="Search the reference" autocomplete="off" /></div>
<p id="none" class="empty" role="status" hidden>No help matches</p>

${tocHtml(model)}

${model.tabs.map(tabHtml).join('\n\n')}

${keysHtml(model.keys)}`;
  return pageHtml({
    kind: 'reference',
    title: 'Reference · OmniScript Data Inspector',
    description: 'Every entry of the OmniScript Data Inspector help, by tab, with the keyboard shortcuts and a search.',
    body,
    version: model.version,
    script: SEARCH_SCRIPT
  });
}

/* ------------------------------------------------------------- Markdown */

const mdText = (text) => chipMarkdown(text);

function mdBody(text) {
  const { lead, items } = entryLines(text);
  return [mdText(lead), ...(items.length ? ['', ...items.map((item) => `- ${mdText(item)}`)] : [])].join('\n');
}

function mdKeysTable(rows) {
  const cell = (keys) => keys.map((key) => `<kbd>${escapeHtml(key)}</kbd>`).join(' ');
  return ['| Keys | What it does |', '| --- | --- |', ...rows.map((row) => `| ${cell(row.keys)} | ${mdText(row.text)} |`)].join('\n');
}

function mdEntry(entry, level) {
  const layered = [entry.short ? `**${mdText(entry.short)}**${entry.keys ? ` (${mdText(entry.keys)})` : ''}` : '', mdBody(entry.text), entry.more ? mdBody(entry.more) : '']
    .filter(Boolean).join('\n\n');
  const body = entry.rows ? mdKeysTable(entry.rows) : layered;
  return `<a id="${entry.id}"></a>\n\n${'#'.repeat(level)} ${mdText(entry.title)}\n\n${body}`;
}

export function renderReferenceMarkdown(model) {
  const out = [
    '# OmniScript Data Inspector: reference',
    '',
    `Every entry of the panel's help (the ? button), by tab. Version ${model.version}. Generated from the panel's own help; the web version at https://mskrzypczynski.github.io/omniscript-data-inspector/reference.html can be searched.`,
    ''
  ];
  model.tabs.forEach((tab) => {
    const nested = tab.sections.length > 1;
    out.push(`<a id="${tab.id}"></a>`, '', `## ${mdText(tab.title)}`, '');
    if (tab.lede) out.push(mdText(tab.lede), '');
    if (tab.start.length) {
      out.push(`<a id="${tab.id}-start"></a>`, '', '### Start here', '', ...tab.start.map((item, at) => `${at + 1}. ${mdText(item)}`), '');
    }
    tab.sections.forEach((section) => {
      if (nested) out.push(`### ${mdText(section.heading)}`, '');
      section.entries.forEach((entry) => out.push(mdEntry(entry, nested ? 4 : 3), ''));
    });
  });
  out.push('<a id="keys"></a>', '', '## Keys', '', 'Single keys; ignored while typing in a field.', '', mdKeysTable(model.keys), '');
  return out.join('\n');
}
