'use strict';

import {
  scriptIdFrom, flavourOf, callsForOrigin, flavourFor, flavourForOrigin, namespacedKeysOf, resolveFlavour, normalizeNamespace, namespaceSuggestions, namespaceFromCalls, namespaceFromKeys, designerOrigin, fillTemplate, designerLinkFor, designerTitle,
  BUILTIN_TEMPLATES
} from '../../../src/core/shared/designer-link.js';
import { buildActionRecord } from '../../../src/core/shared/actions-model.js';

const ID = 'a3B5g000000AbCdEAK'; // an invented 18-character Id
const ID15 = 'a3B5g000000AbCd';
const OTHER = 'a3B5g000000ZzZzEAK';

/* A captured call as the Calls tab keeps it: the decoded request sits
 * under `action`, the address of the request beside it. Built by the real
 * model, so a test cannot pass on a shape the panel never produces. */
const call = (fields, url = 'https://acme.lightning.force.com/aura?r=1') => buildActionRecord(
  1, 'aura',
  { wireId: '1;a', descriptor: '', apexClass: '', apexMethod: '', remoteClass: '', remoteMethod: '', namespace: '', input: {}, options: {}, ...fields },
  0, undefined, { url, startedAt: new Date(0), durationMs: 1, httpStatus: 200, requestId: 1, batchSize: 1 }
);

describe('scriptIdFrom', () => {
  it('reads each of the keys from the definition root', () => {
    ['sOmniScriptId', 'omniProcessId', 'OmniProcessId', 'omniScriptId', 'Id'].forEach((key) => {
      expect(scriptIdFrom({ [key]: ID }, null, null)).toBe(ID);
    });
  });

  it('prefers the keys in order, and the definition over the header over the host', () => {
    expect(scriptIdFrom({ Id: OTHER, sOmniScriptId: ID })).toBe(ID);
    expect(scriptIdFrom({ omniScriptId: OTHER }, { sOmniScriptId: ID })).toBe(OTHER);
    expect(scriptIdFrom({}, { OmniProcessId: ID }, { 'data-omni-id': OTHER })).toBe(ID);
    expect(scriptIdFrom({}, {}, { 'omniscript-id': ID })).toBe(ID);
    expect(scriptIdFrom(null, null, { 'data-omni-id': ID, 'omniscript-id': OTHER })).toBe(ID);
  });

  it('accepts a 15-character Id and trims it', () => {
    expect(scriptIdFrom({ Id: ` ${ID15} ` })).toBe(ID15);
  });

  it('skips values that are not record Ids and goes on to the next source', () => {
    expect(scriptIdFrom({ sOmniScriptId: 'not an id', Id: 12345 }, { Id: ID })).toBe(ID);
    expect(scriptIdFrom({ Id: 'short' }, null, { 'data-omni-id': 'x' })).toBe('');
  });

  it('is empty without any source, and copes with junk', () => {
    expect(scriptIdFrom()).toBe('');
    expect(scriptIdFrom('text', [], 5)).toBe('');
    expect(scriptIdFrom({ Id: null }, { Id: undefined }, {})).toBe('');
  });
});

describe('flavourOf', () => {
  it('is managed when the tag starts with a managed namespace', () => {
    expect(flavourOf('vlocity_cmt-omni-script', '')).toEqual({ flavour: 'managed', namespace: 'vlocity_cmt' });
    expect(flavourOf('VLOCITY_INS-omniscript', '')).toEqual({ flavour: 'managed', namespace: 'vlocity_ins' });
    expect(flavourOf('vlocity_ps-omniscript', '')).toEqual({ flavour: 'managed', namespace: 'vlocity_ps' });
  });

  it('is managed when a class starts with one', () => {
    expect(flavourOf('div', 'x vlocity_ins-script')).toEqual({ flavour: 'managed', namespace: 'vlocity_ins' });
  });

  it('is native otherwise', () => {
    expect(flavourOf('c-os', 'omni')).toEqual({ flavour: 'native', namespace: '' });
    expect(flavourOf('omnistudio-omni-script', '')).toEqual({ flavour: 'native', namespace: '' });
    expect(flavourOf(undefined, undefined)).toEqual({ flavour: 'native', namespace: '' });
  });
});

describe('hosts', () => {
  it('maps a Visualforce page, even one of the org\'s own, to the Lightning origin', () => {
    expect(designerOrigin('https://acme--c.vf.force.com')).toBe('https://acme.lightning.force.com');
    expect(designerOrigin('https://acme--sb--vlocity-ins.sandbox.vf.force.com')).toBe('https://acme--sb.sandbox.lightning.force.com');
  });

  it('takes the org origin from the page, even a Visualforce page, and refuses what is no org', () => {
    expect(designerOrigin('https://acme.lightning.force.com')).toBe('https://acme.lightning.force.com');
    expect(designerOrigin('https://acme--vlocity-ins.vf.force.com')).toBe('https://acme.lightning.force.com');
    expect(designerOrigin('https://acme.my.salesforce.com')).toBe('https://acme.my.salesforce.com');
    expect(designerOrigin('https://acme.my.site.com')).toBeNull();
    expect(designerOrigin('http://acme.lightning.force.com')).toBeNull();
    expect(designerOrigin('about:blank')).toBeNull();
    expect(designerOrigin(undefined)).toBeNull();
  });
});

describe('fillTemplate', () => {
  it('escapes the Id and puts the structural placeholders in raw', () => {
    expect(fillTemplate('/x/{ns}__W?id={id}&uid={now}&h={vfhost}', { id: 'a b', namespace: 'vlocity_ins', uiHost: 'd.lightning.force.com', now: 7 }))
      .toBe('/x/vlocity_ins__W?id=a%20b&uid=7&h=d--vlocity-ins.vf.force.com');
  });
});

describe('designerLinkFor', () => {
  const page = 'https://acme.lightning.force.com';

  it('links a native script to the OmniStudio Builder', () => {
    const link = designerLinkFor({ definition: { sOmniScriptId: ID }, host: { tag: 'c-os', cls: '' }, pageOrigin: page, now: 1 });
    expect(link).toEqual({
      url: `https://acme.lightning.force.com/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id=${ID}`,
      id: ID, flavour: 'native', namespace: '', designer: 'OmniStudio Builder', why: 'no managed package seen'
    });
  });

  it('links a managed script through the package\'s wrapper', () => {
    const link = designerLinkFor({
      definition: {}, header: { Id: ID }, host: { tag: 'vlocity_ins-omni-script', cls: '' },
      pageOrigin: 'https://acme--vlocity-ins.vf.force.com', now: 99
    });
    expect(link.url).toBe(`https://acme.lightning.force.com/lightning/cmp/vlocity_ins__OmniDesignerAuraWrapper?c__recordId=${ID}&uid=99`);
    expect(link.flavour).toBe('managed');
    expect(link.designer).toBe('OmniScript Designer');
  });

  it('finds the Id in the host attributes', () => {
    const link = designerLinkFor({ definition: null, host: { tag: 'c-os', attrs: { 'data-omni-id': ID } }, pageOrigin: page });
    expect(link.id).toBe(ID);
  });

  it('is null without an Id or off an org\'s own page', () => {
    expect(designerLinkFor({ definition: {}, host: { tag: 'c-os' }, pageOrigin: page })).toBeNull();
    expect(designerLinkFor({ definition: { Id: ID }, host: { tag: 'c-os' }, pageOrigin: 'https://acme.my.site.com' })).toBeNull();
    expect(designerLinkFor({ definition: { Id: ID }, pageOrigin: undefined })).toBeNull();
  });

  it('names the designer and the flavour in the tooltip', () => {
    const native = designerLinkFor({ definition: { Id: ID }, host: { tag: 'c-os' }, pageOrigin: page });
    expect(designerTitle(native)).toBe('Open this OmniScript in the OmniStudio Builder (core OmniStudio, no managed package seen), in a new tab');
    const managed = designerLinkFor({ definition: { Id: ID }, host: { tag: 'vlocity_cmt-os' }, pageOrigin: page });
    expect(designerTitle(managed)).toBe('Open this OmniScript in the OmniScript Designer (managed package vlocity_cmt, from a host element on this page), in a new tab');
  });

  it('keeps only OmniScript routes of the Finder\'s templates', () => {
    expect(Object.keys(BUILTIN_TEMPLATES.native)).toEqual(['osTemplate']);
    expect(Object.keys(BUILTIN_TEMPLATES.managed)).toEqual(['osTemplate']);
  });
});

describe('namespaceFromCalls', () => {
  it('reads the namespace of the calls, from the field or the class prefix', () => {
    expect(namespaceFromCalls([call({ namespace: 'vlocity_ins' })])).toBe('vlocity_ins');
    expect(namespaceFromCalls([call({ remoteClass: 'vlocity_cmt.IntegrationProcedureService' })])).toBe('vlocity_cmt');
    expect(namespaceFromCalls([call({ apexClass: 'vlocity_ps.DefaultOmniScript' })])).toBe('vlocity_ps');
    expect(namespaceFromCalls([call({ apexClass: 'omnistudio.DefaultOmniScript' }), call({ namespace: 'omnistudio' })])).toBe('');
    expect(namespaceFromCalls([call({ namespace: 'VLOCITY_PS' })])).toBe('vlocity_ps');
  });

  it('takes the namespace most calls name', () => {
    expect(namespaceFromCalls([
      call({ namespace: 'vlocity_ins' }), call({ remoteClass: 'vlocity_cmt.X' }), call({ remoteClass: 'vlocity_cmt.Y' })
    ])).toBe('vlocity_cmt');
  });

  it('ignores classes of the org and anything that is not a known package', () => {
    expect(namespaceFromCalls([call({ remoteClass: 'MyService.run' }), call({ namespace: 'c' }), call({ apexClass: 'noDot' }), null, 7])).toBe('');
    expect(namespaceFromCalls(undefined)).toBe('');
    expect(namespaceFromCalls([])).toBe('');
  });
});

describe('namespaceFromCalls: the shape the panel really keeps', () => {
  it('a record built by the model names its package under action', () => {
    const record = call({ remoteClass: 'vlocity_ins.IntegrationProcedureService', remoteMethod: 'Demo_Flow' });
    expect(record.namespace).toBeUndefined(); // nothing on the record itself
    expect(record.action.remoteClass).toBe('vlocity_ins.IntegrationProcedureService');
    expect(namespaceFromCalls([record])).toBe('vlocity_ins');
  });

  it('still reads a bare object with the same fields', () => {
    expect(namespaceFromCalls([{ remoteClass: 'vlocity_cmt.IntegrationProcedureService' }])).toBe('vlocity_cmt');
  });
});

describe('callsForOrigin', () => {
  const here = 'https://acme.lightning.force.com';
  const mine = call({ namespace: 'vlocity_ins' }, 'https://acme.lightning.force.com/aura?r=2');
  const foreign = call({ namespace: 'vlocity_cmt' }, 'https://other.lightning.force.com/aura?r=3');

  it('drops the calls that went to another org', () => {
    expect(callsForOrigin([mine, foreign], here)).toEqual([mine]);
    expect(namespaceFromCalls(callsForOrigin([foreign, foreign, mine], here))).toBe('vlocity_ins');
  });

  it('counts another host of the same org, including its Visualforce and classic hosts', () => {
    const classic = call({ namespace: 'vlocity_ps' }, 'https://acme.my.salesforce.com/apexremote');
    const vf = call({ namespace: 'vlocity_ps' }, 'https://acme--vlocity-ps.vf.force.com/apexremote');
    expect(callsForOrigin([classic, vf], here)).toEqual([classic, vf]);
    expect(callsForOrigin([classic], 'https://acme--vlocity-ps.vf.force.com')).toEqual([classic]);
    expect(callsForOrigin([foreign], 'https://acme--vlocity-ps.vf.force.com')).toEqual([]);
  });

  it('keeps a call whose address cannot be told, and every call when the page is not an org\'s', () => {
    const bare = { action: { namespace: 'vlocity_ins' } };
    const relative = call({ namespace: 'vlocity_ins' }, '/aura?r=1');
    expect(callsForOrigin([bare, relative], here)).toEqual([bare, relative]);
    expect(callsForOrigin([foreign], 'https://shop.example.com')).toEqual([foreign]);
    expect(callsForOrigin([foreign], '')).toEqual([foreign]);
    expect(callsForOrigin(undefined, here)).toEqual([]);
  });

  it('keeps a sandbox\'s label whole', () => {
    const sandbox = 'https://acme--dev.sandbox.lightning.force.com';
    const own = call({ namespace: 'vlocity_ins' }, 'https://acme--dev.sandbox.my.salesforce.com/aura');
    const prod = call({ namespace: 'vlocity_cmt' }, 'https://acme.lightning.force.com/aura');
    expect(callsForOrigin([own, prod], sandbox)).toEqual([own]);
  });
});

describe('designerLinkFor: calls of another org say nothing', () => {
  it('does not take this org for managed from a call that went elsewhere', () => {
    const link = designerLinkFor({
      definition: { sOmniScriptId: ID }, host: { tag: 'c-wrapper' }, pageOrigin: 'https://acme.lightning.force.com',
      calls: [call({ remoteClass: 'vlocity_cmt.IntegrationProcedureService' }, 'https://other.lightning.force.com/aura')], now: 5
    });
    expect(link.flavour).toBe('native');
  });

  it('takes it from a call that went to this org', () => {
    const link = designerLinkFor({
      definition: { sOmniScriptId: ID }, host: { tag: 'c-wrapper' }, pageOrigin: 'https://acme.lightning.force.com',
      calls: [call({ remoteClass: 'vlocity_cmt.IntegrationProcedureService' })], now: 5
    });
    expect(link).toMatchObject({ flavour: 'managed', namespace: 'vlocity_cmt', why: 'from a call on this page' });
  });
});

describe('Designer (managed) with nothing typed and nothing seen', () => {
  it('opens the managed designer on the default namespace and says so', () => {
    const link = designerLinkFor({
      definition: { sOmniScriptId: ID }, host: { tag: 'c-wrapper' }, pageOrigin: 'https://acme.lightning.force.com',
      setting: { mode: 'managed', namespace: '' }, now: 7
    });
    expect(link).toMatchObject({ flavour: 'managed', namespace: 'omnistudio', designer: 'OmniScript Designer' });
    expect(link.url).toBe(`https://acme.lightning.force.com/lightning/cmp/omnistudio__OmniDesignerAuraWrapper?c__recordId=${ID}&uid=7`);
    expect(designerTitle(link)).toBe('Open this OmniScript in the OmniScript Designer (managed package omnistudio, set in Settings, with the default namespace), in a new tab');
  });

  it('prefers a typed namespace, then a seen one, over the default', () => {
    expect(flavourForOrigin({ hosts: [{ tag: 'c-os' }], setting: { mode: 'managed', namespace: 'my_ns' } }).namespace).toBe('my_ns');
    expect(flavourForOrigin({ hosts: [{ tag: 'vlocity_ps-os' }], setting: { mode: 'managed' } })).toMatchObject({ namespace: 'vlocity_ps', why: 'set in Settings' });
  });
});

describe('namespaceFromKeys', () => {
  it('finds a package prefix in the top-level field names', () => {
    expect(namespaceFromKeys({ vlocity_ins__OmniScriptId__c: ID })).toBe('vlocity_ins');
    expect(namespaceFromKeys({ Name: 'x', vlocity_cmt__Version__c: 1 })).toBe('vlocity_cmt');
    expect(namespaceFromKeys({ Name: 'x', omnistudio__Version__c: 1 })).toBe('');
  });

  it('is empty for a native record or other prefixes', () => {
    expect(namespaceFromKeys({ sOmniScriptId: ID, Custom__c: 1, __x: 2 })).toBe('');
    expect(namespaceFromKeys(null)).toBe('');
    expect(namespaceFromKeys([1])).toBe('');
  });
});

describe('flavour from more than the host element', () => {
  const wrapper = { tag: 'c-wrapper', cls: 'host' };

  it('takes a wrapper host without a vlocity prefix as managed when the calls say so', () => {
    expect(flavourFor(wrapper, {}, {}, [call({ remoteClass: 'vlocity_ins.IntegrationProcedureService' })]))
      .toEqual({ flavour: 'managed', namespace: 'vlocity_ins' });
  });

  it('takes it as managed when the definition\'s keys carry the namespace', () => {
    expect(flavourFor(wrapper, { vlocity_cmt__OmniScriptId__c: ID }, null, [])).toEqual({ flavour: 'managed', namespace: 'vlocity_cmt' });
    expect(flavourFor(wrapper, {}, { vlocity_ps__Version__c: 1 }, [])).toEqual({ flavour: 'managed', namespace: 'vlocity_ps' });
  });

  it('keeps the host element\'s answer when it already names a package', () => {
    expect(flavourFor({ tag: 'vlocity_ins-os' }, {}, {}, [call({ namespace: 'vlocity_cmt' })])).toEqual({ flavour: 'managed', namespace: 'vlocity_ins' });
  });

  it('stays native without any signal', () => {
    expect(flavourFor(wrapper, {}, {}, [call({ remoteClass: 'MyService.go' })])).toEqual({ flavour: 'native', namespace: '' });
    expect(flavourFor(undefined)).toEqual({ flavour: 'native', namespace: '' });
  });

  it('recognises the vlocity_hins package by its tag', () => {
    expect(flavourOf('vlocity_hins-omni-script', '')).toEqual({ flavour: 'managed', namespace: 'vlocity_hins' });
  });

  it('builds the managed link for a wrapper host from the calls', () => {
    const link = designerLinkFor({
      definition: { sOmniScriptId: ID }, host: wrapper, pageOrigin: 'https://acme.lightning.force.com',
      calls: [call({ remoteClass: 'vlocity_cmt.IntegrationProcedureService' })], now: 5
    });
    expect(link.url).toBe(`https://acme.lightning.force.com/lightning/cmp/vlocity_cmt__OmniDesignerAuraWrapper?c__recordId=${ID}&uid=5`);
    expect(link.flavour).toBe('managed');
  });

  it('keeps a core org on the native builder once its omnistudio calls are captured', () => {
    const link = designerLinkFor({
      definition: { sOmniScriptId: ID }, host: wrapper, pageOrigin: 'https://acme.lightning.force.com',
      calls: [call({ remoteClass: 'omnistudio.IntegrationProcedureService' }), call({ namespace: 'omnistudio' })], now: 5
    });
    expect(link.flavour).toBe('native');
    expect(link.url).toContain('/builder_omnistudio/omnistudioBuilder.app');
  });
});

describe('the managed OmniStudio package (omnistudio namespace)', () => {
  const page = 'https://acme.lightning.force.com';
  const calls = [call({ remoteClass: 'omnistudio.IntegrationProcedureService' })];
  const MANAGED = { flavour: 'managed', namespace: 'omnistudio' };

  it('is managed when omnistudio calls meet an omnistudio- host tag', () => {
    expect(resolveFlavour({ host: { tag: 'omnistudio-omni-script' }, calls })).toMatchObject(MANAGED);
    expect(resolveFlavour({ host: { tag: 'omnistudio-omni-script' }, calls }).why).toBe('from the omnistudio namespace and the host element');
  });

  it('is managed when omnistudio calls meet an omnistudio__ Lightning app in the address', () => {
    const result = resolveFlavour({ host: { tag: 'c-os' }, calls, pagePath: '/lightning/n/omnistudio__OmniStudioHome' });
    expect(result).toMatchObject(MANAGED);
    expect(result.why).toBe('from the omnistudio namespace and the page address');
  });

  it('reads the omnistudio namespace in the definition\'s keys too', () => {
    expect(resolveFlavour({ host: { tag: 'omnistudio-os' }, definition: { omnistudio__Version__c: 1 } })).toMatchObject(MANAGED);
  });

  it('stays core when only one of the two signals is there', () => {
    expect(resolveFlavour({ host: { tag: 'c-os' }, calls }).flavour).toBe('native');
    expect(resolveFlavour({ host: { tag: 'runtime_omnistudio-omni-script' }, calls }).flavour).toBe('native');
    expect(resolveFlavour({ host: { tag: 'omnistudio-omni-script' }, calls: [] }).flavour).toBe('native');
    expect(resolveFlavour({ host: { tag: 'c-os' }, pagePath: '/lightning/n/omnistudio__Home' }).flavour).toBe('native');
    expect(resolveFlavour({ host: { tag: 'c-os' }, calls, pagePath: '/lightning/n/Home' }).flavour).toBe('native');
  });

  it('lets a vlocity_* signal win over omnistudio ones', () => {
    expect(resolveFlavour({ host: { tag: 'omnistudio-os' }, calls: [call({ namespace: 'vlocity_ins' }), ...calls, ...calls] }))
      .toMatchObject({ flavour: 'managed', namespace: 'vlocity_ins', why: 'from a call on this page' });
  });

  it('builds the managed wrapper link on the omnistudio namespace', () => {
    const link = designerLinkFor({ definition: { sOmniScriptId: ID }, host: { tag: 'omnistudio-omni-script' }, pageOrigin: page, calls, now: 3 });
    expect(link.url).toBe(`${page}/lightning/cmp/omnistudio__OmniDesignerAuraWrapper?c__recordId=${ID}&uid=3`);
    expect(designerTitle(link)).toBe('Open this OmniScript in the OmniScript Designer (managed package omnistudio, from the omnistudio namespace and the host element), in a new tab');
  });
});

describe('the designer setting', () => {
  const page = 'https://acme.lightning.force.com';
  const host = { tag: 'vlocity_cmt-omni-script' };

  it('native overrides every signal', () => {
    const result = resolveFlavour({ host, setting: { mode: 'native', namespace: 'vlocity_ins' } });
    expect(result).toEqual({ flavour: 'native', namespace: '', why: 'set in Settings' });
  });

  it('managed with a namespace uses that namespace, whatever was seen', () => {
    expect(resolveFlavour({ host, setting: { mode: 'managed', namespace: 'vlocity_ins' } }))
      .toEqual({ flavour: 'managed', namespace: 'vlocity_ins', why: 'set in Settings' });
    expect(resolveFlavour({ host: { tag: 'c-os' }, setting: { mode: 'managed', namespace: ' My_Ns ' } }))
      .toEqual({ flavour: 'managed', namespace: 'my_ns', why: 'set in Settings' });
  });

  it('managed without a namespace takes the one seen, else omnistudio, and never the core Builder', () => {
    expect(resolveFlavour({ host, setting: { mode: 'managed', namespace: '' } }))
      .toEqual({ flavour: 'managed', namespace: 'vlocity_cmt', why: 'set in Settings' });
    expect(resolveFlavour({ host: { tag: 'c-os' }, calls: [call({ namespace: 'omnistudio' })], setting: { mode: 'managed' } }))
      .toMatchObject({ flavour: 'managed', namespace: 'omnistudio' });
    expect(resolveFlavour({ host: { tag: 'c-os' }, setting: { mode: 'managed' } }))
      .toEqual({ flavour: 'managed', namespace: 'omnistudio', why: 'set in Settings, with the default namespace' });
  });

  it('an unknown mode falls back to Auto, and a bad namespace to none (so the default one)', () => {
    expect(resolveFlavour({ host, setting: { mode: 'sideways' } }).why).toBe('from a host element on this page');
    expect(resolveFlavour({ host: { tag: 'c-os' }, setting: { mode: 'managed', namespace: 'x/../y' } }))
      .toMatchObject({ flavour: 'managed', namespace: 'omnistudio' });
    expect(resolveFlavour({ host, setting: null }).flavour).toBe('managed');
  });

  it('changes the link and the tooltip', () => {
    const link = designerLinkFor({ definition: { Id: ID }, host, pageOrigin: page, setting: { mode: 'native' }, now: 1 });
    expect(link.url).toContain('/builder_omnistudio/');
    expect(designerTitle(link)).toBe('Open this OmniScript in the OmniStudio Builder (core OmniStudio, set in Settings), in a new tab');
    const managed = designerLinkFor({ definition: { Id: ID }, host: { tag: 'c-os' }, pageOrigin: page, setting: { mode: 'managed', namespace: 'vlocity_ps' }, now: 1 });
    expect(managed.url).toContain('/lightning/cmp/vlocity_ps__OmniDesignerAuraWrapper');
    expect(designerTitle(managed)).toContain('(managed package vlocity_ps, set in Settings)');
  });
});

describe('normalizeNamespace and the suggestions', () => {
  it('accepts only what a namespace can be', () => {
    expect(normalizeNamespace('  VLOCITY_INS ')).toBe('vlocity_ins');
    expect(normalizeNamespace('acme')).toBe('acme');
    ['', '1abc', 'a b', 'a/b', 'a__b', 'trailing_', 'waytoolongnamespace1', null, undefined, 5].forEach((bad) => {
      expect(normalizeNamespace(bad)).toBe('');
    });
  });

  it('lists the seen namespaces first, then the usual ones, once each', () => {
    expect(namespaceSuggestions({ hosts: [{ tag: 'c-wrapper' }, { tag: 'vlocity_ins-os' }], calls: [call({ namespace: 'omnistudio' })] }))
      .toEqual(['vlocity_ins', 'omnistudio', 'vlocity_cmt', 'vlocity_ps']);
    expect(namespaceSuggestions()).toEqual(['vlocity_cmt', 'vlocity_ins', 'vlocity_ps', 'omnistudio']);
  });
});

describe('flavourForOrigin: the org decides, not one script', () => {
  const wrapped = { tag: 'c-onboarding-wrapper', cls: '' };
  const managedHost = { tag: 'vlocity_cmt-omni-script', cls: '' };
  const page = 'https://acme.lightning.force.com';

  it('takes every script as managed when any host on the page is', () => {
    const result = flavourForOrigin({ hosts: [wrapped, managedHost] });
    expect(result).toEqual({ flavour: 'managed', namespace: 'vlocity_cmt', why: 'from a host element on this page' });
    expect(flavourForOrigin({ hosts: [managedHost, wrapped] })).toEqual(result);
  });

  it('is core when no host, definition or call names a package', () => {
    expect(flavourForOrigin({ hosts: [wrapped, { tag: 'c-other' }], calls: [call({ remoteClass: 'MyService.go' })] }))
      .toEqual({ flavour: 'native', namespace: '', why: 'no managed package seen' });
    expect(flavourForOrigin()).toMatchObject({ flavour: 'native' });
  });

  it('reads a definition of another script on the page, then a call', () => {
    expect(flavourForOrigin({ hosts: [wrapped], definitions: [{}, namespacedKeysOf({ vlocity_ins__OmniScriptId__c: ID, Name: 'x' })] }))
      .toEqual({ flavour: 'managed', namespace: 'vlocity_ins', why: 'from a definition on this page' });
    expect(flavourForOrigin({ hosts: [wrapped], calls: [call({ namespace: 'vlocity_ps' })] }))
      .toEqual({ flavour: 'managed', namespace: 'vlocity_ps', why: 'from a call on this page' });
  });

  it('never flips back to core once managed was seen, unless the setting says so', () => {
    const previous = { flavour: 'managed', namespace: 'vlocity_cmt', why: 'from a call on this page' };
    expect(flavourForOrigin({ hosts: [wrapped], previous })).toEqual(previous);
    expect(flavourForOrigin({ hosts: [wrapped], previous, setting: { mode: 'native' } }).flavour).toBe('native');
    expect(flavourForOrigin({ hosts: [wrapped], previous, setting: { mode: 'managed', namespace: 'vlocity_ins' } }))
      .toMatchObject({ namespace: 'vlocity_ins' });
  });

  it('a new signal beats the remembered one', () => {
    const previous = { flavour: 'managed', namespace: 'vlocity_cmt', why: 'from a call on this page' };
    expect(flavourForOrigin({ hosts: [{ tag: 'vlocity_ins-os' }], previous }).namespace).toBe('vlocity_ins');
  });

  it('counts an omnistudio- host anywhere on the page together with omnistudio calls', () => {
    const calls = [call({ namespace: 'omnistudio' })];
    expect(flavourForOrigin({ hosts: [wrapped, { tag: 'omnistudio-omni-script' }], calls }))
      .toMatchObject({ flavour: 'managed', namespace: 'omnistudio' });
    expect(flavourForOrigin({ hosts: [wrapped], calls, pagePath: '/lightning/n/omnistudio__Home' }).flavour).toBe('managed');
    expect(flavourForOrigin({ hosts: [wrapped], calls }).flavour).toBe('native');
  });

  it('namespacedKeysOf keeps only the prefixed field names', () => {
    expect(namespacedKeysOf({ Name: 'x', vlocity_cmt__A__c: 'secret', bpType: 'y' })).toEqual({ vlocity_cmt__A__c: 1 });
    expect(namespacedKeysOf(null)).toEqual({});
  });

  it('gives both scripts the managed link, whatever their own host looks like', () => {
    const base = { definition: { sOmniScriptId: ID }, pageOrigin: page, hosts: [wrapped, managedHost], now: 1 };
    const fromWrapper = designerLinkFor({ ...base, host: wrapped });
    const fromManaged = designerLinkFor({ ...base, host: managedHost });
    expect(fromWrapper.url).toContain('/lightning/cmp/vlocity_cmt__OmniDesignerAuraWrapper');
    expect(fromManaged.url).toBe(fromWrapper.url);
    expect(designerTitle(fromWrapper)).toContain('(managed package vlocity_cmt, from a host element on this page)');
  });
});
