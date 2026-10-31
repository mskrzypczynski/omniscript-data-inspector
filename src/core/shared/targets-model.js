'use strict';

/* Small pure helpers shared by the top bar (src/ui/targets.js) and the Data
 * tab's status line. The frame/host discovery itself lives in targets.js,
 * since it drives chrome.devtools.* calls — only the formatting and
 * change-detection logic that discovery leans on is pure enough to live here.
 *
 * hostScan, hostFetch and frameScan are NOT here: they are stringified and
 * evaluated inside the inspected page (see CONTRIBUTING.md), so they must stay
 * completely self-contained rather than importing from this module.
 */

/* A cheap fingerprint of a host list, used to notice when the set of
 * OmniScripts on the page actually changed rather than re-rendering on every
 * poll regardless. */
export function signature(hosts) {
  return hosts.map((host) => `${host.label}@${host.frame}`).join('|');
}

/* An empty key means it could not be read (a half-saved definition, say), not
 * a different script, so it matches any key. */
export function keysMatch(a, b) {
  return !a || !b || a === b;
}

const sameName = (a, b) => a.frame === b.frame && keysMatch(a.key, b.key) && a.label === b.label;

/* What identifies a host across rescans: its frame, script key and element
 * label, plus its rank among the hosts sharing all three (two scripts can use
 * the same element name). Indices are no good: they shift whenever a host
 * appears or vanishes earlier in the scan. */
export function hostIdentity(hosts, host) {
  return {
    frame: host.frame, key: host.key || '', label: host.label,
    rank: hosts.filter((other) => sameName(other, host)).indexOf(host)
  };
}

/* The index of the host with that identity, or -1. When fewer hosts share the
 * name than before, the last of them is the best guess. */
export function findHost(hosts, identity) {
  const named = hosts.filter((host) => sameName(host, identity));
  if (!named.length) return -1;
  return hosts.indexOf(named[Math.min(Math.max(identity.rank, 0), named.length - 1)]);
}

/* After a rescan: which host is selected now, and was the selection lost?
 * `selected` indexes `previousHosts`. The same host (see hostIdentity) stays
 * selected wherever it moved to. Otherwise the first host stands in, and the
 * selection is `lost` unless that host is another entry of the same script
 * (same frame and key) — then a tab may keep its payload, history and marks.
 * Nothing before the scan, or nothing after it (the page is loading), is not a
 * loss: a tab keeps showing what it last read. With showNested off, only the
 * hosts scriptHosts lists can be selected. */
export function reconcileSelection(previousHosts, selected, nextHosts, { showNested = false } = {}) {
  const previous = previousHosts[selected] || null;
  let index = 0;
  if (previous) {
    const found = findHost(nextHosts, hostIdentity(previousHosts, previous));
    index = found === -1 ? 0 : found;
  }
  if (index >= nextHosts.length) index = 0;

  if (!showNested && nextHosts.length) {
    const current = nextHosts[index];
    const listed = scriptHosts(nextHosts);
    if (!current || listed.indexOf(current) === -1) {
      const sameKey = current && current.key && listed.find((host) => host.key === current.key);
      const pick = sameKey || listed[0];
      if (pick) index = nextHosts.indexOf(pick);
    }
  }

  const next = nextHosts[index] || null;
  const lost = !!previous && !!next && !(next.frame === previous.frame &&
    keysMatch(next.key, previous.key) && (next.label === previous.label || (!!next.key && next.key === previous.key)));
  return { index, lost };
}

/* The last path segment of a frame's URL, for a compact frame picker option —
 * falls back to the hostname, and to a raw slice if the URL cannot be parsed. */
export function shortFrame(url) {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    return tail.length > 22 ? tail.slice(0, 22) + '…' : tail;
  } catch {
    return url.slice(0, 24);
  }
}

/* Human-readable byte count, shared by every place that reports a payload
 * size (host list, status bar). */
export function formatBytes(byteCount) {
  if (!byteCount) return '0 B';
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 * 1024) return `${(byteCount / 1024).toFixed(1)} KB`;
  return `${(byteCount / 1024 / 1024).toFixed(2)} MB`;
}

/* One OmniScript can turn up as several top-level hosts with the same
 * Type/SubType/Language: more than one of its elements may expose the whole
 * definition, and a same-origin frame is found both from the page and on its
 * own. The picker lists each script once, by the host holding the most data
 * (on a tie, the first found), and counts the rest with the embedded scripts.
 * Hosts without a key, or nested in another host, are left as they are. */
export function scriptHosts(hosts) {
  const best = new Map();
  hosts.forEach((host) => {
    if (!host.top || !host.key) return;
    const held = best.get(host.key);
    if (!held || holdsMore(host, held)) best.set(host.key, host);
  });
  return hosts.filter((host) => host.top && (!host.key || best.get(host.key) === host));
}

function holdsMore(a, b) {
  if (a.dataLen !== b.dataLen) return a.dataLen > b.dataLen;
  return a.defLen > b.defLen;
}

/* What scriptHosts leaves out, told apart: nested hosts that are whole
 * OmniScripts (`script` true; a real embedded script), and the rest, which are
 * element components (`script` false), hosts whose definition could not be
 * told (`script` missing) and repeats of a script already listed (nested ones
 * too: an element component carrying its parent's whole definition). A host the
 * scan could not classify is not claimed to be a script. */
export function hiddenHostCounts(hosts) {
  const listed = new Set(scriptHosts(hosts));
  const listedKeys = new Set([...listed].map((host) => host.key).filter(Boolean));
  let scripts = 0;
  let others = 0;
  hosts.forEach((host) => {
    if (listed.has(host)) return;
    /* An element component that carries its parent's whole definition has the
     * parent's key: it is that script again, not an embedded script. */
    const again = !!host.key && listedKeys.has(host.key);
    if (!host.top && host.script === true && !again) scripts++; else others++;
  });
  return { scripts, others };
}
