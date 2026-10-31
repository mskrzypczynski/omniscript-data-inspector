'use strict';

/* How the conditions of a card read: stacked in a narrow pane, one chevron for
 * every disclosure, and red kept for what blocks. jsdom lays nothing out, so
 * the stylesheet is read for the rules, as other tests here do. */

import { readFileSync } from 'node:fs';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

/* The declarations of the first rule whose selector list holds `selector`. */
function declarationsOf(selector) {
  const pattern = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(,[^{]*)?\\{([^}]*)\\}`);
  const found = pattern.exec(css);
  return found ? found[3] : '';
}

describe('the conditions of a card in a narrow pane', () => {
  it('stack each condition under 480 px: its mark and reading first, then Field, Must be and Is now, each labelled', () => {
    const start = css.indexOf('@container (max-width: 480px) {\n  .fc-rows');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n}\n', start));
    expect(block).toMatch(/\.fc-table thead \{ display: none; \}/);
    expect(block).toMatch(/\.fc-cond \.fc-read \{ order: -1;/);
    expect(block).toMatch(/\.fc-cond \.fc-main \.fc-mark \{ display: none; \}/);
    expect(block).toMatch(/\.fc-cond \.fc-read \.fc-mark-copy \{ display: inline; \}/);
  });

  it('gives the mark a gap before the field in the table, and in the stacked grid', () => {
    expect(declarationsOf('.rule-table .rule-col-mark')).toMatch(/padding-right:\s*10px/);
    expect(css).toMatch(/\.prop-table td > \.rule-table \.rule-leaf \{[^}]*column-gap:\s*10px/);
  });
});

describe('the look of what is false', () => {
  it('uses the muted tone for a condition not met and a false rule, and never red on a condition row', () => {
    ['.rule-mark.is-false', '.rule-leaf.is-false', '.rule-line.is-false'].forEach((selector) => {
      expect(declarationsOf(selector)).toContain('var(--fg-dim)');
      expect(declarationsOf(selector)).not.toContain('--err-fg');
    });
    expect(css).toMatch(/\.fc-mark-glyph\.is-false,\s*\.fc-mark-copy\.is-false,[^{]*\{ color: var\(--fg-dim\); \}/);
    expect(css).not.toMatch(/fc-mark-(glyph|copy)[^{]*is-block/);
    expect(css).toMatch(/\.fc-mark-glyph\.is-true,\s*\.fc-mark-copy\.is-true \{ color: var\(--fg\); \}/);
  });

  it('keeps red for the tags that fail', () => {
    expect(declarationsOf('.tag-error')).toContain('--err-fg');
  });
});

describe('hidden rows and row labels', () => {
  it('draws a hidden row in the dim text colour and italics, not by opacity', () => {
    const rule = declarationsOf('.el-row.is-hidden:not(.is-selected) .el-name');
    expect(rule).toContain('var(--fg-dim)');
    expect(rule).toContain('italic');
    expect(rule).not.toContain('opacity');
  });

  it('dims the (Label) after a name', () => {
    expect(declarationsOf('.el-row:not(.is-selected) .el-label')).toContain('var(--fg-dim)');
  });
});

describe('the disclosure chevrons', () => {
  it('are the same icon on a card that folds and on the Message formula fold', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Age', type: 'Number' },
      {
        name: 'Check', type: 'Set Errors',
        propSetMap: {
          elementErrorMap: { Age: '="Too young: " & %Intro:Age%' },
          show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] }
        }
      }
    ] }] }), data: { Intro: { Age: 12 } } }] });
    clickRow('Intro');
    [...document.querySelectorAll('#struct-detail .seg-btn')].find((b) => b.textContent.startsWith('Validation')).click();
    await tick();
    const cardChevron = document.querySelector('.fc-toggle svg');
    const foldChevron = document.querySelector('.msg-formula > summary svg');
    expect(cardChevron.getAttribute('class')).toBe(foldChevron.getAttribute('class'));
    expect(foldChevron.getAttribute('class')).toContain('ic-chevron-right');
    expect(document.querySelector('.msg-formula > summary').textContent).toBe('Message formula');
  });
});
