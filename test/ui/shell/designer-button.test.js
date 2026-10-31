'use strict';

/* Open in Designer: the top bar button that appears once the selected
 * script's Id is known, and opens its designer in a new tab. */

import { jest } from '@jest/globals';
import { bootData, pickScript } from '../support/data-page.js';
import { tick } from '../support/structure-page.js';
import { hostScan } from '../../../src/ui/targets.js';
import { buildActionRecord } from '../../../src/core/shared/actions-model.js';

const ID = 'a3B5g000000AbCdEAK'; // invented
const OTHER = 'a3B5g000000ZzZzEAK';
const ORG = 'https://acme.lightning.force.com';

const button = () => document.getElementById('open-designer');
const def = (extra = {}) => ({ bpType: 'demo', bpSubType: 'flow', bpLang: 'English', children: [], ...extra });

/* A captured call the way the Calls tab keeps it (the decoded
 * request under `action`), built by the real model. */
const call = (fields, url = `${ORG}/aura?r=1`) => buildActionRecord(
  1, 'aura',
  { wireId: '1;a', descriptor: '', apexClass: '', apexMethod: '', remoteClass: '', remoteMethod: '', namespace: '', input: {}, options: {}, ...fields },
  0, undefined, { url, startedAt: new Date(0), durationMs: 1, httpStatus: 200, requestId: 1, batchSize: 1 }
);

let opened;

beforeEach(() => {
  opened = jest.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  opened.mockRestore();
  document.body.innerHTML = '';
});

/* The stand-in page answers location.origin with the org's address. */
async function boot(hosts, origin = ORG) {
  const booted = await bootData({ hosts });
  const real = global.chrome.devtools.inspectedWindow.eval;
  global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
    const callback = typeof a === 'function' ? a : b;
    if (expression === 'location.origin') { callback(origin, undefined); return; }
    real(expression, a, b);
  };
  const { mountDesignerButton } = await import('../../../src/ui/designer-button.js');
  mountDesignerButton(button());
  pickScript(0);
  await tick();
  return booted;
}

describe('Open in Designer', () => {
  it('is hidden until a script with an Id is selected', async () => {
    await boot([{ id: 'a', tag: 'c-os', data: {}, def: def() }]);
    expect(button().hidden).toBe(true);
  });

  it('shows for a native script whose definition has an Id, and opens the builder in a new tab', async () => {
    await boot([{ id: 'a', tag: 'c-os', data: {}, def: def({ sOmniScriptId: ID }) }]);
    expect(button().hidden).toBe(false);
    expect(button().title).toBe('Open this OmniScript in the OmniStudio Builder (core OmniStudio, no managed package seen), in a new tab');
    expect(button().getAttribute('aria-label')).toBe(button().title);
    button().click();
    expect(opened).toHaveBeenCalledWith(`${ORG}/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id=${ID}`, '_blank', 'noopener');
  });

  it('knows a managed-package script by its host tag, and gives each press a new time stamp', async () => {
    await boot([{ id: 'a', tag: 'vlocity_ins-omni-script', data: {}, def: def({ omniProcessId: ID }) }]);
    expect(button().title).toContain('OmniScript Designer (managed package vlocity_ins, from a host element on this page)');
    button().click();
    const url = opened.mock.calls[0][0];
    expect(url).toMatch(new RegExp(`^${ORG}/lightning/cmp/vlocity_ins__OmniDesignerAuraWrapper\\?c__recordId=${ID}&uid=\\d+$`));
  });

  it('takes a wrapper host as managed once the captured calls name a package', async () => {
    const { Shared } = await boot([{ id: 'a', tag: 'c-wrapper', data: {}, def: def({ sOmniScriptId: ID }) }]);
    expect(button().title).toContain('OmniStudio Builder (core OmniStudio, no managed package seen)');
    Shared.setCalls(() => [call({ remoteClass: 'vlocity_ins.IntegrationProcedureService' })]);
    button().click(); // the calls arrived after the script was picked
    expect(opened.mock.calls[0][0]).toContain('/lightning/cmp/vlocity_ins__OmniDesignerAuraWrapper');
    expect(button().title).toContain('managed package vlocity_ins, from a call on this page');
    Shared.setCalls(() => []);
  });

  it('ignores calls that went to another org, and takes them back when the page is that org', async () => {
    const { Shared } = await boot([{ id: 'a', tag: 'c-wrapper', data: {}, def: def({ sOmniScriptId: ID }) }]);
    Shared.setCalls(() => [call({ remoteClass: 'vlocity_ins.IntegrationProcedureService' }, 'https://other.lightning.force.com/aura')]);
    button().click(); // calls kept by Preserve on reload, from another org
    expect(opened.mock.calls.pop()[0]).toContain('/builder_omnistudio/');
    Shared.setCalls(() => []);
  });

  it('works the flavour out again for a different origin instead of carrying it over', async () => {
    const { Shared, Targets } = await boot([{ id: 'a', tag: 'c-wrapper', data: {}, def: def({ sOmniScriptId: ID }) }]);
    Shared.setCalls(() => [call({ remoteClass: 'vlocity_ins.IntegrationProcedureService' })]);
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('vlocity_ins__OmniDesignerAuraWrapper'); // managed, and now remembered for acme
    const real = global.chrome.devtools.inspectedWindow.eval;
    global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
      const callback = typeof a === 'function' ? a : b;
      if (expression === 'location.origin') { callback('https://globex.lightning.force.com', undefined); return; }
      real(expression, a, b);
    };
    Targets.refresh(() => {});
    pickScript(0);
    await tick();
    button().click(); // the calls are acme's: nothing managed is known about globex
    expect(opened.mock.calls.pop()[0]).toBe(`https://globex.lightning.force.com/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id=${ID}`);
    Shared.setCalls(() => []);
  });

  it('opens the managed designer for every script of an org once any host shows the package', async () => {
    await boot([
      { id: 'a', tag: 'c-onboarding-wrapper', data: { A: 1 }, def: def({ bpType: 'one', sOmniScriptId: ID }) },
      { id: 'b', tag: 'vlocity_cmt-omni-script', data: { B: 1 }, def: def({ bpType: 'two', sOmniScriptId: OTHER }) }
    ]);
    const select = document.getElementById('target');
    const optionFor = (key) => [...select.options].find((option) => option.textContent.startsWith(key)).value;
    for (const [key, id] of [['one', ID], ['two', OTHER]]) {
      pickScript(Number(optionFor(key)));
      await tick();
      expect(button().hidden).toBe(false);
      button().click();
      expect(opened.mock.calls.pop()[0]).toMatch(new RegExp(`/lightning/cmp/vlocity_cmt__OmniDesignerAuraWrapper\\?c__recordId=${id}`));
      expect(button().title).toContain('managed package vlocity_cmt, from a host element on this page');
    }
  });

  it('keeps an org managed once a call showed it, even when no signal is left', async () => {
    const { Shared } = await boot([{ id: 'a', tag: 'c-wrapper', data: {}, def: def({ sOmniScriptId: ID }) }]);
    Shared.setCalls(() => [call({ namespace: 'vlocity_ins' })]);
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('vlocity_ins__OmniDesignerAuraWrapper');
    Shared.setCalls(() => []); // the list was cleared
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('vlocity_ins__OmniDesignerAuraWrapper');
    Shared.setCalls(() => []);
  });

  it('reads the omnistudio namespace as the managed package under an omnistudio- host', async () => {
    const { Shared } = await boot([{ id: 'a', tag: 'omnistudio-omni-script', data: {}, def: def({ sOmniScriptId: ID }) }]);
    expect(button().title).toContain('core OmniStudio');
    Shared.setCalls(() => [call({ remoteClass: 'omnistudio.IntegrationProcedureService' })]);
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('omnistudio__OmniDesignerAuraWrapper');
    Shared.setCalls(() => []);
  });

  it('follows the setting: core, or managed with a namespace, and says it was set', async () => {
    await boot([{ id: 'a', tag: 'vlocity_cmt-omni-script', data: {}, def: def({ sOmniScriptId: ID }) }]);
    const { Settings } = await import('../../../src/ui/settings.js'); // the instance the button uses
    Settings.set('designerMode', 'native');
    expect(button().title).toBe('Open this OmniScript in the OmniStudio Builder (core OmniStudio, set in Settings), in a new tab');
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('/builder_omnistudio/');
    Settings.set('designerMode', 'managed');
    Settings.set('designerNs', 'vlocity_ps');
    expect(button().title).toContain('managed package vlocity_ps, set in Settings');
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('vlocity_ps__OmniDesignerAuraWrapper');
  });

  it('keeps Designer (managed) managed when no namespace is set or seen, and says which one it used', async () => {
    await boot([{ id: 'a', tag: 'c-os', data: {}, def: def({ sOmniScriptId: ID }) }]);
    const { Settings } = await import('../../../src/ui/settings.js');
    Settings.set('designerMode', 'managed');
    Settings.set('designerNs', '');
    expect(button().title).toBe('Open this OmniScript in the OmniScript Designer (managed package omnistudio, set in Settings, with the default namespace), in a new tab');
    button().click();
    expect(opened.mock.calls.pop()[0]).toContain('omnistudio__OmniDesignerAuraWrapper');
  });

  it('finds the Id in an attribute of the host when the definition has none', async () => {
    const booted = await bootData({ hosts: [{ id: 'a', tag: 'c-os', data: { A: 1 } }] });
    document.getElementById('a').setAttribute('data-omni-id', ID);
    booted.Targets.refresh(() => {});
    await tick();
    const real = global.chrome.devtools.inspectedWindow.eval;
    global.chrome.devtools.inspectedWindow.eval = (expression, a, b) => {
      if (expression === 'location.origin') { (typeof a === 'function' ? a : b)(ORG, undefined); return; }
      real(expression, a, b);
    };
    const { mountDesignerButton } = await import('../../../src/ui/designer-button.js');
    mountDesignerButton(button());
    pickScript(0);
    await tick();
    expect(button().hidden).toBe(false);
    button().click();
    expect(opened.mock.calls[0][0]).toContain(`id=${ID}`);
  });

  it('stays hidden on a page that is not an org\'s own', async () => {
    await boot([{ id: 'a', tag: 'c-os', data: {}, def: def({ sOmniScriptId: ID }) }], 'https://acme.my.site.com');
    expect(button().hidden).toBe(true);
    button().click();
    expect(opened).not.toHaveBeenCalled();
  });

  it('follows the selection from one script to another', async () => {
    await boot([
      { id: 'a', tag: 'c-os', data: { A: 1 }, def: def({ bpType: 'one', sOmniScriptId: ID }) },
      { id: 'b', tag: 'c-os', data: { B: 1 }, def: def({ bpType: 'two' }) },
      { id: 'c', tag: 'c-os', data: { C: 1 }, def: def({ bpType: 'three', sOmniScriptId: OTHER }) }
    ]);
    const select = document.getElementById('target');
    const optionFor = (key) => [...select.options].find((option) => option.textContent.startsWith(key)).value;

    expect(button().hidden).toBe(false);
    pickScript(Number(optionFor('two')));
    await tick();
    expect(button().hidden).toBe(true);
    pickScript(Number(optionFor('three')));
    await tick();
    expect(button().hidden).toBe(false);
    button().click();
    expect(opened.mock.calls[0][0]).toContain(OTHER);
  });

  it('is an icon button with a label, named in the help', async () => {
    await boot([{ id: 'a', tag: 'c-os', data: {}, def: def({ sOmniScriptId: ID }) }]);
    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('data-help')).toBe('Open in Designer');
    expect(button().textContent).toContain('Open in Designer');
  });
});

describe('hostScan and the designer link', () => {
  it('hands over the host\'s tag, class and only the two Id attributes', () => {
    const node = document.createElement('vlocity_cmt-omni-script');
    node.className = 'omni big';
    node.jsonDataStr = '{"A":1}';
    node.setAttribute('data-omni-id', ID);
    node.setAttribute('omniscript-id', 'x'.repeat(100)); // too long to be an Id
    node.setAttribute('data-secret', 'keep out');
    document.body.appendChild(node);
    const result = hostScan('jsonDataStr', 'jsonDef');
    expect(result.hosts[0]).toMatchObject({ tag: 'vlocity_cmt-omni-script', cls: 'omni big', attrs: { 'data-omni-id': ID } });
    expect(JSON.stringify(result.hosts[0])).not.toContain('keep out');
    expect(Object.keys(result.hosts[0].attrs)).toEqual(['data-omni-id']);
  });
});
