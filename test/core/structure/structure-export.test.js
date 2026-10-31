'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import {
  structureMarkdown, structureCsv, customLabelsCsv, customLabelRows, hasCustomLabels, validationSummary,
  exportFileName, STRUCTURE_CSV_HEADER
} from '../../../src/core/structure/structure-export.js';

const el = (name, type = 'Text', propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const show = (field, data) => ({ group: { operator: 'AND', rules: [{ field, condition: '=', data }] } });

function build(steps, header = null, roots = []) {
  return flatten({
    children: [
      ...roots,
      ...steps.map(([name, elements, propSetMap]) => ({
        name, type: 'Step', propSetMap: propSetMap || {}, children: [{ eleArray: elements }]
      }))
    ]
  }, header);
}

const sample = () => build([
  ['Intro', [
    el('Name', 'Text', { label: 'Full name', required: true }),
    el('Group', 'Block', { show: show('Intro:Name', 'x') }, { children: [{ eleArray: [el('Inner', 'Text', { label: 'a|b' })] }] }),
    el('Lookup', 'Integration Procedure Action', { integrationProcedureKey: 'Acme_Find' }),
    el('Warn', 'Set Errors', { elementErrorMap: { Name: 'Too short' }, show: show('Intro:Name', 'z') })
  ], { label: 'Introduction' }],
  ['Done', []]
], null, [el('Prefill', 'DataRaptor Extract Action', { bundle: 'Acme_Bundle' })]);

describe('validationSummary', () => {
  it('is empty without validation and describes Set Errors and messaging', () => {
    const list = sample();
    expect(validationSummary(list.find((e) => e.name === 'Name').validation)).toBe('');
    expect(validationSummary(list.find((e) => e.name === 'Warn').validation))
      .toBe('Set Errors; when Intro:Name = "z"; Name: Too short');
    const messaging = build([['S', [el('Note', 'Messaging', {
      validateExpression: show('S:A', '1'), messages: [{ type: 'Requirement', text: 'Fill it', value: false, active: true }]
    })]]]).find((e) => e.name === 'Note');
    expect(validationSummary(messaging.validation)).toBe('Messaging; checks S:A = "1"; Requirement: Fill it');
  });
});

describe('structureMarkdown', () => {
  const text = structureMarkdown(sample(), { title: 'Demo flow' });
  const lines = text.split('\n');

  it('starts with the title and the number of elements', () => {
    expect(lines[0]).toBe('# Demo flow');
    expect(lines[2]).toBe('8 elements.');
  });

  it('has a heading per step with its label, and a table under it', () => {
    expect(lines).toContain('## 2. Intro (Introduction)');
    expect(lines).toContain('## 8. Done');
    const header = lines.indexOf('| # | Name | Type | Label | Required | Show rule | Calls | Validation |');
    expect(header).toBeGreaterThan(0);
    expect(lines[header + 1]).toMatch(/^\| --- /);
  });

  it('indents by depth inside the step and numbers elements across the script', () => {
    expect(lines).toContain('| 3 | Name | Text | Full name | yes |  |  |  |');
    expect(lines.find((l) => l.startsWith('| 5 |'))).toBe('| 5 |   Inner | Text | a\\|b |  |  |  |  |');
    expect(lines.find((l) => l.startsWith('| 4 |'))).toContain('Intro:Name = "x"');
  });

  it('writes the remote target and the validation summary', () => {
    expect(lines.find((l) => l.includes('| Lookup |'))).toContain('| Acme_Find |');
    expect(lines.find((l) => l.includes('| Warn |'))).toContain('Set Errors; when Intro:Name = "z"; Name: Too short');
  });

  it('says a step with nothing in it has none', () => {
    const done = lines.indexOf('## 8. Done');
    expect(lines[done + 2]).toBe('_No elements._');
  });

  it('puts elements outside any step in a table of their own', () => {
    expect(lines).toContain('## Outside steps');
    expect(lines.find((l) => l.includes('| Prefill |'))).toContain('Acme_Bundle');
  });

  it('copes with an empty script', () => {
    expect(structureMarkdown([])).toBe('# OmniScript structure\n\n0 elements.\n');
  });

  it('leaves live values out', () => {
    expect(text).not.toMatch(/Value/);
  });
});

describe('structureCsv', () => {
  it('has a header and a row per element with depth and parent', () => {
    const rows = structureCsv(sample()).trimEnd().split('\r\n');
    expect(rows[0]).toBe(STRUCTURE_CSV_HEADER.join(','));
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.includes(',Inner,'))).toBe('5,Inner,Text,a|b,,,,,2,Group');
    expect(rows.find((r) => r.startsWith('3,'))).toBe('3,Name,Text,Full name,yes,,,,1,Intro');
  });

  it('quotes cells with commas, quotes and line breaks', () => {
    const list = build([['S', [el('A', 'Text', { label: 'He said "hi", twice' })]]]);
    expect(structureCsv(list)).toContain('"He said ""hi"", twice"');
  });

  it('keeps a spreadsheet from running a cell as a formula', () => {
    const list = build([['S', [el('A', 'Text', { label: '=SUM(1,2)' }), el('B', 'Text', { label: '-5' })]]]);
    const text = structureCsv(list);
    expect(text).toContain(`"'=SUM(1,2)"`);
    expect(text).toContain(",'-5,");
  });

  it('writes only the header for an empty script', () => {
    expect(structureCsv([])).toBe(`${STRUCTURE_CSV_HEADER.join(',')}\r\n`);
  });
});

describe('custom labels', () => {
  const header = {
    bpLang: 'Multi-Language',
    allCustomLabels: { Hello: 'Hello', Unused: 'Spare', Bye: { value: 'Goodbye' } }
  };
  const labelled = () => build([['S', [
    el('Greeting', 'Text Block', { textKey: 'Hello' }),
    el('Farewell', 'Text', { label: 'Bye', helpText: 'Hello' }),
    el('Broken', 'Text', { label: 'Lost' })
  ]]], header);

  it('lists every key of the map and every key an element uses', () => {
    const { rows, languages } = customLabelRows(labelled(), header);
    expect(languages).toEqual([]);
    expect(rows.map((r) => r.key)).toEqual(['Hello', 'Unused', 'Bye', 'Lost']);
    expect(rows[0].usedBy).toEqual(['Greeting (text)', 'Farewell (help text)']);
    expect(rows[1]).toMatchObject({ usedBy: [], missing: false });
    expect(rows[3]).toMatchObject({ usedBy: ['Broken (label)'], missing: true });
  });

  it('writes key, resolved text, used by and missing', () => {
    const lines = customLabelsCsv(labelled(), header).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Key,Text,Used by,Missing');
    expect(lines[1]).toBe('Hello,Hello,Greeting (text); Farewell (help text),no');
    expect(lines[2]).toBe('Unused,Spare,,no');
    expect(lines[3]).toBe('Bye,Goodbye,Farewell (label),no');
    expect(lines[4]).toBe('Lost,,Broken (label),yes');
  });

  it('adds a text column per language when the map has several', () => {
    const several = {
      bpLang: 'Multi-Language',
      allCustomLabels: { Hello: { en_US: 'Hello', fr: 'Bonjour' }, Bye: { en_US: 'Bye' } }
    };
    const list = build([['S', [el('Greeting', 'Text', { label: 'Hello' }), el('Farewell', 'Text', { label: 'Bye' })]]], several);
    const lines = customLabelsCsv(list, several).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Key,Text (en_US),Text (fr),Used by,Missing');
    expect(lines[1]).toBe('Hello,Hello,Bonjour,Greeting (label),no');
    expect(lines[2]).toBe('Bye,Bye,,Farewell (label),no');
  });

  it('strips markup from the text', () => {
    const rich = { bpLang: 'Multi-Language', allCustomLabels: { K: '<b>Bold</b> text' } };
    expect(customLabelsCsv(build([['S', []]], rich), rich)).toContain('K,Bold text,,no');
  });

  it('has nothing to export for a single-language script without labels', () => {
    const list = build([['S', [el('A', 'Text', { label: 'Plain' })]]]);
    expect(hasCustomLabels(list, null)).toBe(false);
    expect(hasCustomLabels(list, { bpLang: 'English' })).toBe(false);
    expect(hasCustomLabels(labelled(), header)).toBe(true);
    expect(customLabelsCsv(list, null)).toBe('Key,Text,Used by,Missing\r\n');
  });
});

describe('exportFileName', () => {
  const now = new Date('2026-03-04T05:06:07.000Z');
  it('uses the script type and subtype', () => {
    expect(exportFileName({ bpType: 'demo', bpSubType: 'flow' }, 'structure', 'md', now)).toBe('omniscript-structure-demo_flow.md');
  });
  it('replaces characters a file system dislikes', () => {
    expect(exportFileName({ bpType: 'a b/c', bpSubType: 'd' }, 'labels', 'csv', now)).toBe('omniscript-labels-a-b-c_d.csv');
  });
  it('falls back to the time', () => {
    expect(exportFileName(null, 'definition', 'json', now)).toBe('omniscript-definition-2026-03-04T05-06-07-000Z.json');
  });
});
