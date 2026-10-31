'use strict';

/* The Raw view of a call: what went over the wire, as the two texts the view
 * shows and what it says about each. Pure: the caller draws them.
 *
 * The request is the record's rawRequest (the Aura action, the LWR, REST or
 * Visualforce body as the page sent it); the response is the text the panel
 * kept (cut at RAW_LIMIT). Both leave through Copy, so Mask values applies to
 * the text, and fields that look like a credential are never shown. */

import { RAW_LIMIT, stripEnvelope } from '../shared/actions-model.js';
import { formatRaw } from '../shared/raw-json.js';

export const NOT_KEPT = 'Not kept for this call.';
export const HIDDEN_FIELD = '<hidden>';

/* The words of a key, split at separators and at camelCase: "X-CSRF-Token" is
 * x, csrf, token; "sfdcSession" is sfdc, session; "CSRFToken" is csrf, token. */
function wordsOf(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/* The words that make a key a credential: a token, a csrf or xsrf value, a
 * secret, a password, an authorization, a session, a cookie, a JWT, a bearer
 * value, an API, private or access key, a signature, a one-time code (otp) or a
 * session id (sid). A word inside the key is enough,
 * so refreshToken, _csrf and client_secret are caught; vid, ns, tid and the
 * names of a script's own fields are not. */
const CREDENTIAL_WORDS = new Set([
  'token', 'tokens', 'csrf', 'xsrf', 'secret', 'password', 'passwd', 'passcode', 'pwd', 'auth', 'authorization', 'oauth',
  'session', 'sessionid', 'sid', 'cookie', 'cookies', 'jwt', 'bearer', 'apikey', 'privatekey', 'accesskey', 'signature', 'otp', 'credential', 'credentials'
]);

export function isCredentialKey(key) {
  const words = wordsOf(key);
  if (words.some((word) => CREDENTIAL_WORDS.has(word))) return true;
  // "api key", "api_key", "apiKey", "privateKey", "access-key": two words.
  return words.some((word, at) => ['api', 'private', 'access'].includes(word) && words[at + 1] === 'key');
}

const MAX_DEPTH = 200;

/* A copy of the value with every credential-like field replaced by
 * HIDDEN_FIELD, and how many were. Other values are left as they are. */
export function withoutCredentials(value) {
  let hidden = 0;
  /* A string that holds JSON text (a Visualforce answer's `result` does) is
   * read too: when a credential is inside it, the text is written again
   * without it. Text with nothing to hide is left as it was. */
  const inText = (text, depth) => {
    const start = text.trimStart()[0];
    if (depth > MAX_DEPTH || (start !== '{' && start !== '[')) return text;
    let inner;
    try { inner = JSON.parse(text); } catch { return text; }
    const before = hidden;
    const clean = walk(inner, depth + 1);
    return hidden === before ? text : JSON.stringify(clean);
  };
  const walk = (item, depth) => {
    if (typeof item === 'string') return inText(item, depth);
    if (item === null || typeof item !== 'object' || depth > MAX_DEPTH) return item;
    if (Array.isArray(item)) return item.map((child) => walk(child, depth + 1));
    const out = {};
    Object.keys(item).forEach((key) => {
      const isSecret = isCredentialKey(key) && item[key] !== null && item[key] !== undefined && item[key] !== '';
      if (isSecret) hidden++;
      Object.defineProperty(out, key, {
        value: isSecret ? HIDDEN_FIELD : walk(item[key], depth + 1), enumerable: true, writable: true, configurable: true
      });
    });
    return out;
  };
  const copy = walk(value, 0);
  return { value: copy, hidden };
}

const hiddenNote = (count) => (count ? `${count} credential-like field${count === 1 ? '' : 's'} left out.` : '');

/* Past the Aura guard some answers start with, e.g. "while(1);". */
const GUARD = /^\s*(?:while\s*\(\s*1\s*\)\s*;?|for\s*\(\s*;\s*;\s*\)\s*;?|\)\]\}',?)\s*/;

const joinNotes = (...notes) => notes.filter(Boolean).join(' ');

const cutWords = () => `Cut at ${Math.round(RAW_LIMIT / 1024)} KB: the rest was not kept.`;

/* mask: the function that turns a value into the value that may leave the
 * panel, or undefined while Mask values is off.
 *
 * Every view is { text, note } with text null when there is nothing to show
 * (and a copy button has nothing to copy); the note says why, or what was
 * done to the text. */

/* Text that is not JSON (an answer cut at the limit, say) can still hold
 * "key": "value" pairs: those of a credential key are hidden. A value cut off
 * by the end of the text goes too. */
const TEXT_PAIR = /("(?:[^"\\]|\\.)*")(\s*:\s*)"((?:[^"\\]|\\.)*)(?:"|$)/g;

/* The same pairs one or more levels down, as they stand in a JSON string that
 * holds JSON (a Visualforce answer's `result`): \"key\":\"value\", the quotes
 * written with backslashes. The value runs to the next escaped quote or, when
 * the text was cut, to its end. */
const ESCAPED_PAIR = /(\\+")([^"\\]*)(\\+")(\s*:\s*)(\\+")((?:(?!\\+")[\s\S])*)(\\+"|$)/g;

function withoutCredentialsInText(text) {
  let hidden = 0;
  const escaped = text.replace(ESCAPED_PAIR, (whole, keyOpen, key, keyClose, colon, valueOpen, value) => {
    if (!value || !isCredentialKey(key)) return whole;
    hidden++;
    return `${keyOpen}${key}${keyClose}${colon}${valueOpen}${HIDDEN_FIELD}${valueOpen}`;
  });
  const out = escaped.replace(TEXT_PAIR, (whole, quotedKey, colon, value) => {
    let key = quotedKey.slice(1, -1);
    try { key = JSON.parse(quotedKey); } catch { /* the key as written */ }
    if (!value || !isCredentialKey(key)) return whole;
    hidden++;
    return `${quotedKey}${colon}${JSON.stringify(HIDDEN_FIELD)}`;
  });
  return { text: out, hidden };
}

/* The request as pretty JSON, or as the text it was. Masked first, then the
 * credential fields are replaced, so <hidden> shows under Mask values too. */
export function rawRequestView(entry, mask) {
  const raw = entry && entry.action ? entry.action.rawRequest : undefined;
  if (raw === undefined || raw === null) return { text: null, note: NOT_KEPT };
  if (typeof raw === 'string') {
    if (mask) return { text: null, note: 'Not shown while Mask values is on: the request is text, so its values cannot be masked.' };
    return { text: raw, note: '' };
  }
  let printed;
  let hidden = 0;
  try {
    const found = withoutCredentials(mask ? mask(raw) : raw);
    hidden = found.hidden;
    printed = JSON.stringify(found.value, null, 2);
  } catch { printed = undefined; }
  if (printed === undefined) return { text: null, note: NOT_KEPT };
  return { text: printed, note: hiddenNote(hidden) };
}

// An Aura failure comes wrapped: a closing comment mark in front of the JSON and an ERROR comment after it.
const WRAPPED = /^\s*\*\//;

/* The answer as the page received it, laid out for reading when it is JSON
 * (the Aura guard or error wrapper, if any, is left out); credential-like
 * fields are replaced whatever Mask values says; text that is not JSON is
 * shown as it is, unless Mask values is on and its values cannot be masked. */
export function rawResponseView(entry, mask) {
  const raw = entry ? entry.rawResponse : undefined;
  if (typeof raw !== 'string') return { text: null, note: NOT_KEPT };
  const cut = raw.length >= RAW_LIMIT ? cutWords() : '';
  if (raw === '') return { text: null, note: joinNotes('The answer had no body.', cut) };

  const unguarded = raw.replace(GUARD, '');
  const body = stripEnvelope(unguarded);
  let parsed;
  let json = false;
  try { parsed = JSON.parse(body); json = true; } catch { /* shown as text below */ }

  if (json) {
    const wrapper = WRAPPED.test(unguarded) && body !== unguarded.trim();
    const left = wrapper ? 'the error wrapper around the JSON is left out' : (unguarded.length < raw.length ? 'the guard before the JSON is left out' : '');
    const laid = left ? `Laid out for reading; ${left}.` : 'Laid out for reading.';
    const found = withoutCredentials(mask ? mask(parsed) : parsed);
    // The page's own layout (digit for digit) stays unless a field had to go.
    const text = !mask && !found.hidden ? formatRaw(body).text : JSON.stringify(found.value, null, 2);
    return { text, note: joinNotes(laid, hiddenNote(found.hidden), cut) };
  }
  if (mask) {
    const why = cut
      ? 'Cut at 20 KB, so its values cannot be masked.'
      : 'Not shown while Mask values is on: the answer is not JSON, so its values cannot be masked.';
    return { text: null, note: cut ? why : joinNotes(why, cut) };
  }
  const scrubbed = withoutCredentialsInText(raw);
  return { text: scrubbed.text, note: joinNotes(hiddenNote(scrubbed.hidden), cut) };
}

/* Both sides, as the view shows them. */
export function rawView(entry, mask) {
  return { request: rawRequestView(entry, mask), response: rawResponseView(entry, mask) };
}
