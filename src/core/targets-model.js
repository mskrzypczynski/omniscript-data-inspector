'use strict';

/* Small pure helpers shared by the scope bar (src/ui/targets.js) and the Data
 * tab's status line. The frame/host discovery itself lives in targets.js,
 * since it drives chrome.devtools.* calls — only the formatting and
 * change-detection logic that discovery leans on is pure enough to live here.
 *
 * hostScan, hostFetch and frameScan are NOT here: they are stringified and
 * evaluated inside the inspected page (see CLAUDE.md), so they must stay
 * completely self-contained rather than importing from this module.
 */

/* A cheap fingerprint of a host list, used to notice when the set of
 * OmniScripts on the page actually changed rather than re-rendering on every
 * poll regardless. */
export function signature(hosts) {
  return hosts.map((host) => `${host.label}@${host.frame}`).join('|');
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
