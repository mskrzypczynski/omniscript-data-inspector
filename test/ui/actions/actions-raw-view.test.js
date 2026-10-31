'use strict';

/* Show raw in the row menu: the request and the answer as they went over the
 * wire, in the detail pane, with Back and Esc. Names are invented. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

describe('Calls: the Raw view', () => {
  let listeners;
  let copied;
  let Mask;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    ({ Mask } = await import('../../../src/ui/mask-setting.js'));
    Mask.mount(document.getElementById('mask-values'));
    const { decorateButtons } = await import('../../../src/ui/icons.js');
    decorateButtons();
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
    copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } } });
  });

  afterEach(() => {
    delete navigator.clipboard;
    // An open menu listens on the document until it is closed: Esc closes it for good.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelectorAll('.ctx-menu').forEach((node) => node.remove());
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const menuItems = () => [...document.querySelectorAll('.ctx-menu .ctx-item')];
  const showRaw = (row = rows()[0]) => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    menuItems().find((item) => item.textContent === 'Show raw').click();
  };
  const call = (extra = {}) => fire(auraNetworkEntry({ actionId: '1', method: 'Order_Place', input: '{"Name":"Ada"}', ...extra }));

  it('adds no tab to the detail strip and shows nothing of it until asked', () => {
    call();
    rows()[0].click();
    expect([...detail().querySelectorAll('.seg-btn')].map((button) => button.textContent)).not.toContain('Raw');
    expect(detail().querySelector('.raw-pane')).toBeNull();
    expect(detail().textContent).not.toContain('Request');
  });

  it('puts Show raw after Copy input in the row menu, with a tooltip', () => {
    call();
    rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    const labels = menuItems().map((item) => item.textContent);
    expect(labels.slice(0, 3)).toEqual(['Copy name', 'Copy input', 'Show raw']);
    expect(menuItems()[2].title).toMatch(/request .* answer/);
  });

  it('opens the request and the answer as numbered, wrapped blocks in the detail pane', () => {
    call({ output: { greeting: 'hello' } });
    showRaw();
    const pane = detail().querySelector('.raw-pane');
    expect(pane).not.toBeNull();
    expect(rows()[0].classList.contains('is-selected')).toBe(true);
    const parts = [...pane.querySelectorAll('.raw-part')];
    expect(parts.map((part) => part.querySelector('.raw-part-title').textContent)).toEqual(['Request', 'Response']);
    parts.forEach((part) => {
      const block = part.querySelector('pre.raw');
      expect(block.classList.contains('is-numbered')).toBe(true);
      expect(block.classList.contains('is-wrap')).toBe(true);
      expect(part.querySelector('.raw-copy').title).not.toBe('');
    });
    expect(parts[0].textContent).toContain('"descriptor"');
    expect(parts[0].textContent).toContain('Order_Place');
    expect(parts[1].textContent).toContain('hello');
    expect(pane.querySelector('.raw-back').title).toMatch(/Esc/);
  });

  it('closes with Back and with Esc, and the call has its normal detail again', () => {
    call();
    showRaw();
    detail().querySelector('.raw-back').click();
    expect(detail().querySelector('.raw-pane')).toBeNull();
    expect(detail().textContent).toContain('Name');

    showRaw();
    const pane = detail().querySelector('.raw-pane');
    pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(detail().querySelector('.raw-pane')).toBeNull();
    expect(detail().textContent).toContain('Name');
  });

  it('is left by choosing another call, and is kept through a poll that changes nothing', () => {
    call();
    call({ actionId: '2', startedDateTime: '2024-01-01T00:00:01Z' });
    showRaw(rows()[0]);
    const first = detail().querySelector('.raw-pane');
    fire(auraNetworkEntry({ actionId: '3', method: 'Other_Call', startedDateTime: '2024-01-01T00:00:02Z' }));
    expect(detail().querySelector('.raw-pane')).toBe(first); // no rebuild under the reader
    rows()[1].click();
    expect(detail().querySelector('.raw-pane')).toBeNull();
  });

  it('copies each side with its own button', async () => {
    call({ output: { greeting: 'hello' } });
    showRaw();
    const [request, response] = [...detail().querySelectorAll('.raw-copy')];
    request.click();
    response.click();
    await Promise.resolve();
    expect(copied).toHaveLength(2);
    expect(JSON.parse(copied[0]).params.classname).toBe('omnistudiocore.IPService');
    expect(copied[1]).toContain('"greeting": "hello"');
  });

  it('masks what is shown and copied while Mask values is on, and follows the switch', async () => {
    call({ output: { greeting: 'hello' } });
    showRaw();
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const pane = detail().querySelector('.raw-pane');
    expect(pane.textContent).not.toContain('Ada');
    expect(pane.textContent).not.toContain('hello');
    expect(pane.textContent).toContain('"descriptor"');
    [...pane.querySelectorAll('.raw-copy')].forEach((button) => button.click());
    await Promise.resolve();
    expect(copied).toHaveLength(2);
    copied.forEach((text) => { expect(text).not.toContain('Ada'); expect(text).not.toContain('hello'); });
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(detail().querySelector('.raw-pane').textContent).toContain('hello');
  });

  it('says what was cut and what is not kept', () => {
    call({ content: `{"actions":[{"id":"1","state":"SUCCESS","returnValue":{"text":"${'x'.repeat(30000)}"}}]}` });
    showRaw();
    expect(detail().querySelector('.raw-pane').textContent).toContain('Cut at 20 KB');
    detail().querySelector('.raw-back').click();
    rows()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(menuItems().find((item) => item.textContent === 'Show raw').disabled).toBeFalsy();
  });

  it('is not on a chain\'s row, which has no request of its own, but is on one of its calls', () => {
    [1, 2, 3].forEach((n) => fire(auraNetworkEntry({
      actionId: String(n), method: 'Order_Place', options: n < 3 ? { chainable: true } : {}, output: { ok: true, handle: `handle-${n + 1}` },
      input: JSON.stringify({ Hop: n, resume: `handle-${n}` }), startedDateTime: new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString()
    })));
    expect(rows()).toHaveLength(1);
    const chain = rows()[0];
    expect(chain.classList.contains('log-chain')).toBe(true);
    chain.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    expect(menuItems().map((item) => item.textContent)).not.toContain('Show raw');

    chain.querySelector('.chain-toggle').click();
    const child = rows()[1];
    expect(child.classList.contains('log-chain')).toBe(false);
    showRaw(child);
    expect(detail().querySelector('.raw-pane')).not.toBeNull();
    expect(detail().querySelector('.raw-pane').textContent).toContain('handle-2');
  });

  it('names its controls and blocks for a screen reader, and lets the blocks be scrolled with the keyboard', () => {
    call();
    showRaw();
    const pane = detail().querySelector('.raw-pane');
    expect(pane.querySelector('.raw-back').getAttribute('aria-label')).toBe('Back to the call');
    const parts = [...pane.querySelectorAll('.raw-part')];
    expect(parts.map((part) => part.querySelector('.raw-copy').getAttribute('aria-label'))).toEqual(['Copy request', 'Copy response']);
    parts.forEach((part) => {
      const title = document.getElementById(part.getAttribute('aria-labelledby'));
      expect(title.textContent).toBe(part.querySelector('.raw-part-title').textContent);
    });
    expect(parts.map((part) => part.querySelector('pre.raw-wire').getAttribute('aria-label'))).toEqual(['Request text', 'Response text']);
    parts.forEach((part) => {
      const block = part.querySelector('pre.raw-wire');
      expect(block.getAttribute('tabindex')).toBe('0');
      expect(block.getAttribute('role')).toBe('region');
    });
  });

  it('returns on Esc pressed on the list row as well', () => {
    call();
    showRaw();
    expect(detail().querySelector('.raw-pane')).not.toBeNull();
    rows()[0].click(); // the call stays and so does the Raw view; the focus is on the row
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(detail().querySelector('.raw-pane')).toBeNull();
    expect(detail().textContent).toContain('Name');
  });

  it('hides a credential in the answer, with Mask values off and on, in the view and in Copy', async () => {
    call({ content: JSON.stringify([{ statusCode: 200, tid: 7, result: { Name: 'Zed Example', sessionId: 'SESSION-INVENTED-CCC', csrfToken: 'CSRF-INVENTED-DDD' } }]) });
    showRaw();
    const answer = () => detail().querySelectorAll('.raw-part')[1];
    const copyResponse = () => answer().querySelector('.raw-copy');
    [false, true].forEach((masked) => {
      if (masked !== Mask.on()) { const box = document.getElementById('mask-values'); box.checked = masked; box.dispatchEvent(new Event('change')); }
      expect(answer().textContent).not.toContain('SESSION-INVENTED-CCC');
      expect(answer().textContent).not.toContain('CSRF-INVENTED-DDD');
      expect(answer().textContent).toContain('<hidden>');
      expect(answer().textContent).toContain('2 credential-like fields left out.');
      copyResponse().click();
    });
    await Promise.resolve();
    expect(copied).toHaveLength(2);
    copied.forEach((text) => {
      expect(text).not.toContain('SESSION-INVENTED-CCC');
      expect(text).not.toContain('CSRF-INVENTED-DDD');
    });
  });
});
