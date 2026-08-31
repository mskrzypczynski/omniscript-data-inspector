'use strict';

/* Remote actions tab.
 *
 * Listens to the DevTools network stream and decodes the Apex calls OmniStudio
 * makes. A remote action reaches the server as an Aura ApexAction wrapping
 * { sClassName, sMethodName, input, options }, so one HTTP request can carry
 * several actions — each becomes its own row.
 *
 * Everything is best-effort: when a shape is not recognised the entry still
 * appears with its raw request and response, so nothing is silently dropped.
 */
(function (global) {

  var MAX_ENTRIES = 500;

  var state = {
    active: false,
    recording: true,
    preserve: false,
    onlyOmni: true,
    filter: '',
    entries: [],
    selectedId: null,
    detailTab: 'input',
    detailFilter: '',
    expanded: { input: new Set(['']), output: new Set(['']), options: new Set(['']), raw: new Set(['']) },
    expandedText: { input: new Set(), output: new Set(), options: new Set(), raw: new Set() },
    seq: 0
  };

  var el = {};

  /* ---------------------------------------------------------- parsing */

  function classify(url, method) {
    if (String(method).toUpperCase() !== 'POST') return null;
    if (/\/aura(\?|$)/.test(url)) return 'aura';
    if (/webruntime\/api\/apex\/execute/.test(url)) return 'lwr';
    if (/\/apexremote/.test(url)) return 'vfremote';
    return null;
  }

  function safeParse(v) {
    if (typeof v !== 'string') return v;
    var t = v.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return v;
    try { return JSON.parse(t); } catch (e) { return v; }
  }

  function fromAuraAction(a) {
    var p = a.params || {};
    var inner = p.params || {};
    return {
      wireId: a.id,
      descriptor: a.descriptor || '',
      apexClass: p.classname || '',
      apexMethod: p.method || '',
      remoteClass: inner.sClassName || '',
      remoteMethod: inner.sMethodName || '',
      input: safeParse(inner.input !== undefined ? inner.input : inner),
      options: safeParse(inner.options),
      rawRequest: a
    };
  }

  function parseRequest(kind, text) {
    if (!text) return [];

    if (kind === 'aura') {
      var msg = null;
      try { msg = new URLSearchParams(text).get('message'); } catch (e) { /* fall through */ }
      if (!msg) return [];
      var parsed;
      try { parsed = JSON.parse(msg); } catch (e) { return []; }
      return (parsed.actions || []).map(fromAuraAction);
    }

    if (kind === 'lwr') {
      var body;
      try { body = JSON.parse(text); } catch (e) { return []; }
      var inner = (body.params && body.params.params) || body.params || {};
      return [{
        wireId: null,
        descriptor: 'webruntime/apex',
        apexClass: body.classname || '',
        apexMethod: body.method || '',
        remoteClass: inner.sClassName || '',
        remoteMethod: inner.sMethodName || '',
        input: safeParse(inner.input !== undefined ? inner.input : inner),
        options: safeParse(inner.options),
        rawRequest: body
      }];
    }

    if (kind === 'vfremote') {
      var calls;
      try { calls = JSON.parse(text); } catch (e) { return []; }
      if (!Array.isArray(calls)) calls = [calls];
      return calls.map(function (c) {
        var data = Array.isArray(c.data) ? c.data : [];
        return {
          wireId: c.tid !== undefined ? String(c.tid) : null,
          descriptor: 'apexremote',
          apexClass: c.action || '',
          apexMethod: c.method || '',
          remoteClass: typeof data[0] === 'string' ? data[0] : '',
          remoteMethod: typeof data[1] === 'string' ? data[1] : '',
          input: safeParse(data[2] !== undefined ? data[2] : data),
          options: safeParse(data[3]),
          rawRequest: c
        };
      });
    }

    return [];
  }

  function parseResponse(text) {
    if (!text) return null;
    var t = String(text).replace(/^\s*while\s*\(1\);?/, '');
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  /* Pull the result for one action out of a decoded response body. */
  function resultFor(kind, body, action, index) {
    if (!body) return { state: null, output: undefined, error: null };

    if (kind === 'aura' && Array.isArray(body.actions)) {
      var hit = null;
      for (var i = 0; i < body.actions.length; i++) {
        if (body.actions[i].id === action.wireId) { hit = body.actions[i]; break; }
      }
      if (!hit) hit = body.actions[index] || null;
      if (!hit) return { state: null, output: undefined, error: null };
      return {
        state: hit.state || null,
        output: unwrap(hit.returnValue),
        error: (hit.error && hit.error.length) ? hit.error : null
      };
    }

    if (kind === 'vfremote') {
      var arr = Array.isArray(body) ? body : [body];
      var found = arr[index] || arr[0];
      if (!found) return { state: null, output: undefined, error: null };
      return {
        state: found.statusCode === 200 ? 'SUCCESS' : 'ERROR',
        output: unwrap(found.result),
        error: found.message || null
      };
    }

    // LWR apex execute, and anything else that came back as plain JSON.
    return {
      state: body.returnValue !== undefined ? 'SUCCESS' : null,
      output: unwrap(body.returnValue !== undefined ? body.returnValue : body),
      error: body.error || null
    };
  }

  /* Apex hands back a Map whose payload usually sits under result/returnValue. */
  function unwrap(v) {
    var out = safeParse(v);
    // Aura wraps the Apex return in { returnValue, cacheable }, and OmniStudio
    // hands back a Map whose payload sits under `result`. Peel both, but only
    // while the wrapper carries nothing else worth keeping.
    for (var i = 0; i < 3; i++) {
      if (!out || typeof out !== 'object' || Array.isArray(out)) break;
      var keys = Object.keys(out);
      if (out.returnValue !== undefined && keys.length <= 2) { out = safeParse(out.returnValue); continue; }
      if (out.result !== undefined && keys.length <= 2) { out = safeParse(out.result); continue; }
      break;
    }
    return out;
  }

  function isOmni(action) {
    if (action.remoteClass || action.remoteMethod) return true;
    if (/invokeMethod/i.test(action.apexMethod)) return true;
    return /omniscript|omnistudio|vlocity|integrationprocedure/i.test(
      action.apexClass + ' ' + action.descriptor);
  }

  function label(action) {
    if (action.remoteClass || action.remoteMethod) {
      return (action.remoteClass || '?') + '.' + (action.remoteMethod || '?');
    }
    if (action.apexClass || action.apexMethod) {
      return (action.apexClass || '?') + '.' + (action.apexMethod || '?');
    }
    return action.descriptor || 'unknown action';
  }

  /* DataRaptors and Integration Procedures are dispatched through the same
   * remote-action plumbing as custom Apex, so on the wire they all look like
   * invokeMethod. The class and method identify the *integration*, not the
   * bundle the user configured — every DataRaptor Extract in a script reports
   * the same invokeInboundDR. The bundle name travels in the options (or
   * sometimes the input), so dig it out and label rows with that instead. */

  var NAME_KEYS = [
    'bundle', 'bundlename', 'dataraptorname', 'drname', 'drbundle',
    'integrationprocedurekey', 'ipkey', 'procedurekey', 'integrationprocedure'
  ];

  function findName(action) {
    var sources = [action.options, action.input];
    for (var s = 0; s < sources.length; s++) {
      var o = sources[s];
      if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
      var keys = Object.keys(o);
      for (var i = 0; i < keys.length; i++) {
        var v = o[keys[i]];
        if (NAME_KEYS.indexOf(keys[i].toLowerCase()) > -1 && typeof v === 'string' && v) return v;
      }
    }
    return '';
  }

  /* Class names differ between the Vlocity managed packages and standard
   * OmniStudio — vlocity_ins.IntegrationProcedureService versus
   * omnistudiocore.IPService, and likewise DataRaptor versus Data Mapper — so
   * match on several spellings, then fall back to the shape of the call. */
  var IP_PATTERN = /integrationprocedure|ipservice|invokeip|runintegrationprocedure/i;
  var DR_PATTERN = /dromniscript|inbounddr|outbounddr|dataraptor|datamapper|drservice|invokeinbound|invokeoutbound|turboextract/i;

  /* Type_SubType, the shape of an Integration Procedure key. */
  var IP_KEY = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;

  function kindOf(action) {
    var sig = action.remoteClass + '.' + action.remoteMethod + ' ' +
              action.apexClass + '.' + action.apexMethod;
    if (DR_PATTERN.test(sig)) return 'DR';
    if (IP_PATTERN.test(sig)) return 'IP';
    // Unrecognised service class calling a Type_SubType method: still an IP.
    if (/service$/i.test(action.remoteClass || '') && IP_KEY.test(action.remoteMethod || '')) return 'IP';
    if (action.remoteClass || action.remoteMethod) return 'RA';
    return 'APEX';
  }

  var KIND_LABEL = {
    DR: 'Data mapper / DataRaptor',
    IP: 'Integration Procedure',
    RA: 'Remote action',
    APEX: 'Apex call'
  };

  /* Options that change what a call actually does are worth seeing without
   * opening the Options tab. Text labels rather than glyphs: "chain" needs no
   * legend, and a chain emoji renders at a different size on every platform. */
  var OPTION_FLAGS = [
    ['chain',   ['chainable'],
      'Chainable — the response is fed into the next call in the chain'],
    ['q-chain', ['queueableChainable'],
      'Queueable chainable — the chain continues on a later queued request, so the result here may not be the end of it'],
    ['queue',   ['useQueueableApexRemoting', 'useQueueable'],
      'Runs as queueable Apex; the result arrives on a later request'],
    ['future',  ['useFuture'],
      'Runs in a future method, asynchronously'],
    ['cont',    ['useContinuation'],
      'Uses an Apex continuation for a long-running callout'],
    ['cache✕',  ['ignoreCache'],
      'Cache bypassed for this call']
  ];

  /* Option keys differ in casing between packages and versions, so match on a
   * lowercased index rather than an exact property name. */
  function optionIndex(o) {
    var index = {};
    Object.keys(o).forEach(function (k) { index[k.toLowerCase()] = o[k]; });
    return index;
  }

  function optionFlags(action) {
    var o = action.options;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return [];

    var index = optionIndex(o);
    var out = [];

    OPTION_FLAGS.forEach(function (f) {
      var on = f[1].some(function (name) { return index[name.toLowerCase()] === true; });
      if (on) out.push({ label: f[0], title: f[2] });
    });

    /* Transform bundles are Data Mappers running either side of the call —
     * worth naming, since a failure there looks like a failure of the call. */
    var pre = index['pretransformbundle'];
    var post = index['posttransformbundle'];
    if (typeof pre === 'string' && pre) {
      out.push({ label: 'pre', title: 'Pre-transform Data Mapper: ' + pre });
    }
    if (typeof post === 'string' && post) {
      out.push({ label: 'post', title: 'Post-transform Data Mapper: ' + post });
    }
    return out;
  }

  function displayName(action) {
    var kind = kindOf(action);
    var found = findName(action);
    if (kind === 'DR') return found || label(action);
    if (kind === 'IP') return found || action.remoteMethod || label(action);
    return label(action);
  }

  /* ---------------------------------------------------------- capture */

  function onRequestFinished(entry) {
    if (!state.recording) return;

    var req = entry.request || {};
    var kind = classify(req.url || '', req.method);
    if (!kind) return;

    var postText = (req.postData && req.postData.text) || '';
    var actions = parseRequest(kind, postText);
    if (!actions.length) return;

    entry.getContent(function (content) {
      var body = parseResponse(content);
      var started = new Date(entry.startedDateTime || Date.now());

      actions.forEach(function (action, i) {
        var res = resultFor(kind, body, action, i);
        var omni = isOmni(action);
        push({
          id: ++state.seq,
          kind: kind,
          url: req.url,
          time: started,
          duration: Math.round(entry.time || 0),
          httpStatus: (entry.response && entry.response.status) || 0,
          size: (entry.response && entry.response.bodySize) || 0,
          omni: omni,
          type: kindOf(action),
          flags: optionFlags(action),
          name: displayName(action),
          signature: label(action),
          action: action,
          state: res.state,
          output: res.output,
          error: res.error,
          rawResponse: body
        });
      });

      if (state.active) renderList();
      updateBadge();
    });
  }

  function push(record) {
    state.entries.push(record);
    if (state.entries.length > MAX_ENTRIES) state.entries.shift();
  }

  function visibleEntries() {
    var q = state.filter.trim().toLowerCase();
    return state.entries.filter(function (e) {
      if (state.onlyOmni && !e.omni) return false;
      if (!q) return true;
      return (e.name + ' ' + e.signature + ' ' + e.url).toLowerCase().indexOf(q) > -1;
    });
  }

  /* OmniStudio payloads often carry an `error` key that is not an error —
   * DataRaptor and Integration Procedure responses routinely come back with
   * error: "OK" or error: false. Flagging those red would mark almost every
   * successful call as broken, so only a meaningful value counts. */
  var BENIGN = ['ok', 'false', 'no', 'none', 'null', 'success', '0', ''];

  function isRealError(v, depth) {
    if (v === null || v === undefined || v === false) return false;
    if (typeof v === 'string') return BENIGN.indexOf(v.trim().toLowerCase()) === -1;
    if (typeof v === 'number') return v !== 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') {
      // { code: null, message: null } is an empty error slot, not an error.
      if ((depth || 0) > 3) return true;
      var keys = Object.keys(v);
      return keys.some(function (k) { return isRealError(v[k], (depth || 0) + 1); });
    }
    return !!v;
  }

  function brief(v) {
    var text = typeof v === 'string' ? v : JSON.stringify(v);
    if (!text) return '';
    return text.length > 120 ? text.slice(0, 120) + '…' : text;
  }

  /* Returns why this call counts as failed, or null when it does not. Naming
   * the rule that fired matters: a red row on a SUCCESS response is otherwise
   * impossible to account for without reading the source. */
  function failureReason(e, full) {
    function say(v) { return full ? (typeof v === 'string' ? v : JSON.stringify(v)) : brief(v); }
    if (isRealError(e.error)) return 'Action error — ' + say(e.error);
    if (e.state && e.state !== 'SUCCESS') return 'Aura state is ' + e.state;
    if (e.httpStatus && e.httpStatus >= 400) return 'HTTP ' + e.httpStatus;
    if (e.output && typeof e.output === 'object' && !Array.isArray(e.output)) {
      if (e.output.hasErrors === true) return 'Response sets hasErrors: true';
      if (isRealError(e.output.error)) return 'Response error — ' + say(e.output.error);
      if (isRealError(e.output.errors)) return 'Response errors — ' + say(e.output.errors);
    }
    return null;
  }

  function failed(e) { return failureReason(e) !== null; }

  /* --------------------------------------------------------- rendering */

  function header() {
    var row = document.createElement('div');
    row.className = 'log-row log-head';
    var cols = [
      ['log-time', 'Started', 'Clock time the request left the browser'],
      ['tag', '', 'Call type'],
      ['log-name', 'Action', 'Data Mapper bundle, Integration Procedure key, or Apex class and method'],
      ['pill is-code', 'HTTP', 'HTTP status of the request'],
      ['pill', 'Result', 'Whether the response carried an error'],
      ['log-ms', 'Took', 'Round trip in milliseconds: request sent to response fully received']
    ];
    cols.forEach(function (c) {
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
    var atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
    list.textContent = '';

    var rows = visibleEntries();
    if (!rows.length) {
      list.appendChild(hint(state.entries.length
        ? 'Nothing matches the current filter.'
        : 'No remote actions captured yet. Interact with the OmniScript — calls appear here as they happen.'));
      renderDetail();
      return;
    }

    list.appendChild(header());

    rows.forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'log-row';
      if (e.id === state.selectedId) row.classList.add('is-selected');
      if (failed(e)) row.classList.add('is-failed');

      var why = failureReason(e);

      var started = cell('log-time', e.time.toLocaleTimeString());
      started.title = 'Request started at ' + e.time.toLocaleTimeString();
      row.appendChild(started);

      var tag = cell('tag tag-' + e.type.toLowerCase(), e.type === 'APEX' ? 'Apex' : e.type);
      tag.title = KIND_LABEL[e.type];
      row.appendChild(tag);

      var name = cell('log-name', e.name);
      name.title = KIND_LABEL[e.type] + ' — ' + e.signature +
        (why ? '\n\nMarked as failed: ' + why : '');
      row.appendChild(name);

      var flags = e.flags || [];
      flags.slice(0, 3).forEach(function (f) {
        var pill = cell('tag tag-opt', f.label);
        pill.title = f.title;
        row.appendChild(pill);
      });
      if (flags.length > 3) {
        var more = cell('tag tag-opt', '+' + (flags.length - 3));
        more.title = flags.slice(3).map(function (f) { return f.title; }).join('\n');
        row.appendChild(more);
      }

      /* Two separate facts, so they can never contradict each other: the HTTP
       * code describes the transport, the verdict describes the payload. The
       * verdict comes from the same check that colours the row, which is why
       * Aura's own "SUCCESS" is not shown here — it reports neither. */
      var code = cell('pill is-code', e.httpStatus ? String(e.httpStatus) : '—');
      if (e.httpStatus >= 400) code.classList.add('is-bad');
      code.title = 'HTTP ' + (e.httpStatus || 'unknown') +
        (e.state ? '\nAura state: ' + e.state : '');
      row.appendChild(code);

      var verdict = cell('pill', why ? 'ERROR' : 'SUCCESS');
      verdict.classList.add(why ? 'is-bad' : 'is-good');
      verdict.title = why || 'No error found in the response';
      row.appendChild(verdict);

      var took = cell('log-ms', e.duration ? e.duration + ' ms' : '');
      took.title = e.duration
        ? 'Round trip: ' + e.duration + ' ms from request sent to response received'
        : 'Duration unavailable';
      row.appendChild(took);

      row.addEventListener('click', function () {
        state.selectedId = e.id;
        state.expanded = { input: new Set(['']), output: new Set(['']), options: new Set(['']), raw: new Set(['']) };
        state.expandedText = { input: new Set(), output: new Set(), options: new Set(), raw: new Set() };
        renderList();
        renderDetail();
      });

      list.appendChild(row);
    });

    if (atBottom) list.scrollTop = list.scrollHeight;
    renderDetail();
    renderStatus();
  }

  function selected() {
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].id === state.selectedId) return state.entries[i];
    }
    return null;
  }

  function renderDetail() {
    var pane = el.detail;
    pane.textContent = '';

    var e = selected();
    if (!e) {
      pane.appendChild(hint('Select a call to see its input and output.'));
      return;
    }

    var head = document.createElement('div');
    head.className = 'detail-head';

    var title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = e.name;
    head.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'detail-meta';
    var bits = [KIND_LABEL[e.type]];
    if (e.signature !== e.name) bits.push(e.signature);
    meta.textContent = bits.concat([
      e.time.toLocaleTimeString(),
      e.duration + ' ms',
      'HTTP ' + (e.httpStatus || '?'),
      e.state || 'state unknown'
    ]).join(' · ');
    head.appendChild(meta);

    var why = failureReason(e);
    if (why) {
      var err = document.createElement('div');
      err.className = 'detail-error';
      err.textContent = failureReason(e, true);

      err.addEventListener('click', function () {
        /* A message that fits is not interactive: no pointer, no tooltip. */
        if (!err.classList.contains('is-clamped') &&
            !err.classList.contains('is-open')) return;

        var opening = !err.classList.contains('is-open');
        err.classList.toggle('is-open', opening);
        err.classList.toggle('is-clamped', !opening);
        err.title = opening ? 'Click to collapse' : 'Click to expand';
      });

      head.appendChild(err);

      /* Measurable only once it is in the document. */
      setTimeout(function () {
        if (!clamped(err)) return;
        err.classList.add('is-clamped');
        err.title = 'Click to expand';
      }, 0);
    }

    var available = tabsFor(e);
    var usable = available.filter(function (p) { return p[2]; });
    if (!usable.some(function (p) { return p[0] === state.detailTab; })) state.detailTab = 'input';

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
        b.title = 'This call carried no ' + pair[1].toLowerCase();
      } else {
        b.addEventListener('click', function () {
          state.detailTab = pair[0];
          renderDetail();
        });
      }
      tabs.appendChild(b);
    });
    tools.appendChild(tabs);

    var value = bodyFor(e);
    var treeable = JsonTree.isContainer(value);

    var expand = document.createElement('button');
    expand.className = 'icon-btn tiny';
    expand.textContent = 'Expand all';
    expand.disabled = !treeable;
    expand.addEventListener('click', function () {
      var set = new Set();
      JsonTree.addAllPaths(value, '', set, 0);
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
      copyText(JSON.stringify(bodyFor(e), null, 2), copy, 'Copy');
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

    var body = document.createElement('div');
    body.className = 'detail-body';
    pane.appendChild(body);

    if (value === undefined) {
      body.appendChild(hint('Nothing captured for this section.'));
      return;
    }
    if (!treeable) {
      body.appendChild(hint(String(value)));
      return;
    }

    var result = JsonTree.render(body, state.detailTab, value, {
      expanded: state.expanded[state.detailTab],
      expandedText: state.expandedText[state.detailTab],
      filter: state.detailFilter,
      onToggle: renderDetail
    });

    if (!result.matched) {
      body.appendChild(hint('Nothing here matches "' + state.detailFilter + '".'));
    }
  }

  function bodyFor(e) {
    if (state.detailTab === 'input') return e.action.input;
    if (state.detailTab === 'output') return e.output;
    if (state.detailTab === 'options') return e.action.options;
    return { request: e.action.rawRequest, response: e.rawResponse, url: e.url };
  }

  /* Options are worth their own tab — for a DataRaptor or Integration Procedure
   * that is where the bundle name and the chaining flags live — but only when
   * the call actually carried some. */
  function hasOptions(e) {
    var o = e.action.options;
    if (o === undefined || o === null || o === '') return false;
    if (typeof o === 'object') return Object.keys(o).length > 0;
    return true;
  }

  /* Every tab is always rendered, so the strip does not reflow as the user
   * clicks down the list. A tab with nothing behind it is disabled instead of
   * hidden — "this call carried no options" is worth stating outright. */
  function tabsFor(e) {
    return [
      ['input', 'Input', true],
      ['output', 'Output', true],
      ['options', 'Options', hasOptions(e)],
      ['raw', 'Raw', true]
    ];
  }

  function clamped(node) {
    return node.scrollHeight > node.clientHeight + 2;
  }

  function cell(cls, text) {
    var d = document.createElement('span');
    d.className = cls;
    d.textContent = text;
    return d;
  }

  function hint(text) {
    var d = document.createElement('div');
    d.className = 'notice';
    d.textContent = text;
    return d;
  }

  function updateBadge() {
    var n = visibleEntries().length;
    el.badge.textContent = String(n);
    el.badge.hidden = n === 0;
  }

  function renderStatus() {
    if (!state.active) return;
    var shown = visibleEntries().length;
    document.getElementById('status-left').textContent =
      shown + (shown === 1 ? ' call' : ' calls') +
      (state.entries.length !== shown ? ' of ' + state.entries.length + ' captured' : '');
    document.getElementById('status-right').textContent =
      (state.recording ? 'Recording' : 'Paused') +
      (state.preserve ? ' · preserving log' : '');
  }

  function copyText(text, button, restore) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = restore; }, 1200);
    }, function () { /* clipboard unavailable in this context */ });
  }

  /* ----------------------------------------------------------- wiring */

  function mount() {
    el.list = document.getElementById('log-list');
    el.detail = document.getElementById('log-detail');
    el.badge = document.getElementById('actions-count');

    document.getElementById('log-record').addEventListener('click', function (ev) {
      state.recording = !state.recording;
      ev.currentTarget.textContent = state.recording ? 'Recording' : 'Record';
      ev.currentTarget.classList.toggle('is-on', state.recording);
      renderStatus();
    });

    document.getElementById('log-clear').addEventListener('click', function () {
      state.entries = [];
      state.selectedId = null;
      renderList();
      updateBadge();
    });

    document.getElementById('log-only-omni').addEventListener('change', function (ev) {
      state.onlyOmni = ev.currentTarget.checked;
      renderList();
      updateBadge();
    });

    document.getElementById('log-preserve').addEventListener('change', function (ev) {
      state.preserve = ev.currentTarget.checked;
      renderStatus();
    });

    var t = null;
    document.getElementById('log-filter').addEventListener('input', function (ev) {
      var v = ev.currentTarget.value;
      clearTimeout(t);
      t = setTimeout(function () {
        state.filter = v;
        renderList();
        updateBadge();
      }, 120);
    });

    document.getElementById('log-export').addEventListener('click', function () {
      var payload = visibleEntries().map(function (e) {
        return {
          time: e.time.toISOString(),
          action: e.name,
          type: KIND_LABEL[e.type],
          signature: e.signature,
          options_flags: (e.flags || []).map(function (f) { return f.label; }),
          durationMs: e.duration,
          httpStatus: e.httpStatus,
          state: e.state,
          input: e.action.input,
          options: hasOptions(e) ? e.action.options : undefined,
          output: e.output,
          error: e.error
        };
      });
      var url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'remote-actions-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });

    chrome.devtools.network.onRequestFinished.addListener(onRequestFinished);

    chrome.devtools.network.onNavigated.addListener(function () {
      if (state.preserve) return;
      state.entries = [];
      state.selectedId = null;
      if (state.active) renderList();
      updateBadge();
    });

    renderList();
  }

  global.RemoteActions = {
    mount: mount,
    show: function () { state.active = true; renderList(); renderStatus(); },
    hide: function () { state.active = false; }
  };

})(window);