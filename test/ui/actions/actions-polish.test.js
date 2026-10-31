'use strict';

/* Calls polish in the DOM: double-encoded sections, Data changes from
 * any tab, the tree menu, the dump. The decisions behind them are tested in
 * test/core/actions-*.test.js. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls polish', () => {
  let RemoteActions;
  let Shared;
  let Mask;
  let listeners;
  let copied;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
    });
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    ({ Mask } = await import('../../../src/ui/mask-setting.js'));
    ({ Shared } = await import('../../../src/ui/shared.js'));
    Mask.mount(document.getElementById('mask-values'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  afterEach(() => { delete navigator.clipboard; });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const button = (label) => [...detail().querySelectorAll('button')].find((b) => b.textContent.includes(label));
  const tab = (name) => [...detail().querySelectorAll('.seg-btn')].find((b) => b.textContent === name);

  describe('a section that was encoded twice', () => {
    const nested = { level1: { level2: { level3: 1 } } };
    const twice = JSON.stringify(JSON.stringify(nested));

    it('is a tree whose Expand all and Collapse all work', () => {
      fire(auraNetworkEntry({ options: twice, input: twice }));
      rows()[0].click();
      tab('Options').click();
      expect(button('Expand all').disabled).toBe(false);
      expect(button('Collapse all').disabled).toBe(false);
      expect(detail().textContent).toContain('level1');
      expect(detail().textContent).not.toContain('\\"level1\\"');

      button('Collapse all').click();
      expect(detail().textContent).not.toContain('level3');
      button('Expand all').click();
      expect(detail().textContent).toContain('level3');
    });

    it('lets a double-encoded input be expanded too', () => {
      fire(auraNetworkEntry({ input: twice }));
      rows()[0].click();
      expect(button('Expand all').disabled).toBe(false);
    });
  });

  describe('a section that is text', () => {
    it('says so and shows the text, instead of disabled buttons alone', () => {
      fire(auraNetworkEntry({ options: 'just words' }));
      rows()[0].click();
      tab('Options').click();
      expect(detail().querySelector('.detail-body').textContent).toContain('This section is text, not JSON');
      expect(detail().querySelector('.detail-body').textContent).toContain('just words');
      expect(button('Expand all')).toBeUndefined();
      expect(button('Collapse all')).toBeUndefined();
    });

    it('masks the text while Mask values is on', () => {
      fire(auraNetworkEntry({ options: 'secret words' }));
      rows()[0].click();
      tab('Options').click();
      const box = document.getElementById('mask-values');
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      expect(detail().querySelector('.detail-body').textContent).not.toContain('secret words');
    });
  });

  describe('right-click menu on the detail trees', () => {
    const input = JSON.stringify({ Account: { Name: 'Ada', Address: { City: 'Paris' } } });
    const menu = () => document.querySelector('.ctx-menu');
    const item = (label) => [...menu().querySelectorAll('.ctx-item')].find((b) => b.textContent === label);
    const rowOf = (text) => [...detail().querySelectorAll('[role="treeitem"], .tree-row, .row')]
      .find((row) => row.textContent.includes(text));

    function rightClick(text) {
      rowOf(text).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    }

    beforeEach(() => {
      fire(auraNetworkEntry({ input }));
      rows()[0].click();
      button('Expand all').click();
    });

    afterEach(() => { document.querySelectorAll('.ctx-menu').forEach((node) => node.remove()); });

    it('copies the value of the row', async () => {
      rightClick('Address');
      expect(menu()).not.toBeNull();
      item('Copy value').click();
      await Promise.resolve();
      expect(JSON.parse(copied[0])).toEqual({ City: 'Paris' });
    });

    it('copies the OmniScript path counted from the tree root', async () => {
      rightClick('City');
      item('Copy OmniScript path').click();
      await Promise.resolve();
      expect(copied[0]).toBe('Account:Address:City');
    });

    it('masks the copied value while Mask values is on', async () => {
      const box = document.getElementById('mask-values');
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      rightClick('City');
      item('Copy value').click();
      await Promise.resolve();
      expect(copied[0]).toBe('"<string>"');
      expect(copied[0]).not.toContain('Paris');
    });

    it('collapses and expands a branch, and keeps that across a redraw', () => {
      rightClick('Address');
      item('Collapse this branch').click();
      expect(detail().textContent).not.toContain('Paris');
      rows()[0].click(); // the same call again: a redraw of the pane must not reopen it
      rightClick('Address');
      expect(item('Expand this branch')).toBeDefined();
      item('Expand this branch').click();
      expect(detail().textContent).toContain('Paris');
    });
  });

  describe('the debug bundle contribution', () => {
    const setMask = (on) => {
      const box = document.getElementById('mask-values');
      box.checked = on;
      box.dispatchEvent(new Event('change'));
    };

    it('registers an actions dump with the settings, the selection and the calls', () => {
      fire(auraNetworkEntry({ actionId: '1', input: '{"Name":"Ada"}' }));
      fire(auraNetworkEntry({ actionId: '2', errorInAction: 'boom', startedDateTime: '2024-01-01T00:00:01Z' }));
      rows()[1].click();
      const dump = Shared.dumps((value) => value).actions;
      expect(dump).toMatchObject({ recording: true, clearOnReload: false, filters: { onlyOmni: true, errorsOnly: false, slowMs: 0, text: '' } });
      expect(dump.selectedId).toBe(dump.entries[1].id);
      expect(dump.compareId).toBeNull();
      expect(dump.entries).toHaveLength(2);
      expect(dump.entries[0].input).toEqual({ Name: 'Ada' });
      expect(dump.problems[1].failure).toContain('boom');
    });

    it('masks what the calls carried and drops the raw text of an undecodable answer', () => {
      fire(auraNetworkEntry({ input: '{"Name":"Ada"}', options: { token: 'abc' } }));
      fire(auraNetworkEntry({ actionId: '2', content: '<html>Ada was here</html>', startedDateTime: '2024-01-01T00:00:01Z' }));
      const open = Shared.dumps((value) => value).actions;
      expect(open.entries[1].rawResponse).toBe('<html>Ada was here</html>');

      setMask(true);
      const masked = Shared.dumps(Mask.apply).actions;
      expect(JSON.stringify(masked)).not.toContain('Ada');
      expect(JSON.stringify(masked)).not.toContain('abc');
      expect(masked.entries[1]).not.toHaveProperty('rawResponse');
    });
  });
});
