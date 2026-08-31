'use strict';

/* Collapsible JSON tree, shared by the Data tab and the Remote actions tab.
 *
 *   JsonTree.render(parent, rootKey, value, {
 *     expanded: Set,          // paths currently open, mutated by the caller
 *     changed: Set|null,      // paths to flash
 *     changedBranch: Set|null,// collapsed parents that contain a change
 *     filter: '',             // key/value substring filter
 *     maxRows: 4000,
 *     onToggle: fn(path)      // called after a row is expanded or collapsed
 *   })  ->  { rows, matched, truncated }
 *
 * Paths are SEP-joined key chains; the root is the empty string.
 */
(function (global) {

  var SEP = '\u0001';

  function isContainer(v) { return v !== null && typeof v === 'object'; }

  function entriesOf(value) {
    return Array.isArray(value)
      ? value.map(function (v, i) { return [String(i), v]; })
      : Object.keys(value).map(function (k) { return [k, value[k]]; });
  }

  function highlight(text, q) {
    var frag = document.createDocumentFragment();
    if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
    var hay = text.toLowerCase();
    var from = 0;
    var at = hay.indexOf(q);
    while (at !== -1) {
      frag.appendChild(document.createTextNode(text.slice(from, at)));
      var mark = document.createElement('mark');
      mark.textContent = text.slice(at, at + q.length);
      frag.appendChild(mark);
      from = at + q.length;
      at = hay.indexOf(q, from);
    }
    frag.appendChild(document.createTextNode(text.slice(from)));
    return frag;
  }

  var LONG_TEXT = 600;

  function valueSpan(value, ctx, path) {
    var q = ctx.q;
    var span = document.createElement('span');
    if (value === null) { span.className = 'v v-null'; span.textContent = ' null'; return span; }
    var t = typeof value;
    span.className = 'v v-' + t;
    var text = t === 'string' ? JSON.stringify(value) : String(value);

    span.appendChild(document.createTextNode(' '));

    if (text.length <= LONG_TEXT) {
      span.appendChild(highlight(text, q));
      span.title = t === 'string' ? value : text;
      return span;
    }

    /* Long value: show a slice with an inline toggle rather than a dead
     * "… (N chars)". The open paths live in ctx.expandedText, owned by the
     * caller exactly like ctx.expanded, so the state survives a re-render. */
    var open = ctx.expandedText.has(path);
    span.appendChild(highlight(open ? text : text.slice(0, LONG_TEXT) + '…', q));

    var toggle = document.createElement('span');
    toggle.className = 'v-more';
    toggle.textContent = open ? ' show less' : ' show all ' + text.length + ' chars';
    toggle.title = open ? 'Collapse this value' : 'Show the full value';
    toggle.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (open) ctx.expandedText.delete(path);
      else ctx.expandedText.add(path);
      ctx.onToggle(path);
    });
    span.appendChild(toggle);

    span.title = t === 'string' ? value : text;
    return span;
  }

  function summarise(value, path, ctx) {
    var n = Array.isArray(value) ? value.length : Object.keys(value).length;
    var body = Array.isArray(value)
      ? ' [' + n + (n === 1 ? ' item]' : ' items]')
      : ' {' + n + (n === 1 ? ' key}' : ' keys}');
    if (ctx.changedBranch && ctx.changedBranch.has(path) && ctx.changed && ctx.changed.size) body += ' •';
    return body;
  }

  function collectMatches(value, path, keyText, q, out) {
    var selfHit = String(keyText).toLowerCase().indexOf(q) > -1;
    var hit = selfHit;
    if (selfHit && isContainer(value)) addAllPaths(value, path, out, 0);
    if (isContainer(value)) {
      entriesOf(value).forEach(function (pair) {
        var childPath = path ? path + SEP + pair[0] : pair[0];
        if (collectMatches(pair[1], childPath, pair[0], q, out)) hit = true;
      });
    } else if (String(value).toLowerCase().indexOf(q) > -1) {
      hit = true;
    }
    if (hit) out.add(path);
    return hit;
  }

  function addAllPaths(value, path, out, depth) {
    if (out.size > 20000 || depth > 40) return;
    out.add(path);
    if (!isContainer(value)) return;
    Object.keys(value).forEach(function (k) {
      addAllPaths(value[k], path ? path + SEP + k : k, out, depth + 1);
    });
  }

  function renderNode(parent, keyText, value, path, depth, ctx) {
    if (ctx.rows >= ctx.maxRows) return;
    if (ctx.filtering && !ctx.visible.has(path)) return;

    var container = isContainer(value);
    var open = container && (ctx.filtering || ctx.expanded.has(path));

    var row = document.createElement('div');
    row.className = 'row';
    row.style.paddingLeft = (4 + depth * 12) + 'px';
    if (ctx.changed && ctx.changed.has(path)) row.classList.add('is-changed');
    ctx.rows++;

    var twisty = document.createElement('span');
    twisty.className = 'twisty' + (container ? '' : ' is-leaf');
    twisty.textContent = container ? (open ? '▾' : '▸') : '';
    row.appendChild(twisty);

    var key = document.createElement('span');
    key.className = 'k' + (/^\d+$/.test(keyText) && depth > 0 ? ' is-index' : '');
    key.appendChild(highlight(keyText, ctx.q));
    row.appendChild(key);

    var colon = document.createElement('span');
    colon.className = 'punc';
    colon.textContent = ':';
    row.appendChild(colon);

    if (container) {
      var head = document.createElement('span');
      head.className = 'preview';
      head.textContent = open ? (Array.isArray(value) ? ' [' : ' {') : summarise(value, path, ctx);
      row.appendChild(head);

      row.addEventListener('click', function () {
        if (ctx.filtering) return;
        if (ctx.expanded.has(path)) ctx.expanded.delete(path);
        else ctx.expanded.add(path);
        ctx.onToggle(path);
      });
    } else {
      row.appendChild(valueSpan(value, ctx, path));
    }

    parent.appendChild(row);
    if (!container || !open) return;

    entriesOf(value).forEach(function (pair) {
      var childPath = path ? path + SEP + pair[0] : pair[0];
      renderNode(parent, pair[0], pair[1], childPath, depth + 1, ctx);
    });

    if (ctx.rows < ctx.maxRows) {
      var close = document.createElement('div');
      close.className = 'row';
      close.style.paddingLeft = (4 + depth * 12) + 'px';
      var pad = document.createElement('span');
      pad.className = 'twisty is-leaf';
      close.appendChild(pad);
      var brace = document.createElement('span');
      brace.className = 'punc';
      brace.textContent = Array.isArray(value) ? ']' : '}';
      close.appendChild(brace);
      parent.appendChild(close);
      ctx.rows++;
    }
  }

  function render(parent, rootKey, value, opts) {
    opts = opts || {};
    var ctx = {
      rows: 0,
      maxRows: opts.maxRows || 4000,
      expanded: opts.expanded || new Set(['']),
      expandedText: opts.expandedText || new Set(),
      changed: opts.changed || null,
      changedBranch: opts.changedBranch || null,
      onToggle: opts.onToggle || function () {},
      q: '',
      filtering: false,
      visible: null
    };

    var q = (opts.filter || '').trim().toLowerCase();
    if (q) {
      var visible = new Set();
      collectMatches(value, '', '', q, visible);
      if (!visible.size) return { rows: 0, matched: false, truncated: false };
      ctx.q = q;
      ctx.filtering = true;
      ctx.visible = visible;
    }

    var frag = document.createDocumentFragment();
    renderNode(frag, rootKey, value, '', 0, ctx);
    parent.appendChild(frag);

    return { rows: ctx.rows, matched: true, truncated: ctx.rows >= ctx.maxRows };
  }

  /* ------------------------------------------------------------------ *
   * Copy
   *
   * The tree lays each node out as separate <span>s in a flex row, so a raw
   * browser copy of a multi-row selection comes out as "key", newline, ":",
   * newline, "value". Rebuild the selection as clean, indented key: value text
   * instead.
   * ------------------------------------------------------------------ */

  function cellText(row) {
    var k = row.querySelector(':scope > .k');
    var punc = row.querySelector(':scope > .punc');
    var prev = row.querySelector(':scope > .preview');
    var v = row.querySelector(':scope > .v');

    if (!k && punc) return punc.textContent;           // lone closing brace

    var out = (k ? k.textContent : '') + ':';
    if (prev) return out + prev.textContent;           // ' {'  /  ' {3 keys}'
    if (!v) return out;

    var more = v.querySelector('.v-more');
    if (more && v.classList.contains('v-string')) {
      return out + ' ' + JSON.stringify(v.getAttribute('title') || '');
    }
    var clone = v.cloneNode(true);
    var m = clone.querySelector('.v-more');
    if (m) m.remove();
    return out + clone.textContent.replace(/\s+$/, '');
  }

  document.addEventListener('copy', function (ev) {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    var anchor = sel.anchorNode;
    anchor = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentNode);
    if (!anchor || !anchor.closest) return;

    var tree = anchor.closest('.viewport, .detail-body, .log-detail');
    if (!tree || !tree.querySelector('.row')) return;

    var lines = [];
    var rows = tree.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) {
      if (!sel.containsNode(rows[i], true)) continue;
      var px = parseFloat(rows[i].style.paddingLeft) || 4;
      var depth = Math.max(0, Math.round((px - 4) / 12));
      lines.push(new Array(depth + 1).join('  ') + cellText(rows[i]));
    }
    if (!lines.length || !ev.clipboardData) return;

    ev.clipboardData.setData('text/plain', lines.join('\n'));
    ev.preventDefault();
  });

  global.JsonTree = {
    /* How long a change stays marked. The Data tab rebuilds its tree on every
     * poll, so it has to remember changed paths for this long or they vanish
     * after one render. Structure updates cells in place and needs no such
     * memory — but both fade over the same --flash-duration in the CSS. */
    HIGHLIGHT_MS: 3000,
    render: render,
    addAllPaths: addAllPaths,
    isContainer: isContainer,
    SEP: SEP
  };

})(window);