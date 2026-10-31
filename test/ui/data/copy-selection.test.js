'use strict';

/* Ctrl/Cmd+C from the trees and the Raw view: exactly what is highlighted, or
 * the value the caret is in. Run against the real panel markup so the Mask
 * switch is the real one. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

let renderJsonTree;
let buildRawBlock;

beforeAll(async () => {
  stubChromeDevtools();
  mountPanelMarkup();
  await import('../../../src/ui/app.js');
  ({ renderJsonTree } = await import('../../../src/ui/json-tree-view.js'));
  ({ buildRawBlock } = await import('../../../src/ui/data/raw-view.js'));
});

function draw(value) {
  const container = document.createElement('div');
  container.className = 'viewport';
  container.dataset.testHost = '';
  document.body.appendChild(container);
  renderJsonTree(container, 'root', value, { expanded: new Set(['']) });
  return container;
}

function pressCopy(target) {
  let copied = null;
  const event = new Event('copy', { bubbles: true, cancelable: true });
  event.clipboardData = { setData: (type, text) => { copied = text; } };
  target.dispatchEvent(event);
  return { copied, prevented: event.defaultPrevented };
}

function select(startNode, startOffset, endNode = startNode, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function rowOf(container, key) {
  return [...container.querySelectorAll('.row')].find((r) => r.querySelector('.k')?.textContent === key);
}

/* The text node of a value: ` "Ada"` (the leading space is its own node). */
const valueText = (container, key) => rowOf(container, key).querySelector('.v').lastChild;

function setMask(on) {
  const box = document.getElementById('mask-values');
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

afterEach(() => {
  setMask(false);
  window.getSelection().removeAllRanges();
  document.querySelectorAll('[data-test-host], input.test-input, .toast').forEach((node) => node.remove());
});

describe('highlighted text', () => {
  it('copies exactly the highlighted characters of a string, not the row', () => {
    const container = draw({ name: 'Ada Lovelace' });
    const text = valueText(container, 'name');
    select(text, 1, text, 7); // `Ada Lo`
    const { copied, prevented } = pressCopy(text.parentNode);
    expect(copied).toBe('Ada Lo');
    expect(prevented).toBe(true);
  });

  it('keeps the quotes when they are highlighted', () => {
    const container = draw({ name: 'Ada' });
    const text = valueText(container, 'name');
    select(text, 0, text, text.length);
    expect(pressCopy(text.parentNode).copied).toBe('"Ada"');
  });

  it('masks a piece of a value but not a piece of a key', () => {
    const container = draw({ name: 'Ada Lovelace', n: 1234 });
    setMask(true);

    const text = valueText(container, 'name');
    select(text, 2, text, 5);
    expect(pressCopy(text.parentNode).copied).toBe('<string>');

    const number = valueText(container, 'n');
    select(number, 1, number, 3);
    expect(pressCopy(number.parentNode).copied).toBe('<number>');

    const key = rowOf(container, 'name').querySelector('.k').firstChild;
    select(key, 0, key, 2);
    expect(pressCopy(key.parentNode).copied).toBe('na');
  });

  it('still copies several rows as clean indented text', () => {
    const container = draw({ a: 1, b: 'x' });
    const range = document.createRange();
    range.selectNodeContents(container);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    expect(pressCopy(container.firstChild).copied).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it('leaves a highlighted selection in the Raw view to the browser unless masked', () => {
    const host = document.createElement('div');
    host.className = 'viewport';
    host.dataset.testHost = '';
    host.appendChild(buildRawBlock(JSON.stringify({ name: 'Ada' }, null, 2)).node);
    document.body.appendChild(host);
    const line = host.querySelectorAll('.raw-line')[1].firstChild;
    select(line, 11, line, 14);
    expect(pressCopy(line.parentNode).prevented).toBe(false);
  });
});

describe('a caret inside a value', () => {
  it('copies the whole string, unquoted and unescaped, with a Copied toast', () => {
    const container = draw({ name: 'Ada "A" Lovelace' });
    const text = valueText(container, 'name');
    select(text, 5);
    const { copied, prevented } = pressCopy(text.parentNode);
    expect(copied).toBe('Ada "A" Lovelace');
    expect(prevented).toBe(true);
    expect(document.querySelector('.toast').textContent).toBe('Copied');
  });

  it('copies the quoted string when the caret is before the opening quote', () => {
    const container = draw({ name: 'Ada' });
    const text = valueText(container, 'name');
    select(text, 0);
    expect(pressCopy(text.parentNode).copied).toBe('"Ada"');
  });

  it('copies a number or boolean, and masks the number', () => {
    const container = draw({ n: 42, ok: true });
    const number = valueText(container, 'n');
    select(number, 1);
    expect(pressCopy(number.parentNode).copied).toBe('42');

    const flag = valueText(container, 'ok');
    select(flag, 1);
    expect(pressCopy(flag.parentNode).copied).toBe('true');

    setMask(true);
    select(number, 1);
    expect(pressCopy(number.parentNode).copied).toBe('<number>');
    select(flag, 1);
    expect(pressCopy(flag.parentNode).copied).toBe('true');
  });

  it('masks a string copied from the caret', () => {
    const container = draw({ name: 'Ada' });
    const text = valueText(container, 'name');
    setMask(true);
    select(text, 2);
    expect(pressCopy(text.parentNode).copied).toBe('<string>');
  });

  it('copies the whole long string, not the shown slice, and ignores the toggle', () => {
    const long = 'x'.repeat(700);
    const container = draw({ s: long });
    const text = valueText(container, 's').previousSibling; // the slice text, before the toggle
    select(text, 5);
    expect(pressCopy(text.parentNode).copied).toBe(long);
    const toggle = container.querySelector('.v-more').firstChild;
    select(toggle, 2);
    expect(pressCopy(toggle.parentNode).prevented).toBe(false);
  });

  it('leaves a caret on a key to the browser', () => {
    const container = draw({ name: 'Ada' });
    const key = rowOf(container, 'name').querySelector('.k').firstChild;
    select(key, 1);
    const { copied, prevented } = pressCopy(key.parentNode);
    expect(copied).toBeNull();
    expect(prevented).toBe(false);
  });

  it('does not interfere with copying inside an input field', () => {
    const container = draw({ name: 'Ada' });
    const input = document.createElement('input');
    input.className = 'test-input';
    document.body.appendChild(input);
    select(valueText(container, 'name'), 2);
    input.focus();
    const { copied, prevented } = pressCopy(input);
    expect(copied).toBeNull();
    expect(prevented).toBe(false);
  });

  it('copies the value under the caret in the Raw view', () => {
    const host = document.createElement('div');
    host.className = 'viewport';
    host.dataset.testHost = '';
    host.appendChild(buildRawBlock(JSON.stringify({ name: 'Ada "A"', n: 7 }, null, 2)).node);
    document.body.appendChild(host);
    const lines = host.querySelectorAll('.raw-line');

    const nameText = lines[1].firstChild; //   "name": "Ada \"A\"",
    select(nameText, nameText.data.indexOf('Ada') + 1);
    expect(pressCopy(lines[1]).copied).toBe('Ada "A"');

    const numText = lines[2].firstChild;
    select(numText, numText.data.indexOf('7'));
    expect(pressCopy(lines[2]).copied).toBe('7');

    setMask(true);
    select(nameText, nameText.data.indexOf('Ada') + 1);
    expect(pressCopy(lines[1]).copied).toBe('<string>');
  });
});
