'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { lintDefinition, sortProblems, createLintCache, countProblems } from '../../../src/core/structure/lint.js';
import {
  createReferences, ruleReferences, mergeFields, assignmentsOf, shortList
} from '../../../src/core/shared/references.js';

const el = (name, type, propSetMap = {}, extra = {}) => ({ name, type, propSetMap, ...extra });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

function build(steps, header = null) {
  return flatten({
    children: steps.map(([name, elements, propSetMap]) => ({
      name, type: 'Step', propSetMap: propSetMap || {}, children: [{ eleArray: elements }]
    }))
  }, header);
}
const lint = (steps, header, data) => lintDefinition(build(steps, header), header, data);
const codes = (problems) => problems.map((problem) => problem.code);

describe('mergeFields / ruleReferences / assignmentsOf', () => {
  it('finds %merge% fields and ignores percentages and functions', () => {
    expect(mergeFields('Hi %Name%, you owe %Step:Total|1% (10% off, 20 % too)')).toEqual(['Name', 'Step:Total|1']);
    expect(mergeFields('%$Vlocity.UserId% and 5%')).toEqual([]);
  });

  it('collects the fields of nested groups and the merges in expected values', () => {
    const group = { group: { operator: 'AND', rules: [
      { field: 'A:B', condition: '=', data: '%C%' },
      { group: { operator: 'OR', rules: [{ field: 'D', condition: '=', data: '=%E%' }] } }
    ] } };
    expect(ruleReferences(group)).toEqual({ fields: ['A:B', 'D'], merges: ['C'] });
  });

  it('reads Set Values from an object or a list', () => {
    expect(assignmentsOf({ setValues: { A: '1', B: 2 } })).toEqual([
      { target: 'A', expression: '1' }, { target: 'B', expression: '2' }
    ]);
    expect(assignmentsOf({ setValues: [{ name: 'A', value: 'x' }] })).toEqual([{ target: 'A', expression: 'x' }]);
    expect(assignmentsOf({ setValues: null })).toEqual([]);
  });

  it('shortens a long list to three names and a count', () => {
    expect(shortList(['a', 'b', 'c'])).toBe('a, b, c');
    expect(shortList(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2');
  });
});

describe('createReferences', () => {
  const elements = () => build([
    ['Intro', [el('Kind', 'Text'), el('Group', 'Block', {}, { children: [{ eleArray: [el('Inner', 'Text')] }] })]],
    ['Other', [
      el('Company', 'Text', { show: rule('Intro:Kind', '=', 'Business') }),
      el('Fill', 'Set Values', { elementValueMap: { Kind: 'x', 'Intro:Group:Inner': 'y', Brand: 'z' } }),
      el('Lookup', 'DataRaptor Extract Action')
    ]]
  ]);

  it('resolves a bare name, a step path, a path through a block and a repeat suffix', () => {
    const refs = createReferences(elements());
    expect(refs.resolve('Kind').element.name).toBe('Kind');
    expect(refs.resolve('Intro:Kind').element.name).toBe('Kind');
    expect(refs.resolve('Intro:Group|1:Inner').element.name).toBe('Inner');
    expect(refs.resolve('%Intro:Kind%').element.name).toBe('Kind');
  });

  it('does not accept a path through the wrong step', () => {
    const hit = createReferences(elements()).resolve('Intro:Company');
    expect(hit).toEqual({ element: null, external: false });
  });

  it('treats response data of an action, nodes a Set Values creates and odd text as external', () => {
    const refs = createReferences(elements());
    expect(refs.resolve('Lookup:Name').external).toBe(true);
    expect(refs.resolve('Brand').external).toBe(true);
    expect(refs.resolve('$Vlocity.UserId').external).toBe(true);
    expect(refs.resolve('').external).toBe(true);
    expect(refs.resolve('Nothing')).toEqual({ element: null, external: false });
  });

  it('indexes what each element depends on, who uses it and who writes it', () => {
    const list = elements();
    const key = (name) => list.find((e) => e.name === name).key;
    const refs = createReferences(list);
    expect(refs.dependsOn.get(key('Company'))).toEqual([{ field: 'Intro:Kind', key: key('Kind') }]);
    expect(refs.usedBy.get(key('Kind'))).toEqual([key('Company')]);
    expect(refs.writtenBy.get(key('Kind'))).toEqual([key('Fill')]);
    expect(refs.writtenBy.get(key('Inner'))).toEqual([key('Fill')]);
  });
});

describe('lintDefinition', () => {
  const live = {}; // data that exists but holds none of the names used below

  it('is quiet for a sound script', () => {
    expect(lint([['Intro', [
      el('Kind', 'Text'),
      el('Company', 'Text', { show: rule('Intro:Kind', '=', 'Business'), label: 'Company for %Kind%' })
    ]]], null, live)).toEqual([]);
  });

  it('reports a rule field that is neither an element nor a key in the data, as a note', () => {
    const found = lint([['Intro', [
      el('A', 'Text', { show: rule('Gone', '=', 'x') }),
      el('B', 'Text', { show: rule('AlsoGone', '=', 'x') })
    ]]], null, live);
    expect(codes(found)).toEqual(['rule-field-missing', 'rule-field-missing']);
    expect(found[0].severity).toBe('note');
    expect(found[0].message).toContain('Gone');
  });

  it('does not judge names without data', () => {
    expect(lint([['Intro', [el('A', 'Text', { show: rule('Gone', '=', 'x') })]]])).toEqual([]);
  });

  it('accepts a name that is a key in the data, by path or anywhere', () => {
    const data = { Intro: { Gone: 1 }, Deep: { Inside: { Other: 2 } } };
    const found = lint([['Intro', [
      el('A', 'Text', { show: rule('Elsewhere:Gone', '=', 'x') }),
      el('B', 'Text', { show: rule('Other', '=', 'x') }),
      el('C', 'Text', { label: 'Has %Other%' })
    ]]], null, data);
    expect(found).toEqual([]);
  });

  it('does not report formulas, $ references, response nodes of actions or merge values in a rule', () => {
    const found = lint([['Intro', [
      el('Kind', 'Text'),
      el('GetIP', 'Integration Procedure Action'),
      el('A', 'Text', { show: rule('Kind', '=', '%Kind%') }),
      el('B', 'Text', { show: rule('Kind', '=', '=%Nothing% + 1') }),
      el('C', 'Text', { show: rule('GetIP:Result', '=', 'x') }),
      el('D', 'Text', { show: rule('GetIP:Result|1:Id', '=', 'x') }),
      el('E', 'Text', { show: rule('=IF(Kind = 1, 2, 3)', '=', 'x') }),
      el('F', 'Text', { show: rule('$Vlocity.UserId', '=', 'x') }),
      el('G', 'Text', { show: rule('%Kind%', '=', 'x') })
    ]]], null, live);
    expect(found).toEqual([]);
  });

  it('yields no problems for a definition with response nodes and formulas', () => {
    const found = lint([['Intro', [
      el('IPResult', 'Integration Procedure Action', { integrationProcedureKey: 'a_b' }),
      el('DRExtract', 'DataRaptor Extract Action'),
      el('Total', 'Formula', { expression: '=IPResult:Amount * 2 + %DRExtract:Rate%' }),
      el('Name', 'Text', { label: 'Hi %IPResult:Customer:Name%', helpText: '%DRExtract:Note|1%' }),
      el('Fill', 'Set Values', { elementValueMap: { Total: '=Total + 1', 'IPResult:Flag': 'x', '$Root.Flag': 'y' } }),
      el('Shown', 'Text', { show: rule('IPResult:Status', '=', 'Open') })
    ]]], null, live);
    expect(found).toEqual([]);
  });

  it('reports a merge value in a rule that names nothing', () => {
    const found = lint([['Intro', [el('Kind', 'Text'), el('A', 'Text', { show: rule('Kind', '=', '%Missing%') })]]], null, live);
    expect(codes(found)).toEqual(['merge-field-missing']);
    expect(found[0].severity).toBe('note');
  });

  it('reports Set Errors targets that do not exist, as errors', () => {
    const found = lint([['Intro', [
      el('Age', 'Number'),
      el('Check', 'Set Errors', { elementErrorMap: { Age: 'Too low', Ghost: 'Nope' }, show: rule('Age', '<', 18) })
    ]]]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'error-target-missing', severity: 'error' });
    expect(found[0].message).toContain('Ghost');
  });

  it('never reports a Set Values target: creating a node is what a Set Values is for', () => {
    const found = lint([['Intro', [
      el('Age', 'Number'),
      el('Get', 'DataRaptor Extract Action'),
      el('Fill', 'Set Values', { elementValueMap: { Age: '1', Ghost: '2', 'Get:Total': '3', Seen: '4' } })
    ]]], null, { Seen: 4 });
    expect(found).toEqual([]);
  });

  it('never reports a qualified path: a later action or Set Values can fill it', () => {
    const found = lint([['Intro', [
      el('Shown', 'Text', { show: rule('IPResult:flag', '=', 'x') }),
      el('Lost', 'Text', { show: rule('Nowhere', '=', 'x') })
    ]]], null, live);
    expect(found.map((p) => p.message)).toEqual([expect.stringContaining('Nowhere')]);
  });

  it('lets a rule or label use a node a Set Values creates', () => {
    const found = lint([['Intro', [
      el('Fill', 'Set Values', { elementValueMap: { Brand: 'x' } }),
      el('A', 'Text', { label: 'Brand: %Brand%', show: rule('Brand', '=', 'x') })
    ]]], null, live);
    expect(found).toEqual([]);
  });

  it('reports duplicate names once per extra element, as an error', () => {
    const found = lint([['Intro', [el('Same', 'Text')]], ['Other', [el('Same', 'Number')]]]);
    expect(codes(found)).toEqual(['duplicate-name']);
    expect(found[0].severity).toBe('error');
    expect(found[0].message).toContain('Same');
  });

  it('reports %merge% fields in labels, help and formulas that name nothing', () => {
    const found = lint([['Intro', [
      el('Known', 'Text'),
      el('Title', 'Text', { label: 'Hello %Known% and %Ghost%', helpText: 'See %Phantom%' }),
      el('Calc', 'Formula', { expression: '%Known% + %Missing%' })
    ]]], null, live);
    expect(found.map((p) => p.message.match(/%\w+%/)[0]).sort()).toEqual(['%Ghost%', '%Missing%', '%Phantom%']);
    expect(new Set(codes(found))).toEqual(new Set(['merge-field-missing']));
  });

  it('reports an empty show group as a warning', () => {
    const found = lint([['Intro', [el('A', 'Text', { show: { group: { operator: 'AND', rules: [] } } })]]]);
    expect(codes(found)).toEqual(['empty-show']);
    expect(found[0].severity).toBe('warning');
  });

  it('reports custom labels missing from allCustomLabels, as errors', () => {
    const header = { bpLang: 'Multi-Language', allCustomLabels: { Present: 'Hello' } };
    const found = lint([['Intro', [el('A', 'Text', { label: 'Absent' })]]], header);
    expect(found.map((p) => p.code)).toContain('missing-label');
    const missing = found.find((p) => p.code === 'missing-label');
    expect(missing.message).toContain('Absent');
    expect(missing.severity).toBe('error');
  });

  it('points each problem at an element', () => {
    const elements = build([['Intro', [el('A', 'Text', { show: rule('Gone', '=', 'x') })]]]);
    const [problem] = lintDefinition(elements, null, live);
    expect(elements.find((e) => e.key === problem.elementKey).name).toBe('A');
  });
});

describe('countProblems', () => {
  it('counts errors and warnings, not the notes judged against the data', () => {
    const list = [
      { severity: 'error' }, { severity: 'note' }, { severity: 'warning' }, { severity: 'note' }
    ];
    expect(countProblems(list)).toBe(2);
    expect(countProblems([{ severity: 'note' }])).toBe(0);
    expect(countProblems([])).toBe(0);
  });
});

describe('sortProblems', () => {
  it('puts errors first and keeps script order within a severity', () => {
    const list = [
      { severity: 'warning', code: 'a' }, { severity: 'error', code: 'b' },
      { severity: 'warning', code: 'c' }, { severity: 'error', code: 'd' }
    ];
    expect(sortProblems(list).map((p) => p.code)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('puts notes last', () => {
    const list = [{ severity: 'note', code: 'n' }, { severity: 'warning', code: 'w' }, { severity: 'error', code: 'e' }];
    expect(sortProblems(list).map((p) => p.code)).toEqual(['e', 'w', 'n']);
  });
});

describe('createLintCache', () => {
  const script = (extra = []) => build([['Intro', [el('A', 'Text', { show: rule('Gone', '=', 'x') }), ...extra]]]);

  it('returns the same problems until the definition changes', () => {
    const lintOnce = createLintCache();
    const data = {};
    const first = lintOnce(script(), null, data);
    expect(first).toHaveLength(1);
    expect(lintOnce(script(), null, data)).toBe(first);

    const edited = lintOnce(script([el('B', 'Text', { show: rule('AlsoGone', '=', 'x') })]), null, data);
    expect(edited).not.toBe(first);
    expect(edited).toHaveLength(2);
  });

  it('lints again when the data changes, and keeps the array while the problems stay the same', () => {
    const lintOnce = createLintCache();
    const elements = script();
    const first = lintOnce(elements, null, {});
    expect(lintOnce(elements, null, { Other: 1 })).toBe(first);
    expect(lintOnce(elements, null, { Gone: 1 })).toEqual([]);
    expect(lintOnce(elements, null, undefined)).toEqual([]);
  });
});
