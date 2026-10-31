'use strict';

/* Message and label text written as a formula. A Set Errors message, a
 * Messaging text or a property can start with "=" and then is a formula the
 * runtime evaluates; shown raw it reads as noise. This turns it into the text it
 * comes to against the live data, best effort, marked as an estimate (≈), with
 * the raw formula kept beside it.
 *
 * %LanguageCode% is the one merge field with a second source: when the data
 * holds nothing for it, the script's own language stands in, and the note says
 * so. Anything else without a value gives "can't tell", never a made-up text.
 *
 * Pure: no DOM, no chrome.*. */

import { evaluateFormula, isFormulaText, notEvaluatedText } from './formula.js';

/* The script's Language as a code, the way it is written: "en_US" stays
 * "en_US" (the region is kept, "pt-BR" reads "pt_BR"), "fi" stays "fi". '' for
 * Multi-Language and for anything that is not a code: a language written out
 * ("English") is not looked up, since which code the runtime then holds is not
 * known. Takes the candidates in order of trust. */
export function scriptLanguageCode(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const text = candidate.trim();
    if (!text || text.toLowerCase().startsWith('multi')) continue;
    const code = /^([a-z]{2})(?:[_-]([a-z0-9]{2,3}))?$/i.exec(text);
    if (code) return code[2] ? `${code[1].toLowerCase()}_${code[2].toUpperCase()}` : code[1].toLowerCase();
  }
  return '';
}

/* The runtime's value for a region-shaped code may be the full form or the
 * bare language, so both are tried: ["en_US", "en"]. */
const languageVariants = (language) => (language.includes('_') ? [language, language.split('_')[0]] : [language]);

const quotedIn = (raw, text) => new RegExp(`(['"])${text.replace(/[^\w]/g, '\\$&')}\\1`, 'i').test(raw);

const LANGUAGE_FIELD = /(^|:)LanguageCode$/i;

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

/* Evaluates a formula, %LanguageCode% from the data or else from the script's
 * language. A region-shaped language (en_US) is tried in both forms the runtime
 * may hold; when they give different texts, the form the formula itself compares
 * with decides, and when it compares with both (or neither) nothing is guessed. */
function evaluateWithLanguage(raw, estimator, language) {
  let usedLanguage = false;
  const run = (languageValue) => {
    usedLanguage = false;
    const result = evaluateFormula(raw, (path) => {
      const read = estimator && estimator.read ? estimator.read(path) : undefined;
      const value = read ? read.value : undefined;
      if (value !== undefined && value !== null && value !== '') return value;
      if (languageValue && LANGUAGE_FIELD.test(path)) { usedLanguage = true; return languageValue; }
      return value;
    });
    return { result, used: usedLanguage };
  };

  const variants = language ? languageVariants(language) : [''];
  const first = run(variants[0]);
  if (!first.used || variants.length === 1) {
    return { result: first.result, fromScriptLanguage: first.used, languageNote: '' };
  }

  const [full, bare] = variants;
  const second = run(bare);
  const same = first.result.ok === second.result.ok && (first.result.ok ? first.result.value === second.result.value : true);
  if (same) return { result: first.result, fromScriptLanguage: true, languageNote: '' };

  const fullCompared = quotedIn(raw, full);
  const bareCompared = quotedIn(raw, bare);
  if (fullCompared && !bareCompared) return { result: first.result, fromScriptLanguage: true, languageNote: '' };
  if (bareCompared && !fullCompared) {
    return { result: second.result, fromScriptLanguage: true, languageNote: `, read as ${bare} because the formula compares with "${bare}"` };
  }
  return {
    result: { ok: false, reason: `%LanguageCode% could be ${full} or ${bare} in this script` },
    fromScriptLanguage: true,
    languageNote: ''
  };
}

/* { formula: false, text } for plain text, else
 *   { formula: true, raw, ok, text, plain, note, estimated: true, fromScriptLanguage }
 *   text   — what it comes to, or "can't tell: no value for %LanguageCode%"
 *   plain  — the compact form for a table cell: ≈ “text”, or ≈ can't tell: … (raw)
 *   sentence — the same for running text: estimated “text”, or can't tell: … (raw)
 *   cell, line — those without the raw formula, which the view keeps in its fold:
 *                ≈ “text” for a table cell, estimated “text” for a line of text
 *   note   — the tooltip: that it is an estimate, the formula, where a language came from
 * `estimator` is createEstimator()'s result (its read() is how a rule table reads
 * a field); `language` the script's code, used only for %LanguageCode%. */
export function describeMessage(text, estimator, { language = '' } = {}) {
  if (!isFormulaText(text)) return { formula: false, text: typeof text === 'string' ? text : '' };

  const raw = text.trim();
  const { result, fromScriptLanguage, languageNote } = evaluateWithLanguage(raw, estimator, language);

  const notes = [];
  let shown;
  let plain;
  let sentence;
  let cell;
  let line;
  if (result.ok) {
    shown = result.value === null || result.value === undefined ? '' : String(result.value);
    plain = `≈ “${shown}”`;
    sentence = `estimated “${shown}”`;
    cell = plain;
    line = sentence;
    notes.push(`Estimated from the formula ${raw}: best effort, the script's own engine decides what is shown.`);
  } else {
    shown = `can't tell: ${lowerFirst(result.reason)}`;
    plain = `≈ ${shown} (${raw})`;
    sentence = `${shown} (${raw})`;
    cell = `≈ ${shown}`;
    line = shown;
    notes.push(`${notEvaluatedText(result.reason)}. ${raw}`);
  }
  if (fromScriptLanguage) {
    notes.push(`%LanguageCode% came from the script's language (${language}${languageNote}), not from the data.`);
  }
  return { formula: true, raw, ok: result.ok, text: shown, plain, sentence, cell, line, note: notes.join('\n'), estimated: true, fromScriptLanguage };
}
