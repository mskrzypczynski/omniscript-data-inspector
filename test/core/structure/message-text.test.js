import { describeMessage, scriptLanguageCode } from '../../../src/core/structure/message-text.js';
import { createEstimator } from '../../../src/core/structure/formula-values.js';

const FORMULA = "=IF(%LanguageCode%=='xx','Please accept the terms.','Please tick the box to continue.')";
const estimatorFor = (data) => createEstimator([], data);

describe('describeMessage', () => {
  it('leaves plain text alone', () => {
    expect(describeMessage('Pick one', estimatorFor({}))).toEqual({ formula: false, text: 'Pick one' });
    expect(describeMessage(undefined, estimatorFor({}))).toEqual({ formula: false, text: '' });
  });

  it('evaluates a formula against the data and marks it as an estimate', () => {
    const fr = describeMessage(FORMULA, estimatorFor({ LanguageCode: 'xx' }));
    expect(fr).toMatchObject({ formula: true, ok: true, text: 'Please accept the terms.', estimated: true, fromScriptLanguage: false });
    expect(fr.plain).toBe('≈ “Please accept the terms.”');
    expect(fr.raw).toBe(FORMULA);
    expect(fr.note).toContain(FORMULA);

    const en = describeMessage(FORMULA, estimatorFor({ LanguageCode: 'en' }));
    expect(en.text).toBe('Please tick the box to continue.');
  });

  it('reads %LanguageCode% from the script when the data has none, and says so', () => {
    const found = describeMessage(FORMULA, estimatorFor({}), { language: 'xx' });
    expect(found.ok).toBe(true);
    expect(found.text).toBe('Please accept the terms.');
    expect(found.fromScriptLanguage).toBe(true);
    expect(found.note).toContain("script's language");
    expect(found.note).toContain('not from the data');
  });

  it('prefers the data to the script language', () => {
    const found = describeMessage(FORMULA, estimatorFor({ LanguageCode: 'en' }), { language: 'xx' });
    expect(found.text).toBe('Please tick the box to continue.');
    expect(found.fromScriptLanguage).toBe(false);
  });

  it('cannot tell when a merge field has no value, and shows the formula', () => {
    const found = describeMessage(FORMULA, estimatorFor({}));
    expect(found.ok).toBe(false);
    expect(found.text).toBe("can't tell: no value for %LanguageCode%");
    expect(found.plain).toBe(`≈ can't tell: no value for %LanguageCode% (${FORMULA})`);
    expect(found.raw).toBe(FORMULA);
  });

  it('words it for a sentence and for a table cell, without the raw formula', () => {
    const ok = describeMessage(FORMULA, estimatorFor({ LanguageCode: 'xx' }));
    expect(ok.line).toBe('estimated “Please accept the terms.”');
    expect(ok.cell).toBe('≈ “Please accept the terms.”');
    expect(ok.sentence).toBe(ok.line);
    const bad = describeMessage(FORMULA, estimatorFor({}));
    expect(bad.line).toBe("can't tell: no value for %LanguageCode%");
    expect(bad.cell).toBe("≈ can't tell: no value for %LanguageCode%");
    expect(bad.sentence).toBe(`can't tell: no value for %LanguageCode% (${FORMULA})`);
  });

  it('only borrows the script language for %LanguageCode%', () => {
    const found = describeMessage('=%Name% & "!"', estimatorFor({}), { language: 'xx' });
    expect(found.ok).toBe(false);
    expect(found.text).toBe("can't tell: no value for %Name%");
    expect(found.fromScriptLanguage).toBe(false);
  });

  it('reads the fields the way a rule table does', () => {
    const found = describeMessage('="Hello " & %Step1:Name%', estimatorFor({ Step1: { Name: 'Ada' } }));
    expect(found.text).toBe('Hello Ada');
  });

  it('says why a formula it cannot parse is not shown', () => {
    const found = describeMessage('=IF(', estimatorFor({}));
    expect(found.ok).toBe(false);
    expect(found.text).toMatch(/^can't tell: /);
  });

  it('does not say twice that the formula could not be evaluated', () => {
    ['=1 +', '=FOO(1)', '= '].forEach((formula) => {
      const found = describeMessage(formula, estimatorFor({}));
      expect(found.ok).toBe(false);
      expect(found.note.match(/could not be evaluated/g) || []).not.toHaveLength(2);
      expect(found.note).not.toContain('could not be evaluated: The formula');
    });
  });

  it('works without an estimator', () => {
    expect(describeMessage('="a" & "b"', null).text).toBe('ab');
  });
});

describe('scriptLanguageCode', () => {
  it('keeps the code as written, with its region', () => {
    expect(scriptLanguageCode('xx_YY')).toBe('xx_YY');
    expect(scriptLanguageCode('XX')).toBe('xx');
    expect(scriptLanguageCode('aa-bb')).toBe('aa_BB');
  });

  it('gives nothing for a language written out: which code it stands for is not known', () => {
    expect(scriptLanguageCode('English')).toBe('');
    expect(scriptLanguageCode('Language One')).toBe('');
  });

  it('gives nothing for Multi-Language or a name it does not know', () => {
    expect(scriptLanguageCode('Multi-Language')).toBe('');
    expect(scriptLanguageCode('Nowhere')).toBe('');
    expect(scriptLanguageCode(undefined, null)).toBe('');
  });

  it('takes the first candidate that says something', () => {
    expect(scriptLanguageCode('Multi-Language', 'aa_BB')).toBe('aa_BB');
    expect(scriptLanguageCode('English', 'aa_BB')).toBe('aa_BB');
  });
});

describe('%LanguageCode% from a region-shaped script language', () => {
  const regionFormula = "=IF(%LanguageCode%=='xx_YY','Region text','Other text')";
  const bareFormula = "=IF(%LanguageCode%=='xx','Bare text','Other text')";
  const both = "=IF(%LanguageCode%=='xx_YY','Region text',IF(%LanguageCode%=='xx','Bare text','Other text'))";

  it('matches a comparison with the full code', () => {
    const found = describeMessage(regionFormula, estimatorFor({}), { language: 'xx_YY' });
    expect(found.text).toBe('Region text');
    expect(found.note).toContain('xx_YY');
  });

  it('also matches a comparison with the bare language, and says so', () => {
    const found = describeMessage(bareFormula, estimatorFor({}), { language: 'xx_YY' });
    expect(found.ok).toBe(true);
    expect(found.text).toBe('Bare text');
    expect(found.fromScriptLanguage).toBe(true);
    expect(found.note).toContain('read as xx');
  });

  it('does not guess when the formula compares with both forms', () => {
    const found = describeMessage(both, estimatorFor({}), { language: 'xx_YY' });
    expect(found.ok).toBe(false);
    expect(found.text).toBe("can't tell: %LanguageCode% could be xx_YY or xx in this script");
  });

  it('is sure when both forms give the same text', () => {
    const found = describeMessage("=IF(%LanguageCode%=='qq','Never','Same text')", estimatorFor({}), { language: 'xx_YY' });
    expect(found.text).toBe('Same text');
    expect(found.ok).toBe(true);
  });

  it('keeps a bare language bare', () => {
    expect(describeMessage(bareFormula, estimatorFor({}), { language: 'xx' }).text).toBe('Bare text');
    expect(describeMessage(regionFormula, estimatorFor({}), { language: 'xx' }).text).toBe('Other text');
  });

  it('cannot tell when the script names its language in words', () => {
    const found = describeMessage(bareFormula, estimatorFor({}), { language: scriptLanguageCode('English') });
    expect(found.ok).toBe(false);
    expect(found.text).toBe("can't tell: no value for %LanguageCode%");
  });

  it('prefers the data to the script language', () => {
    const found = describeMessage(regionFormula, estimatorFor({ LanguageCode: 'zz' }), { language: 'xx_YY' });
    expect(found.text).toBe('Other text');
    expect(found.fromScriptLanguage).toBe(false);
  });
});
