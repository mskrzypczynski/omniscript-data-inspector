'use strict';

/* The toolbar popup names the DevTools tab the way the browser it runs in
 * does: next to Elements in the Chromium browsers, next to Inspector in
 * Firefox. It starts as the Chromium text, so it is right without script. */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync('popup.html', 'utf8');
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function mountPopup() {
  const parsed = new DOMParser().parseFromString(SOURCE, 'text/html');
  document.head.innerHTML = [...parsed.head.querySelectorAll('style')].map((style) => style.outerHTML).join('');
  document.body.innerHTML = parsed.body.innerHTML;
  document.documentElement.setAttribute('data-browser', parsed.documentElement.getAttribute('data-browser'));
}

async function runPopup(userAgent) {
  mountPopup();
  jest.resetModules();
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  await import('../../../src/ui/popup.js');
}

/* What a person reads: the text of a node with whatever inside it is hidden left out. */
function readable(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE || getComputedStyle(node).display === 'none') return '';
  return [...node.childNodes].map(readable).join('');
}
const shown = (selector) => [...document.querySelectorAll(selector)]
  .map((node) => readable(node).replace(/\s+/g, ' ').trim())
  .filter(Boolean);

afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; });

describe('popup.html', () => {
  it('loads its script as a module file, never inline (extension pages forbid inline script)', () => {
    const parsed = new DOMParser().parseFromString(SOURCE, 'text/html');
    const scripts = [...parsed.querySelectorAll('script')];
    expect(scripts.map((script) => script.getAttribute('src'))).toEqual(['src/ui/popup.js']);
    expect(scripts[0].type).toBe('module');
    expect(scripts[0].textContent.trim()).toBe('');
  });

  it('starts as the Chromium steps, before any script has run', () => {
    mountPopup();
    expect(document.documentElement.dataset.browser).toBe('chromium');
    expect(shown('li')[2]).toBe('Pick the {=} OmniScript tab, next to Elements and Console (under » if hidden).');
    expect(shown('.note.firefox')).toEqual([]);
  });

  it('gives Chrome, Edge and the other Chromium browsers the Elements wording', async () => {
    await runPopup(CHROME);
    expect(document.documentElement.dataset.browser).toBe('chromium');
    const steps = shown('li');
    expect(steps[1]).toContain('F12');
    expect(steps[1]).toContain('Ctrl');
    expect(steps[1]).toContain('⌘');
    expect(steps[2]).toBe('Pick the {=} OmniScript tab, next to Elements and Console (under » if hidden).');
    expect(shown('.note.firefox')).toEqual([]);
  });

  it('gives Firefox the Inspector wording and says it reads the top document only', async () => {
    await runPopup(FIREFOX);
    expect(document.documentElement.dataset.browser).toBe('firefox');
    expect(shown('li')[2]).toBe('Pick the {=} OmniScript tab, next to Inspector and Console (under » if hidden).');
    expect(shown('.note.firefox')).toEqual(["In Firefox the panel reads the top document of the page only."]);
  });
});
