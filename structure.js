'use strict';

/* Structure tab: the OmniScript's elements, read from its definition and joined
 * against the live data. The frame and the OmniScript itself are chosen in the
 * shared scope bar (targets.js), so this file only asks for two payloads. */
(function (global) {

  var state = {
    active: false,
    visible: true,
    defProp: 'jsonDef',
    dataProp: 'jsonDataStr',
    elements: [],
    data: undefined,
    dataRaw: null,
    header: null,           // scriptHeaderDef: allCustomLabels + labelMap
    error: null,
    filter: '',
    actionsOnly: false,
    selectedKey: null,
    detailTab: 'definition',
    detailFilter: '',
    cells: {},
    collapsed: new Set(),   // element keys whose section is folded; empty ⇒ all open
    expanded: {
      definition: new Set(['']), value: new Set(['']),
      conditions: new Set(['']), validation: new Set([''])
    },
    expandedText: {
      definition: new Set(), value: new Set(),
      conditions: new Set(), validation: new Set()
    }
  };

  var el = {};

  var CHILD_KEYS = ['eleArray', 'children', 'childrenElements'];

  /* A multi-language OmniScript stores every label and Text Block as a custom
   * label *key*; a single-language one stores the text directly on the element.
   * scriptHeaderDef tells us which (bpLang) and holds the key → text map. */
  function makeResolver(header) {
    var labels = (header && header.allCustomLabels) || {};
    return {
      multiLang: !!header && header.bpLang === 'Multi-Language',
      /* Only trust "missing" checks when we actually have the label map. */
      hasLabels: Object.keys(labels).length > 0,
      /* Is the key present in the map at all? (Absence is the breakage.) */
      has: function (k) {
        return !!k && Object.prototype.hasOwnProperty.call(labels, k);
      },
      /* Resolve a key to its text; '' when absent, tolerant of value shape. */
      key: function (k) {
        if (!k) return '';
        var v = labels[k];
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return v.value || v.text || v.label || '';
        return '';
      }
    };
  }

  function stripHtml(s) {
    return String(s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ').trim();
  }

  function resolveText(s, R) {
    if (!s || typeof s !== 'string') return s || '';
    return (R.multiLang && R.key(s)) || s;
  }

  function isTextBlock(node) { return /text ?block/i.test(node.type || ''); }

  /* The human-readable name for an element: its label, or a Text Block's text. */
  function elementLabel(node, ps, R) {
    if (isTextBlock(node)) {
      if (R.multiLang && ps.textKey) { var t = R.key(ps.textKey); if (t) return stripHtml(t); }
      if (typeof ps.text === 'string' && ps.text) return stripHtml(ps.text);
      if (ps.textKey) { var k = R.key(ps.textKey); if (k) return stripHtml(k); }
      return '';
    }
    var raw = ps.label || '';
    if (!raw) return '';
    return R.multiLang ? (R.key(raw) || raw) : raw;
  }

  /* The custom-label key the element points at, if any (Text Block uses textKey). */
  function labelKeyOf(node, ps) {
    return isTextBlock(node) ? (ps.textKey || ps.label || '') : (ps.label || '');
  }

  /* Dependent / dynamic option lists (DataRaptor, SObject, custom) carry no
   * static labels; only manually entered options do. */
  function hasOptionSource(ps) {
    var os = ps.optionSource;
    return !!(os && typeof os === 'object' && (os.type || os.source));
  }

  /* propSetMap string properties that hold user-facing text — a custom-label key
   * in a multi-language script, literal text otherwise. Steps carry the whole
   * navigation set; other element types carry a subset. */
  var TEXT_PROPS = [
    'label', 'helpText',
    'completeLabel', 'completeMessage',
    'saveLabel', 'saveMessage',
    'cancelLabel', 'cancelMessage',
    'nextLabel', 'previousLabel',
    'failureAbortLabel', 'failureAbortMessage',
    'failureGoBackLabel', 'failureNextLabel', 'inProgressMessage',
    'redirectNextLabel', 'redirectPreviousLabel',
    'postMessage'
  ];

  function humanize(k) {
    return k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  /* Every spot a multi-language OmniScript keeps a custom-label key: the text
   * properties above, a Text Block's text, and each manual choice option. For
   * radio/select options the label key lives in `value` (the option's stored
   * data is in `name`). */
  function translatableKeys(node, ps) {
    var out = [];
    if (isTextBlock(node) && typeof ps.textKey === 'string' && ps.textKey) {
      out.push({ where: 'text', key: ps.textKey });
    }
    TEXT_PROPS.forEach(function (p) {
      if (typeof ps[p] === 'string' && ps[p]) out.push({ where: humanize(p), key: ps[p] });
    });
    if (Array.isArray(ps.messages)) {
      ps.messages.forEach(function (m, i) {
        if (m && typeof m.text === 'string' && m.text && m.active !== false) {
          out.push({ where: 'message ' + (i + 1), key: m.text });
        }
      });
    }
    if (Array.isArray(ps.options) && !hasOptionSource(ps)) {
      ps.options.forEach(function (o) {
        if (o && typeof o.value === 'string' && o.value) {
          out.push({ where: 'option "' + (o.name != null ? o.name : '?') + '"', key: o.value });
        }
      });
    }
    return out;
  }

  /* Custom-label keys the element references that are absent from
   * allCustomLabels — a single one breaks a multi-language OmniScript. */
  function missingLabels(node, ps, R) {
    if (!R.multiLang || !R.hasLabels) return [];
    return translatableKeys(node, ps).filter(function (t) { return !R.has(t.key); });
  }

  /* For a manual radio/select: { storedValue -> option display text }, so the
   * live value can read "US (United States)" instead of just "US". The option's
   * data is in `name`; its label is in `value` (a custom-label key when
   * multi-lang, literal text otherwise). */
  function optionLabelMap(ps, R) {
    if (!Array.isArray(ps.options) || !ps.options.length || hasOptionSource(ps)) return null;
    var map = {};
    var any = false;
    ps.options.forEach(function (o) {
      if (!o || o.name == null) return;
      var raw = o.value != null ? String(o.value) : '';
      var text = R.multiLang ? (R.key(raw) || raw) : raw;
      if (text) { map[String(o.name)] = text; any = true; }
    });
    return any ? map : null;
  }

  function flatten(def, header) {
    var out = [];
    var labelMap = (header && header.labelMap) || {};
    var R = makeResolver(header);

    function visit(node, depth, path) {
      if (Array.isArray(node)) {
        node.forEach(function (n) { visit(n, depth, path); });
        return;
      }
      if (!node || typeof node !== 'object') return;

      var isElement = typeof node.name === 'string' && typeof node.type === 'string';
      var nextDepth = depth;
      var nextPath = path;

      if (isElement) {
        var ps = node.propSetMap || {};
        var key = path + '/' + node.name + '#' + out.length;
        var showExpr = describeShow(ps.show);
        var isSetValues = /set ?values/i.test(node.type || '');
        out.push({
          key: key,
          parentKey: path,
          hasChildren: false,   // filled in after the walk
          name: node.name,
          type: node.type,
          label: elementLabel(node, ps, R),
          labelKey: labelKeyOf(node, ps),
          missingLabels: missingLabels(node, ps, R),
          /* Exact location of the value in the data JSON, best available. */
          jsonPath: node.JSONPath || node.jsonPath || labelMap[node.name] || '',
          depth: depth,
          category: categoryOf(node.type),
          required: ps.required === true,
          conditional: !!(ps.show && Object.keys(ps.show).length),
          show: ps.show || null,
          showExpr: showExpr,
          remote: ps.remoteClass || ps.bundle || ps.integrationProcedureKey || '',
          isSetValues: isSetValues,
          setValues: isSetValues ? (ps.elementValueMap || null) : null,
          optionLabels: optionLabelMap(ps, R),
          validation: describeValidation(node, ps, showExpr, R),
          node: node
        });
        nextDepth = depth + 1;
        nextPath = key;
      }

      CHILD_KEYS.forEach(function (k) {
        if (node[k]) visit(node[k], nextDepth, nextPath);
      });
    }

    visit(def, 0, '');

    var withKids = {};
    out.forEach(function (e) { if (e.parentKey) withKids[e.parentKey] = true; });
    out.forEach(function (e) { e.hasChildren = !!withKids[e.key]; });

    return out;
  }

  /* A glyph per family of element, so the shape of a script is legible without
   * reading every type name. Order matters: "Text Block" is a display element,
   * not a text input, and "Email Action" is an action, not an email field. */
  var CATEGORIES = [
    { key: 'step',    glyph: '▤',  label: 'Step',
      test: /^\s*step\s*$/i },
    { key: 'error',   glyph: '⊘',  label: 'Validation / set errors / messaging',
      test: /set ?errors?|validation|messaging/i },
    { key: 'action',  glyph: '⚡', label: 'Action',
      test: /action|dataraptor|data mapper|integration|remote|http|calculation|matrix|pdf|docusign|navigate|response|set values|setvalues|post|extract/i },
    { key: 'choice',  glyph: '☑',  label: 'Choice',
      test: /checkbox|select|radio|multi|lookup|type ?ahead|toggle|dropdown/i },
    { key: 'display', glyph: '¶',  label: 'Display',
      test: /text block|line ?break|image|disclosure|messaging|title|link|html|rich/i },
    { key: 'block',   glyph: '▦',  label: 'Block',
      test: /block|repeat|group/i },
    { key: 'input',   glyph: '✎',  label: 'Input',
      test: /text|number|currency|date|time|email|phone|password|url|range|file|signature|slider|formula|aggregate/i },
    { key: 'custom',  glyph: '<>', label: 'Custom component',
      test: /custom|lwc|aura|component/i }
  ];

  function categoryOf(type) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].test.test(type || '')) return CATEGORIES[i];
    }
    return { key: 'other', glyph: '•', label: 'Element' };
  }

  /* Turns a propSetMap.show group into something readable, e.g.
   * Step1:Email != "" AND (Type = "Business" OR Amount > 1000). Shape varies,
   * so anything unrecognised falls back to the raw tree in the Visibility tab. */
  function describeShow(show) {
    if (!show || typeof show !== 'object') return '';
    return formatGroup(show.group || show, 0);
  }

  function formatGroup(group, depth) {
    if (!group || typeof group !== 'object' || depth > 6) return '';
    var op = group.operator || group.conditionOp || 'AND';
    var parts = [];
    /* A rules[] entry is usually a leaf { field, condition, data }, but the
     * Designer also nests groups straight into rules as { group: {…} } (or as a
     * bare group object). Recurse on those rather than dropping them. */
    (group.rules || []).forEach(function (r) {
      if (r && typeof r === 'object' && (r.group || r.rules || r.groups)) {
        var nested = formatGroup(r.group || r, depth + 1);
        if (nested) parts.push('(' + nested + ')');
        return;
      }
      var text = formatRule(r);
      if (text) parts.push(text);
    });
    (group.groups || []).forEach(function (g) {
      var text = formatGroup(g && g.group ? g.group : g, depth + 1);
      if (text) parts.push('(' + text + ')');
    });
    return parts.join(' ' + op + ' ');
  }

  function firstString(ps, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (typeof ps[keys[i]] === 'string' && ps[keys[i]].trim()) return ps[keys[i]];
    }
    return '';
  }

  /* Best-effort read of an element's validation setup, only for the element
   * types that are about validation: Set Errors, and Messaging / Validation
   * (both flagged bMessaging). The raw propSetMap is shown underneath regardless. */
  function describeValidation(node, ps, showExpr, R) {
    var isSetErrors = node.bSetErrors === true || /set ?errors?/i.test(node.type || '');
    var isMessaging = node.bMessaging === true || /messaging|validation/i.test(node.type || '');

    var v = {
      kind: isSetErrors ? 'set-errors' : (isMessaging ? 'messaging' : ''),
      errorMap: [], runsOn: '', triggerExpr: '', validateExpr: '', message: '', messages: [],
      raw: ps, has: isSetErrors || isMessaging
    };
    if (!v.has) return v;

    /* Set Errors carries { targetElementName: message } — elementErrorMap. */
    var map = (ps.elementErrorMap && typeof ps.elementErrorMap === 'object' &&
               !Array.isArray(ps.elementErrorMap)) ? ps.elementErrorMap : null;
    if (!map) {
      Object.keys(ps).forEach(function (k) {
        if (!map && /error.?map/i.test(k) &&
            ps[k] && typeof ps[k] === 'object' && !Array.isArray(ps[k])) map = ps[k];
      });
    }
    if (map) {
      Object.keys(map).forEach(function (elName) {
        v.errorMap.push({ element: elName, message: resolveText(String(map[elName]), R) });
      });
    }

    if (typeof ps.validationRequired === 'string') v.runsOn = ps.validationRequired;
    if (isSetErrors && showExpr) v.triggerExpr = showExpr;
    v.message = resolveText(firstString(ps, ['validationMessage', 'errorMessage', 'messageErrorText']), R);

    /* validateExpression: the expression the element checks. String or a group. */
    var ve = ps.validateExpression;
    if (typeof ve === 'string' && ve.trim()) v.validateExpr = ve.trim();
    else if (ve && typeof ve === 'object') v.validateExpr = formatGroup(ve.group || ve, 0);

    var msgs = ps.messages || ps.messageMap;
    if (Array.isArray(msgs)) {
      msgs.forEach(function (m) {
        if (!m || typeof m !== 'object' || m.active === false) return;
        var text = resolveText(m.message || m.text || m.messageText || '', R);
        if (!text) return;
        v.messages.push({
          type: m.messageType || m.type || 'message',
          text: text,
          /* value = the expression result this message is shown for. */
          when: m.value === true ? 'true' : (m.value === false ? 'false' : ''),
          condition: describeShow(m.show) ||
            (m.condition ? formatGroup(m.condition.group || m.condition, 0) : '')
        });
      });
    }

    return v;
  }

  function formatRule(rule) {
    if (!rule || typeof rule !== 'object') return '';
    var field = rule.field || rule.name || '';
    var cond = rule.condition || rule.operator || '=';
    var data = rule.data !== undefined ? rule.data : rule.value;
    var value = (data === '' || data === undefined || data === null) ? '""'
      : (typeof data === 'string' ? '"' + data + '"' : String(data));
    return (field + ' ' + cond + ' ' + value).trim();
  }

  /* First value in the data whose key matches the element name. OmniScript
   * nests values under step names, so a plain lookup would miss most of them. */
  function valueFor(data, name, depth) {
    if (!data || typeof data !== 'object' || (depth || 0) > 12) return undefined;
    if (Object.prototype.hasOwnProperty.call(data, name)) return data[name];
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var child = data[keys[i]];
      if (child && typeof child === 'object') {
        var hit = valueFor(child, name, (depth || 0) + 1);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  }

  function preview(v) {
    if (v === undefined) return '';
    if (v === null) return 'null';
    if (typeof v === 'object') {
      return Array.isArray(v) ? '[' + v.length + ']' : '{' + Object.keys(v).length + '}';
    }
    var s = String(v);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  function parseObj(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { var o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; }
    catch (e) { return null; }
  }

  /* Walk an OmniScript JSONPath: colon-separated, nested under step names, with
   * a "|N" suffix on repeat-block segments (e.g. "Step:Block|1:Field"). */
  function resolvePath(data, path) {
    if (!data || !path) return undefined;
    var parts = String(path).split(':');
    var cur = data;
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i], idx = -1, bar = seg.indexOf('|');
      if (bar > -1) { idx = Number(seg.slice(bar + 1)); seg = seg.slice(0, bar); }
      if (!cur || typeof cur !== 'object' ||
          !Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
      cur = cur[seg];
      if (idx > -1 && Array.isArray(cur)) {
        cur = (idx in cur) ? cur[idx] : ((idx - 1) in cur ? cur[idx - 1] : cur[0]);
      }
    }
    return cur;
  }

  /* The element's current value: exact JSONPath first, name search as a fallback. */
  function elementValue(e) {
    var v = e.jsonPath ? resolvePath(state.data, e.jsonPath) : undefined;
    return v === undefined ? valueFor(state.data, e.name) : v;
  }

  /* A value for display: a radio/select stores the option's data value, so show
   * "US (United States)" by joining in the option label. Falls back to preview(). */
  function displayValue(e, v) {
    if (e.optionLabels) {
      var one = function (x) {
        var lbl = e.optionLabels[String(x)];
        return (lbl && lbl !== String(x)) ? String(x) + ' (' + lbl + ')' : String(x);
      };
      if (Array.isArray(v)) return v.map(one).join(', ');
      if (typeof v === 'string' || typeof v === 'number') return one(v);
    }
    return preview(v);
  }

  /* -------------------------------------------------------- retrieval */

  function load() {
    if (!Targets.selected()) {
      state.elements = [];
      state.error = null;
      render();
      return;
    }

    Targets.fetch(state.defProp, function (def, error) {
      if (error) {
        state.error = error.value || error.description || error.error ||
          'The definition could not be read.';
        state.elements = [];
        render();
        return;
      }

      state.error = null;

      if (!def) {
        state.elements = [];
        render();
        return;
      }

      var parsedDef;
      try {
        parsedDef = JSON.parse(def);
      } catch (e) {
        state.elements = [];
        state.error = 'The definition is not valid JSON: ' + e.message;
        render();
        return;
      }

      /* scriptHeaderDef is a sibling property: allCustomLabels resolves label
       * text, labelMap gives each element's JSONPath. Optional — the tab works
       * without it. */
      Targets.fetch('scriptHeaderDef', function (headerRaw) {
        state.header = parseObj(headerRaw);

        try {
          state.elements = flatten(parsedDef, state.header);
        } catch (e) {
          state.elements = [];
          state.error = 'Could not read the definition: ' + e.message;
        }

        Targets.fetch(state.dataProp, function (raw) {
          state.dataRaw = raw || null;
          try {
            state.data = raw ? JSON.parse(raw) : undefined;
          } catch (e) {
            state.data = undefined;
          }
          render();
        });
      });
    });
  }

  /* ---------------------------------------------------- live values */

  var pulseTimer = null;

  function schedulePulse() {
    clearTimeout(pulseTimer);
    if (!state.active || !state.visible) return;
    pulseTimer = setTimeout(pulse, 2000);
  }

  function pulse() {
    if (!state.active || !state.visible || !Targets.selected()) { schedulePulse(); return; }
    Targets.fetch(state.dataProp, function (raw) {
      if (raw !== state.dataRaw) applyData(raw);
      schedulePulse();
    });
  }

  /* Values change constantly as the script is filled in, so refresh the cells
   * in place rather than rebuilding the list, which would lose scroll position
   * and fight with anyone reading it. */
  function applyData(raw) {
    state.dataRaw = raw;
    try {
      state.data = raw ? JSON.parse(raw) : undefined;
    } catch (e) {
      return;
    }

    state.elements.forEach(function (e) {
      var cell = state.cells[e.key];
      if (!cell) return;
      var next = displayValue(e, elementValue(e));
      if (cell.textContent === next) return;
      cell.textContent = next;
      cell.classList.remove('is-changed');
      void cell.offsetWidth;               // restart the animation
      cell.classList.add('is-changed');
      clearTimeout(cell.__flash);
      cell.__flash = setTimeout(function () {
        cell.classList.remove('is-changed');
      }, JsonTree.HIGHLIGHT_MS);
    });

    if (state.detailTab === 'value') renderDetail();
  }

  /* -------------------------------------------------------- rendering */

  function visible() {
    var q = state.filter.trim().toLowerCase();
    return state.elements.filter(function (e) {
      if (state.actionsOnly && !e.remote) return false;
      if (!q) return true;
      return (e.name + ' ' + e.type + ' ' + e.label + ' ' + e.labelKey).toLowerCase().indexOf(q) > -1;
    });
  }

  function render() {
    renderList();
    renderDetail();
    renderStatus();
  }

  function header() {
    var row = document.createElement('div');
    row.className = 'log-row log-head';
    var spacer = document.createElement('span');
    spacer.className = 'twisty is-leaf';
    row.appendChild(spacer);
    [['el-icon', '', 'Element family'],
     ['log-name', 'Element', 'Label from the definition, or the element name when it has none'],
     ['el-type', 'Type', 'Element type as defined in the OmniScript'],
     ['el-value', 'Value', 'Current value in the live data']
    ].forEach(function (c) {
      var cell = document.createElement('span');
      cell.className = c[0];
      cell.textContent = c[1];
      cell.title = c[2];
      row.appendChild(cell);
    });
    return row;
  }

  function renderList() {
    var list = el.list;
    list.textContent = '';
    state.cells = {};

    if (state.error) {
      list.appendChild(notice('Could not read the definition', state.error, true));
      return;
    }

    if (!Targets.selected()) {
      list.appendChild(notice('No OmniScript selected',
        'Pick one in the bar above, or press Rescan if the list is empty.', false));
      return;
    }

    if (!state.elements.length) {
      var box = notice('Nothing on ' + state.defProp,
        'This OmniScript exposes no definition on that property. Change the Definition field if your build names it differently.',
        false);
      Targets.hints().forEach(function (h) {
        if (!h.props || !h.props.length) return;
        var p = document.createElement('div');
        p.style.marginTop = '6px';
        p.textContent = h.tag + ' exposes: ' + h.props.join(', ');
        box.appendChild(p);
      });
      list.appendChild(box);
      return;
    }

    var rows = visible();
    if (!rows.length) {
      list.appendChild(notice('No elements', 'Nothing matches the current filter.', false));
      return;
    }

    /* Sections only fold when the list still reflects the real tree — a text
     * filter or Actions only strips parents out, so honour neither then. */
    var sectioning = !state.filter.trim() && !state.actionsOnly;
    var byKey = {};
    state.elements.forEach(function (e) { byKey[e.key] = e; });

    if (sectioning) {
      rows = rows.filter(function (e) {
        var p = byKey[e.parentKey];
        var guard = 0;
        while (p && guard++ < 100) {
          if (state.collapsed.has(p.key)) return false;
          p = byKey[p.parentKey];
        }
        return true;
      });
    }

    list.appendChild(header());

    rows.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'log-row';
      if (e.key === state.selectedKey) row.classList.add('is-selected');

      var twisty = document.createElement('span');
      twisty.className = 'twisty';
      twisty.style.marginLeft = (e.depth * 12) + 'px';
      if (sectioning && e.hasChildren) {
        var folded = state.collapsed.has(e.key);
        twisty.textContent = folded ? '▸' : '▾';
        twisty.title = folded ? 'Expand section' : 'Collapse section';
        twisty.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (state.collapsed.has(e.key)) state.collapsed.delete(e.key);
          else state.collapsed.add(e.key);
          renderList();
        });
      } else {
        twisty.classList.add('is-leaf');
      }
      row.appendChild(twisty);

      var icon = document.createElement('span');
      icon.className = 'el-icon is-' + e.category.key;
      icon.textContent = e.category.glyph;
      icon.title = e.category.label + ' — ' + e.type;
      row.appendChild(icon);

      var name = document.createElement('span');
      name.className = 'log-name';
      name.textContent = e.name + (e.label ? ' (' + e.label + ')' : '');
      name.title = e.name + ' — ' + e.type +
        (e.label ? '\n' + (e.label.length > 300 ? e.label.slice(0, 300) + '…' : e.label) : '');
      if (e.missingLabels.length) row.classList.add('is-broken');
      row.appendChild(name);

      if (e.required) row.appendChild(tag('req', 'Required'));
      if (e.conditional) {
        row.appendChild(tag('cond', e.showExpr ? 'Visible when: ' + e.showExpr
                                               : 'Has show/hide conditions'));
      }
      if (e.remote) row.appendChild(tag('act', 'Calls ' + e.remote));

      if (e.missingLabels.length) {
        row.appendChild(tag('missing',
          (e.missingLabels.length === 1
            ? 'Custom label "' + e.missingLabels[0].key + '" (' + e.missingLabels[0].where + ')'
            : e.missingLabels.length + ' custom labels') +
          ' missing from allCustomLabels — the OmniScript will not render correctly:\n' +
          e.missingLabels.map(function (m) { return '• ' + m.where + ': ' + m.key; }).join('\n')));
      }

      var type = document.createElement('span');
      type.className = 'el-type';
      type.textContent = e.type;
      row.appendChild(type);

      var value = document.createElement('span');
      value.className = 'el-value';
      value.textContent = displayValue(e, elementValue(e));
      state.cells[e.key] = value;
      row.appendChild(value);

      row.addEventListener('click', function () {
        state.selectedKey = e.key;
        state.expanded = {
          definition: new Set(['']), value: new Set(['']),
          conditions: new Set(['']), validation: new Set([''])
        };
        state.expandedText = {
          definition: new Set(), value: new Set(),
          conditions: new Set(), validation: new Set()
        };
        render();
      });

      list.appendChild(row);
    });
  }

  var TAG_GLYPH = { req: '!', cond: '?', act: '\u2197', missing: '\u26a0' };

  function tag(kind, title) {
    var s = document.createElement('span');
    s.className = 'tag tag-' + kind;
    s.textContent = TAG_GLYPH[kind] || '';
    s.title = title;
    return s;
  }

  function selected() {
    for (var i = 0; i < state.elements.length; i++) {
      if (state.elements[i].key === state.selectedKey) return state.elements[i];
    }
    return null;
  }

  /* The readable half of the Validation tab: what fires, when, and what the
   * user sees. The raw propSetMap is rendered underneath as the source of
   * truth, exactly like the Visibility tab. */
  function renderValidationSummary(v, container) {
    if (!v) return;

    function line(cls, label, text) {
      var d = document.createElement('div');
      d.className = cls;
      if (label) {
        var b = document.createElement('b');
        b.textContent = label + '  ';
        d.appendChild(b);
      }
      d.appendChild(document.createTextNode(text));
      container.appendChild(d);
    }

    if (v.kind === 'set-errors') {
      if (v.triggerExpr) line('cond-expr', 'Sets error when:', v.triggerExpr);
      else line('cond-expr', 'Sets error:', 'unconditionally while this element is reached');
      v.errorMap.forEach(function (m) {
        line('cond-expr', 'Error on ' + m.element + ':', '“' + m.message + '”');
      });
      if (v.message) line('cond-expr', 'Message:', '“' + v.message + '”');

      var notes = [];
      notes.push('Checked ' + (/^step$/i.test(v.runsOn || 'step')
        ? 'when the user moves between steps.'
        : 'on ' + v.runsOn + '.'));
      notes.push('While the condition holds, the message is placed on the named ' +
        'element (often on an earlier step) and the user cannot advance; it clears ' +
        'once the condition no longer matches.');
      notes.forEach(function (t) { line('valid-note', '', t); });
    } else if (v.kind === 'messaging') {
      if (v.validateExpr) line('cond-expr', 'Expression:', v.validateExpr);
      v.messages.forEach(function (m) {
        var suffix = m.condition ? '  —  when ' + m.condition
          : (m.when === 'true' ? '  —  when the expression is true'
            : m.when === 'false' ? '  —  when the expression is false' : '');
        line('cond-expr', (m.type || 'message') + ':', '“' + (m.text || '') + '”' + suffix);
      });
      line('valid-note', '',
        'The element evaluates its expression and shows the matching message in place; ' +
        'a Requirement or Error message also blocks step navigation.');
    }

    if (!container.childElementCount) {
      line('valid-note', '',
        'Validation is configured on this element — see the raw definition below.');
    }
  }

  function renderDetail() {
    var pane = el.detail;
    pane.textContent = '';

    var e = selected();
    if (!e) {
      pane.appendChild(notice('Select an element',
        'Its definition, current value and visibility conditions appear here.', false));
      return;
    }

    var head = document.createElement('div');
    head.className = 'detail-head';

    var title = document.createElement('div');
    title.className = 'detail-title';
    var shortLabel = e.label.length > 120 ? e.label.slice(0, 120) + '…' : e.label;
    title.textContent = e.name + (e.label ? ' (' + shortLabel + ')' : '');
    if (shortLabel !== e.label) title.title = e.label;
    head.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'detail-meta';
    var bits = [e.type, 'name: ' + e.name];
    if (e.required) bits.push('required');
    if (e.conditional) bits.push('conditional');
    if (e.remote) bits.push('calls ' + e.remote);
    meta.textContent = bits.join(' \u00b7 ');
    head.appendChild(meta);

    /* In a multi-language script the label is a custom-label key, not the text \u2014
     * show it so it can be found and fixed in Custom Labels. */
    if (e.labelKey && (e.labelKey !== e.label || e.missingLabels.length)) {
      var lk = document.createElement('div');
      lk.className = 'detail-meta detail-labelkey';
      var kind = isTextBlock(e.node) && e.node.propSetMap && e.node.propSetMap.textKey
        ? 'text key: ' : 'label: ';
      lk.textContent = kind + e.labelKey;
      head.appendChild(lk);
    }

    /* One red line per custom-label key that is missing from allCustomLabels. */
    e.missingLabels.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'detail-meta detail-labelkey is-broken';
      d.textContent = 'missing label \u00b7 ' + m.where + ': ' + m.key;
      head.appendChild(d);
    });

    var hasValidation = !!(e.validation && e.validation.has);

    /* A Set Values element doesn't hold a value of its own — it writes into the
     * data JSON — so its second tab shows the assignments it makes instead. */
    var valueTab = e.isSetValues
      ? { label: 'Set values', data: e.setValues, on: !!e.setValues }
      : (function () { var v = elementValue(e); return { label: 'Current value', data: v, on: v !== undefined }; })();

    var body = {
      definition: e.node, value: valueTab.data, conditions: e.show,
      validation: (e.validation && e.validation.raw) || null
    };

    /* Resolve the current tab before drawing the strip, so a disabled tab can
     * never be the highlighted one. */
    var available = [
      ['definition', 'Definition', true],
      ['value', valueTab.label, valueTab.on],
      ['conditions', 'Visibility', !!e.conditional]
    ];
    if (hasValidation) available.push(['validation', 'Validation', true]);

    var DISABLED_WHY = {
      value: e.isSetValues ? 'This Set Values element has no assignments'
                           : 'This element holds no value right now',
      conditions: 'This element has no show/hide conditions — it is always visible',
      validation: 'This element has no validation'
    };

    if (!available.some(function (p) { return p[0] === state.detailTab && p[2]; })) {
      state.detailTab = 'definition';
    }

    var tools = document.createElement('div');
    tools.className = 'detail-tools';

    var tabs = document.createElement('div');
    tabs.className = 'seg';
    available.forEach(function (pair) {
      var b = document.createElement('button');
      b.className = 'seg-btn' + (state.detailTab === pair[0] ? ' is-on' : '');
      b.textContent = pair[1];
      if (!pair[2]) {
        b.disabled = true;
        b.title = DISABLED_WHY[pair[0]] || '';
      } else {
        b.addEventListener('click', function () {
          state.detailTab = pair[0];
          renderDetail();
        });
      }
      tabs.appendChild(b);
    });
    tools.appendChild(tabs);

    var shown = body[state.detailTab];
    var treeable = JsonTree.isContainer(shown);

    var expand = document.createElement('button');
    expand.className = 'icon-btn tiny';
    expand.textContent = 'Expand all';
    expand.disabled = !treeable;
    expand.addEventListener('click', function () {
      var set = new Set();
      JsonTree.addAllPaths(shown, '', set, 0);
      state.expanded[state.detailTab] = set;
      renderDetail();
    });
    tools.appendChild(expand);

    var collapse = document.createElement('button');
    collapse.className = 'icon-btn tiny';
    collapse.textContent = 'Collapse all';
    collapse.disabled = !treeable;
    collapse.addEventListener('click', function () {
      state.expanded[state.detailTab] = new Set(['']);
      renderDetail();
    });
    tools.appendChild(collapse);

    var copy = document.createElement('button');
    copy.className = 'icon-btn tiny';
    copy.textContent = 'Copy';
    copy.addEventListener('click', function () {
      var text = JSON.stringify(shown, null, 2);
      navigator.clipboard.writeText(text).then(function () {
        copy.textContent = 'Copied';
        setTimeout(function () { copy.textContent = 'Copy'; }, 1200);
      }, function () {});
    });
    tools.appendChild(copy);

    var find = document.createElement('input');
    find.type = 'search';
    find.className = 'detail-find';
    find.placeholder = 'Filter keys and values';
    find.spellcheck = false;
    find.value = state.detailFilter;
    var findTimer = null;
    find.addEventListener('input', function () {
      var v = find.value;
      clearTimeout(findTimer);
      findTimer = setTimeout(function () {
        state.detailFilter = v;
        renderDetail();
        var again = el.detail.querySelector('.detail-find');
        if (again) { again.focus(); again.setSelectionRange(v.length, v.length); }
      }, 150);
    });
    tools.appendChild(find);

    head.appendChild(tools);
    pane.appendChild(head);

    var content = document.createElement('div');
    content.className = 'detail-body';
    pane.appendChild(content);

    if (state.detailTab === 'conditions' && e.showExpr) {
      var expr = document.createElement('div');
      expr.className = 'cond-expr';
      expr.textContent = 'Visible when:  ' + e.showExpr;
      content.appendChild(expr);
    }

    if (state.detailTab === 'validation') {
      renderValidationSummary(e.validation, content);
    }

    if (state.detailTab === 'value' && e.isSetValues) {
      var sv = document.createElement('div');
      sv.className = 'valid-note';
      sv.textContent = 'Assignments this element writes into the OmniScript data ' +
        '(target field → value or formula). It holds no value of its own.';
      content.appendChild(sv);
    }

    if (!treeable) {
      var text = shown === undefined ? 'No value.'
        : (state.detailTab === 'value' ? displayValue(e, shown) : String(shown));
      content.appendChild(notice('', text, false));
      return;
    }

    var result = JsonTree.render(content, state.detailTab, shown, {
      expanded: state.expanded[state.detailTab],
      expandedText: state.expandedText[state.detailTab],
      filter: state.detailFilter,
      onToggle: renderDetail
    });

    if (!result.matched) {
      content.appendChild(notice('', 'Nothing here matches "' + state.detailFilter + '".', false));
    }
  }

  function notice(title, body, isError) {
    var box = document.createElement('div');
    box.className = 'notice' + (isError ? ' is-error' : '');
    if (title) {
      var h = document.createElement('h2');
      h.textContent = title;
      box.appendChild(h);
    }
    var p = document.createElement('div');
    p.textContent = body;
    box.appendChild(p);
    return box;
  }

  function renderStatus() {
    if (!state.active) return;
    var shown = visible().length;
    document.getElementById('status-left').textContent = state.elements.length
      ? shown + ' of ' + state.elements.length + ' elements'
      : 'No definition loaded';
    var host = Targets.selected();
    var lang = state.header && state.header.bpLang ? ' \u00b7 ' + state.header.bpLang : '';
    document.getElementById('status-right').textContent = host
      ? state.defProp + ' \u00b7 ' + host.label + lang
      : '';
  }

  /* ----------------------------------------------------------- wiring */

  function mount() {
    el.list = document.getElementById('struct-list');
    el.detail = document.getElementById('struct-detail');

    document.getElementById('struct-refresh').addEventListener('click', function () {
      Targets.refresh(function () { load(); });
    });

    document.getElementById('struct-prop').addEventListener('change', function (ev) {
      state.defProp = ev.currentTarget.value.trim() || 'jsonDef';
      ev.currentTarget.value = state.defProp;
      state.selectedKey = null;
      Targets.setProps(null, state.defProp);
    });

    document.getElementById('struct-actions-only').addEventListener('change', function (ev) {
      state.actionsOnly = ev.currentTarget.checked;
      render();
    });

    document.getElementById('struct-collapse').addEventListener('click', function () {
      state.collapsed = new Set();
      state.elements.forEach(function (e) { if (e.hasChildren) state.collapsed.add(e.key); });
      renderList();
    });

    document.getElementById('struct-expand').addEventListener('click', function () {
      state.collapsed = new Set();
      renderList();
    });

    var t = null;
    document.getElementById('struct-filter').addEventListener('input', function (ev) {
      var v = ev.currentTarget.value;
      clearTimeout(t);
      t = setTimeout(function () { state.filter = v; render(); }, 120);
    });

    /* The shared scope bar decides which OmniScript this is; reload whenever it
     * changes rather than keeping a frame or element list of our own. */
    Targets.subscribe(function () {
      state.selectedKey = null;
      state.collapsed = new Set();
      state.header = null;
      if (state.active) load();
    });
  }

  global.Structure = {
    mount: mount,
    show: function () { state.active = true; load(); schedulePulse(); },
    hide: function () { state.active = false; clearTimeout(pulseTimer); },
    setVisible: function (v) {
      state.visible = v;
      if (v) { if (state.active) { load(); schedulePulse(); } }
      else clearTimeout(pulseTimer);
    }
  };

})(window);