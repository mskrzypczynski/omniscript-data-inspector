'use strict';

/* Salesforce record Ids in the payload: which values look like one, and the
 * address that opens it in the org the page belongs to.
 *
 * Pure: no DOM, no chrome.*. */

const RECORD_ID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

/* The alphabet of the 18-character suffix: A-Z, then 0-5. */
const CHECKSUM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

/* The three characters that end an 18-character Id: for each group of five of
 * the first 15 characters, a number made of one bit per upper-case letter
 * (the first character is bit 0), written in the alphabet above. */
export function idChecksum(id15) {
  let out = '';
  for (let group = 0; group < 3; group++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const char = id15.charAt(group * 5 + i);
      if (char >= 'A' && char <= 'Z') bits |= 1 << i;
    }
    out += CHECKSUM_ALPHABET.charAt(bits);
  }
  return out;
}

/* 15 or 18 letters and digits that read as an Id and not as a word or a long
 * number (a phone number, a timestamp). The key prefix and the instance (the first nine characters of a real
 * Id, such as 0015g0000) always hold a digit, so a word like "RetirementPlans"
 * is not one; an 18-character Id must also end with the checksum of its first
 * 15 characters. Only strings qualify. */
export function isRecordId(value) {
  if (typeof value !== 'string' || !RECORD_ID.test(value)) return false;
  if (/^[0-9]+$/.test(value) || !/[0-9]/.test(value.slice(0, 9))) return false;
  return value.length === 15 || idChecksum(value.slice(0, 15)) === value.slice(15);
}

/* `${origin}/${id}`, or '' for an origin that is not a web address or a value
 * that is not an Id. A trailing slash on the origin is dropped. */
export function recordUrl(origin, id) {
  if (!isRecordId(id)) return '';
  let url;
  try { url = new URL(String(origin || '')); } catch { return ''; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  return `${url.origin}/${id}`;
}
