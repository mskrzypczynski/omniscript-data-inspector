'use strict';

/* The result of "Compare definition…" in the detail pane: what a file's
 * definition has that this script's does not, and the other way round, in four
 * groups. Each line is a button that selects the element in the list where it
 * exists. Only DOM here; the diff itself is core/structure/definition-diff.js. */

/* state.compare: { fileName, from: 'definition' | 'bundle', result } or { fileName, error }.
 * deps: find(element) the loaded script's element for a compared one, or null;
 * select(element) selects it; close() leaves the comparison. */
export function createComparePane({ state, find, select, close }) {
  function line(className, text) {
    const node = document.createElement('div');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function elementButton(name, element, title) {
    const target = element ? find(element) : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jump-link';
    button.textContent = name;
    if (target) {
      button.title = title || 'Select this element';
      button.addEventListener('click', () => select(target));
    } else {
      button.disabled = true;
      button.title = 'Not in the loaded script, so there is nothing to select';
    }
    return button;
  }

  function group(body, title, entries, draw) {
    if (!entries.length) return;
    const head = document.createElement('div');
    head.className = 'stop-head';
    head.textContent = `${title} (${entries.length})`;
    body.appendChild(head);
    entries.forEach((entry) => body.appendChild(draw(entry)));
  }

  function entryLine(kind, button, detail, changes, inside) {
    const box = document.createElement('div');
    box.className = `cmp-line is-${kind}${inside ? ' is-inside' : ''}`;
    const glyph = document.createElement('span');
    glyph.className = 'cmp-glyph';
    glyph.textContent = { added: '+', removed: '−', renamed: '→', changed: '~' }[kind];
    glyph.setAttribute('role', 'img');
    glyph.setAttribute('aria-label', kind);
    box.appendChild(glyph);
    box.appendChild(button);
    if (detail) box.appendChild(line('cmp-path', ` ${detail}`));
    (changes || []).forEach((text) => box.appendChild(line('cmp-change', text)));
    return box;
  }

  function renderResult(pane, compare) {
    const { result } = compare;
    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    const counts = [
      result.added.length && `${result.added.length} added`,
      result.removed.length && `${result.removed.length} removed`,
      result.renamed.length && `${result.renamed.length} renamed`,
      result.changed.length && `${result.changed.length} changed`
    ].filter(Boolean);
    const source = compare.from === 'bundle' ? 'debug bundle' : 'definition';
    meta.textContent = `${compare.fileName} (${source}) compared with this script: ` +
      `${counts.length ? counts.join(' · ') : 'no differences'}` +
      `${result.unchanged ? ` · ${result.unchanged} unchanged` : ''}`;
    pane.firstChild.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'detail-body';
    if (!result.total) {
      body.appendChild(line('tab-lede', 'Nothing that the Designer edits differs: names, labels, required flags, show rules, validation, remote targets, options, Set Values and help text are the same.'));
    } else {
      body.appendChild(line('tab-lede', 'The file is Before; this script is After. Click a name to select it in the list.'));
    }
    group(body, 'Added', result.added, (entry) => entryLine('added',
      elementButton(entry.element.name, entry.element), `${entry.element.type} · ${entry.path}`, null, entry.parentAdded));
    group(body, 'Removed', result.removed, (entry) => entryLine('removed',
      elementButton(entry.element.name, null), `${entry.element.type} · ${entry.path}`, null, entry.parentRemoved));
    group(body, 'Renamed', result.renamed, (entry) => entryLine('renamed',
      elementButton(`${entry.before.name} → ${entry.after.name}`, entry.after), `${entry.after.type} · ${entry.path}`, entry.changes));
    group(body, 'Changed', result.changed, (entry) => entryLine('changed',
      elementButton(entry.after.name, entry.after), `${entry.after.type} · ${entry.path}`, entry.changes));
    pane.appendChild(body);
  }

  function render(pane) {
    const compare = state.compare;
    const head = document.createElement('div');
    head.className = 'detail-head';
    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = 'Compare definition';
    head.appendChild(title);
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'icon-btn tiny problems-close';
    closeButton.id = 'struct-compare-close';
    closeButton.textContent = 'Close';
    closeButton.title = 'Back to the selected element';
    closeButton.addEventListener('click', close);
    pane.appendChild(head);

    if (compare.error) {
      const meta = document.createElement('div');
      meta.className = 'detail-meta';
      meta.textContent = compare.fileName;
      head.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'detail-body';
      const message = line('cmp-error', compare.error);
      message.setAttribute('role', 'alert');
      body.appendChild(message);
      head.appendChild(closeButton);
      pane.appendChild(body);
      return;
    }
    renderResult(pane, compare);
    head.appendChild(closeButton);
  }

  return { render };
}

/* A picked file's text; '' when it cannot be read. */
export function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}
