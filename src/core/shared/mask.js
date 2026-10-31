'use strict';

/* Redaction for anything that leaves the panel as text. The masking itself
 * (placeholders for strings and numbers, keys and structure kept) is the
 * kit's, src/kit/core/mask.js; it is re-exported here so the panel's modules
 * keep one place to import it from. payloadText stays here because it lays
 * out the page's own text through raw-json.js.
 *
 * Pure: no DOM, no chrome.*. */

import { maskValues } from '../../kit/core/mask.js';
import { rawView } from './raw-json.js';

export { MASK_STRING, MASK_NUMBER, maskValues, maskJsonText } from '../../kit/core/mask.js';

/* The payload as text for the clipboard or a file, masked when `masking` is
 * on. null when masking was asked for but the property is not valid JSON, so
 * there is no structure to keep. `payload` is { parseError, raw, data }.
 * Unmasked, it is the page's own text laid out for reading (key order and
 * number digits untouched, see raw-json.js); masked, it is the parsed data
 * with its values replaced. */
export function payloadText({ parseError, raw, data }, masking) {
  if (parseError) return masking ? null : (raw || '');
  if (data === undefined) return '';
  if (!masking) return rawView(raw, data).copyText;
  try { return JSON.stringify(maskValues(data), null, 2); } catch { return raw || ''; }
}
