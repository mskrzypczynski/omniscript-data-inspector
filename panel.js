'use strict';

/* Data tab, plus the panel shell. Frames and OmniScript hosts are owned by
 * targets.js and shared with the Structure tab — this file only asks for the
 * selected host's payload and draws it. */

var SEP = JsonTree.SEP;

/* How long a change stays marked. Without this the amber and the dot on
 * collapsed branches lasted exactly one render — at a 500 ms poll they were
 * gone before you could look at them. */
var HIGHLIGHT_MS = 3000;

var state = {
  active: true,
  tab: 'data',
  visible: true,
  prop: 'jsonDataStr',
  intervalMs: 500,
  paused: false,
  view: 'tree',
  filter: '',
  raw: null,
  data: undefined,
  parseError: null,
  scanError: null,
  expanded: new Set(['']),
  expandedText: new Set(),
  changed: new Set(),
  changedBranch: new Set(),
  lastUpdate: null,
  changedAt: 0,
  seeded: false
};

var el = {
  pause: document.getElementById('pause'),
  refresh: document.getElementById('refresh'),
  prop: document.getElementById('prop'),
  interval: document.getElementById('interval'),
  viewTree: document.getElementById('view-tree'),
  viewRaw: document.getElementById('view-raw'),
  filter: document.getElementById('filter'),
  expand: document.getElementById('expand'),
  collapse: document.getElementById('collapse'),
  copy: document.getElementById('copy'),
  download: document.getElementById('download'),
  select: document.getElementById('select'),
  viewport: document.getElementById('viewport'),
  statusLeft: document.getElementById('status-left'),
  statusRight: document.getElementById('status-right')
};

/* ------------------------------------------------------------------ *
 * Polling
 * ------------------------------------------------------------------ */

var timer = null;

function schedule() {
  clearTimeout(timer);
  if (state.paused || !state.intervalMs || !state.active || !state.visible) return;
  timer = setTimeout(read, state.intervalMs);
}

function read() {
  if (!Targets.selected()) {
    apply(null);
    render();
    schedule();
    return;
  }

  Targets.fetch(state.prop, function (value, error) {
    if (error) {
      state.scanError = error.value || error.description || error.error ||
        'The page could not be read.';
      render();
      schedule();
      return;
    }
    state.scanError = null;
    apply(value);
    render();
    schedule();
  });
}

function apply(raw) {
  if (raw === null || raw === undefined) {
    state.raw = null;
    state.data = undefined;
    state.parseError = null;
    state.changed.clear();
    state.changedBranch.clear();
    state.changedAt = 0;
    return;
  }
  if (raw === state.raw) {
    if (state.changedAt && Date.now() - state.changedAt > HIGHLIGHT_MS) {
      state.changed.clear();
      state.changedBranch.clear();
      state.changedAt = 0;
    }
    return;
  }

  var previous = state.data;
  state.raw = raw;

  try {
    state.data = JSON.parse(raw);
    state.parseError = null;
  } catch (e) {
    state.data = undefined;
    state.parseError = e.message;
  }

  state.changed = new Set();
  state.changedBranch = new Set();
  if (state.parseError === null && previous !== undefined) {
    diff(previous, state.data, '', state.changed);
    state.changed.forEach(function (path) {
      var parts = path.split(SEP);
      for (var i = parts.length - 1; i > 0; i--) {
        state.changedBranch.add(parts.slice(0, i).join(SEP));
      }
      state.changedBranch.add('');
    });
  }

  if (!state.seeded && state.data !== undefined) {
    seedExpansion(state.data);
    state.seeded = true;
  }

  state.lastUpdate = new Date();
  state.changedAt = state.changed.size ? Date.now() : 0;
}

function seedExpansion(value) {
  state.expanded.add('');
  if (!JsonTree.isContainer(value)) return;
  Object.keys(value).slice(0, 200).forEach(function (k) { state.expanded.add(k); });
}

function diff(a, b, path, out) {
  if (out.size > 800) return;
  var ca = JsonTree.isContainer(a), cb = JsonTree.isContainer(b);
  if (!ca && !cb) { if (a !== b) out.add(path); return; }
  if (ca !== cb || Array.isArray(a) !== Array.isArray(b)) { out.add(path); return; }

  var keys = {};
  Object.keys(a).forEach(function (k) { keys[k] = 1; });
  Object.keys(b).forEach(function (k) { keys[k] = 1; });

  Object.keys(keys).forEach(function (k) {
    var p = path ? path + SEP + k : k;
    if (!(k in a) || !(k in b)) { out.add(p); return; }
    diff(a[k], b[k], p, out);
  });
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function render() {
  renderStatus();

  var v = el.viewport;
  v.textContent = '';

  if (state.scanError) {
    v.appendChild(notice('Could not read the page', state.scanError, true));
    return;
  }

  if (!Targets.selected()) {
    v.appendChild(emptyNotice());
    return;
  }

  if (state.raw === null) {
    v.appendChild(notice('Nothing on ' + state.prop,
      'This OmniScript exposes no value on that property right now.', false));
    return;
  }

  if (state.parseError) {
    v.appendChild(notice('The property is not valid JSON',
      state.parseError + ' — the raw value is shown below.', true));
    v.appendChild(rawBlock(state.raw));
    return;
  }

  if (state.data === undefined) return;

  if (state.view === 'raw') {
    v.appendChild(rawBlock(pretty()));
    return;
  }

  var result = JsonTree.render(v, state.prop, state.data, {
    expanded: state.expanded,
    expandedText: state.expandedText,
    changed: state.changed,
    changedBranch: state.changedBranch,
    filter: state.filter,
    onToggle: render
  });

  if (!result.matched) {
    v.appendChild(notice('No matches',
      'Nothing in this payload matches "' + state.filter + '".', false));
    return;
  }

  if (result.truncated) {
    v.appendChild(notice('Output trimmed',
      'Showing the first ' + result.rows + ' rows. Filter the payload or switch to Raw to see the rest.',
      false));
  }
}

function rawBlock(text) {
  var pre = document.createElement('pre');
  pre.className = 'raw';
  pre.textContent = text;
  return pre;
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

function emptyNotice() {
  var box = notice('No OmniScript found',
    'Open one, then press Rescan. Every frame, document and open shadow root is searched for elements exposing ' +
    state.prop + '.', false);

  var list = document.createElement('ul');
  var tips = ['Closed shadow roots cannot be read.'];

  var frames = Targets.frames();
  if (frames.length > 1) {
    tips.push('Frames searched: ' + frames.map(function (f) {
      return f ? Targets.frameLabel(f) : 'top frame';
    }).join(', ') + '.');
  } else {
    tips.push('No iframes were found on this page.');
  }

  Targets.hints().forEach(function (h) {
    if (h.props && h.props.length) tips.unshift(h.tag + ' exposes: ' + h.props.join(', '));
  });

  tips.forEach(function (t) {
    var li = document.createElement('li');
    li.textContent = t;
    list.appendChild(li);
  });

  box.appendChild(list);
  return box;
}

function renderStatus() {
  if (!state.active) return;

  var left = document.createElement('span');
  var host = Targets.selected();
  var all = Targets.hosts();

  if (host) {
    var shown = Targets.visibleHosts().length;
    var nested = Targets.nestedCount();
    left.appendChild(strong(String(shown)));
    left.appendChild(document.createTextNode(shown === 1 ? ' OmniScript · ' : ' OmniScripts · '));
    left.appendChild(strong(host.label));
    left.appendChild(document.createTextNode(' · ' + bytes(state.raw ? state.raw.length : 0)));
    if (nested) left.appendChild(document.createTextNode(' · ' + nested + ' nested hidden'));
    if (Targets.truncated()) {
      left.appendChild(document.createTextNode(' · list truncated'));
    }
  } else {
    left.textContent = state.scanError ? 'Read failed' : 'Nothing found on this page';
  }

  el.statusLeft.textContent = '';
  el.statusLeft.appendChild(left);

  var right = !state.visible ? 'Idle (panel hidden)'
    : state.paused ? 'Paused'
    : (state.intervalMs ? 'Live' : 'Manual');
  if (state.lastUpdate) right += ' · changed ' + state.lastUpdate.toLocaleTimeString();
  if (state.changed.size) right += ' · ' + state.changed.size + ' value(s) updated';
  el.statusRight.textContent = right;
}

function strong(text) {
  var b = document.createElement('b');
  b.textContent = text;
  return b;
}

function bytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function pretty() {
  try { return JSON.stringify(state.data, null, 2); } catch (e) { return state.raw || ''; }
}

function resetPayload() {
  state.raw = null;
  state.data = undefined;
  state.parseError = null;
  state.seeded = false;
  state.expanded = new Set(['']);
  state.expandedText = new Set();
  state.changed = new Set();
  state.changedBranch = new Set();
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

el.pause.addEventListener('click', function () {
  state.paused = !state.paused;
  el.pause.textContent = state.paused ? 'Resume' : 'Pause';
  el.pause.classList.toggle('is-on', state.paused);
  if (!state.paused) read(); else clearTimeout(timer);
  renderStatus();
});

el.refresh.addEventListener('click', function () { read(); });

el.prop.addEventListener('change', function () {
  state.prop = el.prop.value.trim() || 'jsonDataStr';
  el.prop.value = state.prop;
  resetPayload();
  Targets.setProps(state.prop, null);
});

el.interval.addEventListener('change', function () {
  state.intervalMs = Number(el.interval.value);
  schedule();
  renderStatus();
});

el.viewTree.addEventListener('click', function () { setView('tree'); });
el.viewRaw.addEventListener('click', function () { setView('raw'); });

function setView(v) {
  state.view = v;
  el.viewTree.classList.toggle('is-on', v === 'tree');
  el.viewRaw.classList.toggle('is-on', v === 'raw');
  render();
}

var filterTimer = null;
el.filter.addEventListener('input', function () {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(function () {
    state.filter = el.filter.value;
    render();
  }, 120);
});

el.expand.addEventListener('click', function () {
  state.expanded = new Set();
  JsonTree.addAllPaths(state.data, '', state.expanded, 0);
  render();
});

el.collapse.addEventListener('click', function () {
  state.expanded = new Set(['']);
  render();
});

el.copy.addEventListener('click', function () {
  copyText(state.parseError ? (state.raw || '') : pretty(), el.copy, 'Copy JSON');
});

el.download.addEventListener('click', function () {
  var text = state.parseError ? (state.raw || '') : pretty();
  if (!text) return;
  var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  var a = document.createElement('a');
  a.href = url;
  a.download = 'omniscript-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
});

el.select.addEventListener('click', function () {
  var host = Targets.selected();
  if (!host) return;
  var expr = '(function(i){ try { window.$omni = window.__omniHosts[i];' +
    ' if (typeof inspect === "function") inspect(window.$omni); return true; }' +
    ' catch(e){ return String(e); } })(' + JSON.stringify(host.local) + ')';
  Targets.evalOn(host.frame, expr, function () {
    flash(el.select, 'Exposed as $omni', 'Reveal element');
  });
});

function copyText(text, button, restore) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(function () {
    flash(button, 'Copied', restore);
  }, function () {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    flash(button, 'Copied', restore);
  });
}

function flash(button, message, restore) {
  button.textContent = message;
  setTimeout(function () { button.textContent = restore; }, 1200);
}

/* ------------------------------------------------------------------ *
 * Help
 *
 * Deliberately not a fourth tab: this is documentation, not a view of the
 * OmniScript, and it covers only what cannot be worked out by clicking.
 * ------------------------------------------------------------------ */

/* Edit in two places if you change it: here and popup.html. */
var SUPPORT_URL = 'https://buycoffee.to/mskrz';

var HELP = {
  data: {
    title: 'Data',
    lede: 'The JSON the selected OmniScript is holding right now, re-read on a timer.',
    sections: [['This tab', [
      ['Property', 'Any property name, not just jsonDataStr. Point it at a state object or anything else the component exposes.'],
      ['Amber highlight', 'A value that changed since the previous read. A collapsed branch containing a change is marked with a dot.'],
      ['Reveal element', 'Selects the host in the Elements tab and leaves it on $omni, so you can poke at it in the Console.'],
      ['Every', 'Poll interval, or Manual to read only when you press Refresh. Polling stops while the panel is off screen.'],
      ['Tree / Raw', 'Raw shows pretty-printed JSON. If the property is not valid JSON, the raw value is shown with the parse error.']
    ]]]
  },

  structure: {
    title: 'Structure',
    lede: 'Every element the OmniScript is built from, read from its definition and joined to the live data.',
    sections: [['This tab', [
      ['Definition', 'Which property holds the definition. jsonDef by default; change it if your build names it differently.'],
      ['Name', 'Rows read name (label): API name first, then the label in parentheses. In a multi-language script labels and Text Block text are custom-label keys, resolved through scriptHeaderDef.allCustomLabels; a single-language script stores the text on the element. Text Blocks show their text (textKey or text). The detail pane shows the underlying label / text key, and the status bar shows the script language.'],
      ['Glyphs', '▤ step · ⚡ action · ☑ choice · ✎ input · ¶ display · ▦ block · ⊘ validation / set errors / messaging · <> custom component. Hover for the exact type.'],
      ['! ? ↗ ⚠', 'Required · has show/hide conditions (hover for the expression) · calls a Data Mapper or Integration Procedure · a custom-label key the element uses (label, Text Block text, help text or a manually-entered choice option) is missing from allCustomLabels — one missing key breaks a multi-language OmniScript; hover for which.'],
      ['Sections', 'Steps and blocks that contain other elements have a ▾ twisty — click to collapse the section. Everything starts expanded. Collapse all / Expand all act on every section. Collapsing is off while a filter or Actions only is active.'],
      ['Actions only', 'Filters to elements that call something — the script\'s whole integration surface in one list.'],
      ['Value', 'The Value column and Current value tab show the live data. For a radio or select with manual options the stored value is joined with its option label, e.g. US (United States).'],
      ['Visibility tab', 'The element\'s show/hide rule as a readable expression, with the raw definition underneath.'],
      ['Set values', 'For a Set Values element the second tab lists the assignments it writes into the data (field → value or formula) rather than a live value.'],
      ['Validation tab', 'Shown for Set Errors and Messaging / Validation elements: the expression, each message (and whether it fires on a true or false result), and for Set Errors which element the error lands on. Readable summary on top, raw definition underneath.'],
      ['Resizing', 'Drag the divider between the element list and the detail pane to rebalance them; it works whether they sit side by side or stacked. Double-click to reset.'],
      ['Editing in Designer', 'The tree is loaded once. Press Rescan after changing the script to pick up the new definition.']
    ]]]
  },

  actions: {
    title: 'Remote actions',
    lede: 'Apex calls the page makes while you work, decoded. Capture runs whenever the panel is open, whichever tab you are on.',
    sections: [['This tab', [
      ['Naming', 'Data Mappers and Integration Procedures are named by their bundle or key rather than the integration class they share.'],
      ['Batched calls', 'One HTTP request can carry several actions. Each gets its own row, with its own input and output.'],
      ['HTTP vs Result', 'The first pill is the transport, the second is the payload. A 200 with ERROR means Apex returned an error inside a successful response — hover for which rule fired.'],
      ['Started / Took', 'Clock time the request left the browser, and the round trip in milliseconds.'],
      ['OmniStudio only', 'Untick to see every Apex call the page makes, not just OmniStudio traffic.'],
      ['Preserve on reload', 'Keeps the log across page loads. Export writes the visible calls to a JSON file.'],
      ['Resizing', 'Drag the divider between the list and the detail pane to rebalance them, side by side or stacked. Double-click it to reset.']
    ]]]
  },

  common: ['Everywhere', [
    ['Scope bar', 'The OmniScript and Frame pickers apply to every tab. Frame filters the list to one document; All frames searches everything.'],
    ['Nested', 'Child element components inherit the same properties as their OmniScript, so a 40-element script is 40 hosts. Only top-level ones are listed unless you tick this.'],
    ['Rescan', 'Looks for frames and OmniScripts again. Runs automatically every few seconds while the panel is visible.'],
    ['Limits', 'Closed shadow roots and cross-origin frames cannot be read. That is a browser restriction, not a setting.']
  ]]
};

var help = document.getElementById('help-overlay');
var helpBody = document.getElementById('help-body');

function renderHelp() {
  var content = HELP[state.tab] || HELP.data;
  helpBody.textContent = '';

  var h = document.createElement('h2');
  h.textContent = content.title;
  helpBody.appendChild(h);

  var lede = document.createElement('div');
  lede.className = 'lede';
  lede.textContent = content.lede;
  helpBody.appendChild(lede);

  content.sections.concat([HELP.common]).forEach(function (section) {
    var heading = document.createElement('h3');
    heading.textContent = section[0];
    helpBody.appendChild(heading);

    var dl = document.createElement('dl');
    section[1].forEach(function (pair) {
      var dt = document.createElement('dt');
      dt.textContent = pair[0];
      dl.appendChild(dt);
      var dd = document.createElement('dd');
      dd.textContent = pair[1];
      dl.appendChild(dd);
    });
    helpBody.appendChild(dl);
  });

  var foot = document.createElement('div');
  foot.className = 'help-foot';

  var note = document.createElement('span');
  note.textContent = 'Unofficial tool · not affiliated with Salesforce';
  foot.appendChild(note);

  var link = document.createElement('a');
  link.href = SUPPORT_URL;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Buy me a coffee \u2615';
  foot.appendChild(link);

  helpBody.appendChild(foot);
}

function toggleHelp(show) {
  var open = show === undefined ? help.hidden : show;
  if (open) renderHelp();
  help.hidden = !open;
  document.getElementById('help').setAttribute('aria-expanded', String(open));
}

document.getElementById('help').addEventListener('click', function () { toggleHelp(); });
document.getElementById('help-close').addEventListener('click', function () { toggleHelp(false); });

help.addEventListener('click', function (ev) {
  if (ev.target === help) toggleHelp(false);
});

document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && !help.hidden) toggleHelp(false);
});

/* ------------------------------------------------------------------ *
 * Tab shell
 * ------------------------------------------------------------------ */

var tabs = {
  data: { button: document.getElementById('tab-data'), view: document.getElementById('view-data') },
  structure: { button: document.getElementById('tab-structure'), view: document.getElementById('view-structure') },
  actions: { button: document.getElementById('tab-actions'), view: document.getElementById('view-actions') }
};

function showTab(name) {
  Object.keys(tabs).forEach(function (key) {
    var on = key === name;
    tabs[key].button.classList.toggle('is-on', on);
    tabs[key].button.setAttribute('aria-selected', String(on));
    tabs[key].view.hidden = !on;
  });

  state.tab = name;
  state.active = name === 'data';
  if (!help.hidden) renderHelp();

  if (name !== 'structure') Structure.hide();
  if (name !== 'actions') RemoteActions.hide();

  if (name === 'data') {
    render();
    read();
  } else {
    clearTimeout(timer);
    if (name === 'structure') Structure.show();
    else RemoteActions.show();
  }
}

tabs.data.button.addEventListener('click', function () { showTab('data'); });
tabs.structure.button.addEventListener('click', function () { showTab('structure'); });
tabs.actions.button.addEventListener('click', function () { showTab('actions'); });

/* Told by devtools.js when the panel is on screen. */
window.OmniPanel = {
  setVisible: function (visible) {
    if (state.visible === visible) return;
    state.visible = visible;
    Targets.setVisible(visible);
    if (visible) {
      if (state.active) read();
    } else {
      clearTimeout(timer);
    }
    renderStatus();
  }
};

Targets.subscribe(function (reason) {
  if (reason === 'navigated' || reason === 'selection' || reason === 'props') resetPayload();
  if (state.active) { render(); read(); }
});

RemoteActions.mount();
Structure.mount();

/* Draggable divider between the list and detail panes on both split tabs. */
document.querySelectorAll('.split').forEach(function (s) { Split.init(s); });
Targets.mount({
  target: document.getElementById('target'),
  frame: document.getElementById('frame'),
  nested: document.getElementById('show-nested')
});

document.getElementById('rescan').addEventListener('click', function () {
  Targets.refresh(function () { if (state.active) read(); });
});

Targets.start(function () { read(); });