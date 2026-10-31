'use strict';

/* panel.css must parse the way it reads. A stray closing brace once ended an
 * @container block twice, and the browser silently dropped the rule after it.
 * Two checks: every top-level block is balanced (braces in comments and
 * strings do not count), and the rule that stray brace used to swallow is
 * present once the stylesheet is parsed. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(fileURLToPath(new URL('../../../panel.css', import.meta.url)), 'utf8');

/* The stylesheet without comments and string literals, line numbers kept. */
function stripped(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (found) => found.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (found) => found.replace(/[^\n]/g, ' '));
}

/* Walks the braces and returns the first line where one closes nothing, or
 * where a top-level block is left open at the end. */
export function firstUnbalancedLine(text) {
  let depth = 0;
  let line = 1;
  let openedAt = 0;
  for (const char of stripped(text)) {
    if (char === '\n') line += 1;
    else if (char === '{') { if (depth === 0) openedAt = line; depth += 1; }
    else if (char === '}') {
      if (depth === 0) return line;
      depth -= 1;
    }
  }
  return depth === 0 ? 0 : openedAt;
}

describe('panel.css', () => {
  it('has every block closed exactly once', () => {
    expect(firstUnbalancedLine(CSS)).toBe(0);
  });

  it('notices a block closed twice, and one never closed', () => {
    expect(firstUnbalancedLine('@media (a) {\n  .x { color: red; }\n}\n}\n.y { color: blue; }')).toBe(4);
    expect(firstUnbalancedLine('.x { color: red;\n')).toBe(1);
    expect(firstUnbalancedLine('/* } */ .x { content: "}"; }')).toBe(0);
  });

  it('keeps the rule after the loglist container block', () => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const rules = Array.from(style.sheet.cssRules);
    style.remove();
    const media = rules.find((rule) => rule.conditionText === '(max-width: 480px)' && /\.log-detail \.detail-meta/.test(rule.cssText));
    expect(media).toBeDefined();
  });
});

describe('the Settings that differ table in a narrow dialog', () => {
  it('lets the Setting, Now and Default cells wrap anywhere, so a long value cannot push Reset out (checked in a browser at 340 px)', () => {
    expect(CSS).toMatch(/table\.settings-list th\[scope="row"\],\s*\.help-card table\.settings-list td \{ overflow-wrap: anywhere; \}/);
    expect(CSS).toMatch(/table\.settings-list \{ width: 100%; \}/);
  });
});
