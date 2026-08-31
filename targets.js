'use strict';

/* Frames and OmniScript hosts, discovered once and shared by every tab.
 *
 * Both tabs used to keep their own frame index and their own element list,
 * which is why they kept disagreeing about what was on the page. This module
 * owns both: it enumerates every frame, lists the hosts in each, and publishes
 * one selection that the Data and Structure tabs both read.
 */
(function (global) {

  /* ---------------------------------------------------------- page side */

  /* Lists elements exposing either property, in one pass per frame. The index
   * of a host in this list is the handle the fetchers use, so both functions
   * must enumerate in exactly the same order. */
  function hostScan(DATA_PROP, DEF_PROP) {
    try {
      /* Every child element component inherits the same properties, so one
       * forty-element OmniScript is forty hosts. A low cap silently truncated
       * the list before reaching a second console tab's script. hostFetch must
       * use the identical limit, or the indices the two return stop matching. */
      var MAX_HOSTS = 400;
      var hosts = [];

      function read(node, prop) {
        var v;
        try { v = node[prop]; } catch (e) { return null; }
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          try { return JSON.stringify(v); } catch (e) { return null; }
        }
        return null;
      }

      function label(node) {
        var s = node.tagName.toLowerCase();
        if (node.id) s += '#' + node.id;
        else if (node.className && typeof node.className === 'string') {
          var first = node.className.trim().split(/\s+/)[0];
          if (first) s += '.' + first;
        }
        return s;
      }

      function walk(root) {
        var nodes;
        try { nodes = root.querySelectorAll('*'); } catch (e) { return; }
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (hosts.length < MAX_HOSTS) {
            var data = read(node, DATA_PROP);
            var def = DEF_PROP ? read(node, DEF_PROP) : null;
            if (data || def) {
              hosts.push({
                node: node,
                label: label(node),
                dataLen: data ? data.length : 0,
                defLen: def ? def.length : 0
              });
            }
          }
          if (node.shadowRoot) walk(node.shadowRoot);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument) walk(node.contentDocument); } catch (e) {}
          }
        }
      }

      walk(document);

      /* Child element components inherit the same @api properties, so a script
       * with forty elements yields forty hosts. The one that matters is the one
       * with no ancestor exposing the property — checked by walking up through
       * shadow roots and iframe boundaries, since tag names vary by package. */
      var nodes = hosts.map(function (h) { return h.node; });

      function parentOf(n) {
        if (!n) return null;
        if (n.host) return n.host;                       // shadow root
        if (n.parentNode) return n.parentNode;
        if (n.nodeType === 9) {                          // document in an iframe
          try { return n.defaultView && n.defaultView.frameElement; } catch (e) { return null; }
        }
        return null;
      }

      hosts.forEach(function (h) {
        var p = parentOf(h.node);
        var guard = 0;
        h.top = true;
        while (p && guard++ < 200) {
          if (nodes.indexOf(p) !== -1) { h.top = false; break; }
          p = parentOf(p);
        }
      });

      var hints = [];
      if (!hosts.length) {
        (function scan(root) {
          var nodes;
          try { nodes = root.querySelectorAll('*'); } catch (e) { return; }
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (hints.length < 3 && node.tagName.toLowerCase().indexOf('omniscript') > -1) {
              var names = {};
              var proto = Object.getPrototypeOf(node);
              var guard = 0;
              while (proto && guard++ < 6) {
                var pn = Object.getOwnPropertyNames(proto);
                for (var j = 0; j < pn.length; j++) if (/json|data|def/i.test(pn[j])) names[pn[j]] = 1;
                proto = Object.getPrototypeOf(proto);
              }
              hints.push({ tag: label(node), props: Object.keys(names).slice(0, 24) });
            }
            if (node.shadowRoot) scan(node.shadowRoot);
            if (node.tagName === 'IFRAME') {
              try { if (node.contentDocument) scan(node.contentDocument); } catch (e) {}
            }
          }
        })(document);
      }

      window.__omniHosts = hosts.map(function (h) { return h.node; });

      return {
        ok: true,
        hints: hints,
        truncated: hosts.length >= MAX_HOSTS,
        hosts: hosts.map(function (h) {
          return { label: h.label, dataLen: h.dataLen, defLen: h.defLen, top: !!h.top };
        })
      };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), hosts: [], hints: [] };
    }
  }

  /* Reads one property off one host. `count` lets the panel notice that hosts
   * appeared or vanished without running a full enumeration every poll. */
  function hostFetch(DATA_PROP, DEF_PROP, IDX, WANTED) {
    try {
      var MAX_HOSTS = 400;   // must match hostScan
      var hosts = [];

      function read(node, prop) {
        var v;
        try { v = node[prop]; } catch (e) { return null; }
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          try { return JSON.stringify(v); } catch (e) { return null; }
        }
        return null;
      }

      function walk(root) {
        var nodes;
        try { nodes = root.querySelectorAll('*'); } catch (e) { return; }
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (hosts.length < MAX_HOSTS) {
            if (read(node, DATA_PROP) || (DEF_PROP && read(node, DEF_PROP))) hosts.push(node);
          }
          if (node.shadowRoot) walk(node.shadowRoot);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument) walk(node.contentDocument); } catch (e) {}
          }
        }
      }

      walk(document);
      window.__omniHosts = hosts;

      var node = hosts[IDX];
      if (!node) return { ok: true, count: hosts.length, missing: true, value: null };
      return { ok: true, count: hosts.length, missing: false, value: read(node, WANTED) };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  function frameScan() {
    try {
      var out = [];
      var frames = document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        var u = frames[i].src || '';
        if (u && u.indexOf('about:') !== 0 && out.indexOf(u) === -1) out.push(u);
      }
      return { ok: true, frames: out };
    } catch (e) {
      return { ok: false, frames: [] };
    }
  }

  /* ------------------------------------------------------------- state */

  var state = {
    dataProp: 'jsonDataStr',
    defProp: 'jsonDef',
    frames: [''],
    frameFilter: '',      // '' means every frame
    showNested: false,
    truncated: false,
    hosts: [],
    selected: 0,
    hints: [],
    visible: true,
    dirty: { target: false, frame: false }
  };

  var listeners = [];
  var el = {};
  var timer = null;

  function notify(reason) {
    listeners.forEach(function (fn) {
      try { fn(reason); } catch (e) {}
    });
  }

  /* ---------------------------------------------------------- discovery */

  function evalOn(frame, expr, cb) {
    if (frame) chrome.devtools.inspectedWindow.eval(expr, { frameURL: frame }, cb);
    else chrome.devtools.inspectedWindow.eval(expr, cb);
  }

  function discoverFrames(done) {
    var urls = [];

    function add(u) {
      if (!u || u.indexOf('about:') === 0) return;
      if (urls.indexOf(u) === -1 && urls.length < 12) urls.push(u);
    }

    chrome.devtools.inspectedWindow.getResources(function (resources) {
      (resources || []).forEach(function (r) {
        if (r && r.type === 'document') add(r.url);
      });
      chrome.devtools.inspectedWindow.eval('(' + frameScan.toString() + ')()', function (result) {
        ((result && result.frames) || []).forEach(add);
        state.frames = [''].concat(urls);
        if (state.frameFilter && state.frames.indexOf(state.frameFilter) === -1) {
          state.frameFilter = '';
        }
        renderFrames();
        done();
      });
    });
  }

  /* Enumerates hosts in every frame and merges them into one list. */
  function scanHosts(done) {
    var frames = state.frames;
    var expr = '(' + hostScan.toString() + ')(' +
      JSON.stringify(state.dataProp) + ',' + JSON.stringify(state.defProp) + ')';
    var collected = [];
    var hints = [];
    var truncated = false;
    var i = 0;

    function step() {
      if (i >= frames.length) { finish(); return; }
      var frame = frames[i];
      evalOn(frame, expr, function (result) {
        if (result && result.ok) {
          (result.hosts || []).forEach(function (h, local) {
            collected.push({
              index: collected.length,
              label: h.label,
              frame: frame,
              local: local,
              dataLen: h.dataLen,
              defLen: h.defLen,
              top: h.top
            });
          });
          if (result.truncated) truncated = true;
          if (!hints.length && result.hints && result.hints.length) hints = result.hints;
        }
        i++;
        step();
      });
    }

    function finish() {
      var before = signature(state.hosts);
      var previous = state.hosts[state.selected];

      state.hosts = collected;
      state.hints = hints;
      state.truncated = truncated;

      // Keep the same host selected across a refresh where possible.
      if (previous) {
        var again = -1;
        collected.forEach(function (h, k) {
          if (again === -1 && h.label === previous.label && h.frame === previous.frame) again = k;
        });
        state.selected = again === -1 ? 0 : again;
      }
      if (state.selected >= collected.length) state.selected = 0;

      var current = collected[state.selected];
      if (!current || (!current.top && !state.showNested)) {
        var firstTop = -1;
        collected.forEach(function (h, k) { if (firstTop === -1 && h.top) firstTop = k; });
        if (firstTop !== -1) state.selected = firstTop;
      }

      renderTargets();
      if (signature(collected) !== before) notify('hosts');
      done();
    }

    step();
  }

  function signature(hosts) {
    return hosts.map(function (h) { return h.label + '@' + h.frame; }).join('|');
  }

  function refresh(done) {
    discoverFrames(function () { scanHosts(function () { (done || function () {})(); }); });
  }

  function schedule() {
    clearTimeout(timer);
    if (!state.visible) return;
    timer = setTimeout(function () { refresh(schedule); }, 5000);
  }

  /* ---------------------------------------------------------- rendering */

  function visibleHosts() {
    return state.hosts.filter(function (h) {
      if (state.frameFilter && h.frame !== state.frameFilter) return false;
      if (!state.showNested && !h.top) return false;
      return true;
    });
  }

  function nestedCount() {
    return state.hosts.filter(function (h) { return !h.top; }).length;
  }

  function shortFrame(url) {
    try {
      var u = new URL(url);
      var tail = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
      return tail.length > 22 ? tail.slice(0, 22) + '…' : tail;
    } catch (e) {
      return url.slice(0, 24);
    }
  }

  function renderTargets() {
    if (!el.target) return;
    if (document.activeElement === el.target) { state.dirty.target = true; return; }

    var hosts = visibleHosts();
    var sig = signature(hosts) + '#' + state.selected;
    if (sig === el.target.dataset.sig) return;
    el.target.dataset.sig = sig;
    el.target.textContent = '';

    if (!hosts.length) {
      var none = document.createElement('option');
      none.textContent = 'no OmniScript found';
      el.target.appendChild(none);
      el.target.disabled = true;
      return;
    }

    el.target.disabled = hosts.length < 2;
    var multiFrame = state.frames.length > 1;
    hosts.forEach(function (h) {
      var o = document.createElement('option');
      o.value = String(h.index);
      o.textContent = h.label +
        (multiFrame && h.frame ? '  ·  ' + shortFrame(h.frame) : '') +
        (h.top ? '' : '  · nested') +
        (h.defLen ? '' : '  · data only');
      o.title = (h.frame || 'top frame') +
        '\n' + (h.top ? 'Top-level OmniScript' : 'Nested inside another host') +
        '\ndata ' + bytes(h.dataLen) + ' · definition ' + (h.defLen ? bytes(h.defLen) : 'none');
      el.target.appendChild(o);
    });
    el.target.value = String(state.selected);
  }

  function renderFrames() {
    if (!el.frame) return;
    if (document.activeElement === el.frame) { state.dirty.frame = true; return; }

    var sig = state.frames.join('|');
    if (sig !== el.frame.dataset.sig) {
      el.frame.dataset.sig = sig;
      el.frame.textContent = '';
      state.frames.forEach(function (url) {
        var o = document.createElement('option');
        o.value = url;
        o.textContent = url ? shortFrame(url) : 'All frames';
        o.title = url || 'Every document on the page';
        el.frame.appendChild(o);
      });
      el.frame.disabled = state.frames.length < 2;
    }
    el.frame.value = state.frameFilter;
  }

  function bytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ------------------------------------------------------------- public */

  function selected() {
    return state.hosts[state.selected] || null;
  }

  function fetch(which, cb) {
    var host = selected();
    if (!host) { cb(null, null); return; }

    var expr = '(' + hostFetch.toString() + ')(' +
      JSON.stringify(state.dataProp) + ',' +
      JSON.stringify(state.defProp) + ',' +
      JSON.stringify(host.local) + ',' +
      JSON.stringify(which) + ')';

    evalOn(host.frame, expr, function (result, exception) {
      if (exception || !result || !result.ok) { cb(null, exception || result); return; }
      /* Host count moved under us: re-enumerate rather than keep reading an
       * index that now points at something else. */
      if (result.missing) { refresh(function () { cb(null, null); }); return; }
      cb(result.value, null);
    });
  }

  function mount(nodes) {
    el.target = nodes.target;
    el.frame = nodes.frame;
    el.nested = nodes.nested;

    if (el.nested) {
      el.nested.addEventListener('change', function () {
        state.showNested = el.nested.checked;
        el.target.dataset.sig = '';
        renderTargets();
        notify('selection');
      });
    }

    el.target.addEventListener('change', function () {
      state.selected = Number(el.target.value) || 0;
      notify('selection');
    });

    el.target.addEventListener('blur', function () {
      if (!state.dirty.target) return;
      state.dirty.target = false;
      renderTargets();
    });

    el.frame.addEventListener('change', function () {
      state.frameFilter = el.frame.value;
      var hosts = visibleHosts();
      if (hosts.length && !hosts.some(function (h) { return h.index === state.selected; })) {
        state.selected = hosts[0].index;
      }
      renderTargets();
      notify('selection');
    });

    el.frame.addEventListener('blur', function () {
      if (!state.dirty.frame) return;
      state.dirty.frame = false;
      renderFrames();
    });

    chrome.devtools.network.onNavigated.addListener(function () {
      state.frames = [''];
      state.frameFilter = '';
      state.hosts = [];
      state.selected = 0;
      refresh(function () { notify('navigated'); });
    });
  }

  global.Targets = {
    mount: mount,
    refresh: refresh,
    fetch: fetch,
    evalOn: evalOn,
    selected: selected,
    hosts: function () { return state.hosts; },
    visibleHosts: visibleHosts,
    nestedCount: nestedCount,
    truncated: function () { return state.truncated; },
    frames: function () { return state.frames; },
    hints: function () { return state.hints; },
    frameLabel: shortFrame,
    subscribe: function (fn) { listeners.push(fn); },
    setVisible: function (v) {
      state.visible = v;
      if (v) { refresh(schedule); } else clearTimeout(timer);
    },
    setProps: function (dataProp, defProp) {
      if (dataProp) state.dataProp = dataProp;
      if (defProp) state.defProp = defProp;
      refresh(function () { notify('props'); });
    },
    start: function (done) { refresh(function () { schedule(); (done || function () {})(); }); }
  };

})(window);
