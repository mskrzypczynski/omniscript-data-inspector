'use strict';

/* The marks of a row are one family of icons: the element kind and what follows
 * the name, each with a tooltip and an accessible name; the step the script is on
 * and the Valid column are told by the row itself. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { bootStructure, definition, tick } from '../support/structure-page.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

const steps = () => [
  {
    name: 'Intro',
    elements: [
      { name: 'Email', type: 'Email', propSetMap: { required: true } },
      { name: 'Agree', type: 'Checkbox' },
      { name: 'Note', type: 'Text Block', propSetMap: { text: 'Hello' } },
      { name: 'Load', type: 'DataRaptor Extract Action', propSetMap: { bundle: 'Demo_Load' } },
      { name: 'Widget', type: 'Custom Lightning Web Component' },
      { name: 'Open', type: 'Text', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Email', condition: '=', data: 'a@b.c' }] } } },
      {
        name: 'Gated', type: 'Text',
        propSetMap: {
          lwcComponentOverride: 'c-demo-input',
          show: { operator: 'AND', rules: [{ field: 'Intro:Email', condition: '=', data: 'x' }] }
        }
      }
    ]
  },
  { name: 'Later', elements: [{ name: 'Extra' }] }
];

const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));

async function boot() {
  await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Email: 'a@b.c' } } }] });
  await tick();
}

describe('the name of a row', () => {
  it('dims the (Label) part and keeps the text Name (Label)', async () => {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: [
      { name: 'Intro', elements: [{ name: 'Email', type: 'Email', propSetMap: { label: 'Your email' } }] }
    ] }), data: { Intro: {} } }] });
    await tick();
    const name = rowOf('Email').querySelector('.el-name');
    expect(name.textContent).toBe('Email (Your email)');
    expect(name.querySelector('.el-label').textContent).toBe(' (Your email)');
  });
});

describe('the element kind', () => {
  it('is an icon with the kind and the exact type in its tooltip and accessible name', async () => {
    await boot();
    const icon = (name) => rowOf(name).querySelector('.el-icon');
    expect(icon('Intro').querySelector('svg.ic-el-step')).not.toBeNull();
    expect(icon('Email').querySelector('svg.ic-el-input')).not.toBeNull();
    expect(icon('Agree').querySelector('svg.ic-el-choice')).not.toBeNull();
    expect(icon('Note').querySelector('svg.ic-el-text')).not.toBeNull();
    expect(icon('Load').querySelector('svg.ic-el-action')).not.toBeNull();
    expect(icon('Widget').querySelector('svg.ic-code')).not.toBeNull();
    expect(icon('Email').title).toBe('Input — Email');
    expect(icon('Email').getAttribute('aria-label')).toBe('Input — Email');
    expect(icon('Email').textContent).toBe('');
  });
});

describe('the step the script is on', () => {
  it('is told by its row alone: aria-current, a 4 px bar from the stylesheet, no column at the left edge', async () => {
    await boot();
    expect(document.querySelector('#struct-list .el-status')).toBeNull();
    expect(rowOf('Intro').getAttribute('aria-current')).toBe('step');
    expect(rowOf('Intro').classList.contains('is-current')).toBe(true);
    // the elements of the current step, and the step ahead, carry no bar
    ['Email', 'Agree', 'Note', 'Later'].forEach((name) => expect(rowOf(name).hasAttribute('aria-current')).toBe(false));
    expect(css).toMatch(/\.el-row\[aria-current="step"\]\s*\{\s*box-shadow:\s*inset 4px 0 0 var\(--accent\)/);
    expect(css).toMatch(/\.el-row\.is-skipped \.el-name\s*\{\s*font-style:\s*italic/);
  });

  it('tells the current step from the others by name: bold, with the old words at the start of its tooltip', async () => {
    await boot();
    expect(rowOf('Intro').querySelector('.el-name').title.startsWith('The step the OmniScript is on now')).toBe(true);
    expect(rowOf('Later').querySelector('.el-name').title.startsWith('The step')).toBe(false);
    expect(css).toMatch(/\.el-row\.is-current \.el-name\s*\{\s*font-weight:\s*600/);
  });

  it('tints the current step and the rows of its elements as one block, and no other row', async () => {
    await boot();
    ['Intro', 'Email', 'Agree', 'Note', 'Load'].forEach((name) => expect(rowOf(name).classList.contains('is-current-block')).toBe(true));
    ['Later', 'Extra'].forEach((name) => expect(rowOf(name).classList.contains('is-current-block')).toBe(false));
    // the tint is a mix of the accent token, 8 % in light and 14 % in dark, with no token of its own
    expect(css).toMatch(/\.el-row\.is-current-block:not\(\.is-selected\):not\(\.is-in-group\):not\(:hover\)[^{]*\{\s*background:\s*color-mix\(in srgb, var\(--accent\) 8%, var\(--bg\)\)/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \.el-row\.is-current-block:not\(\.is-selected\):not\(\.is-in-group\):not\(:hover\)[^{]*\{\s*background:\s*color-mix\(in srgb, var\(--accent\) 14%, var\(--bg\)\)/);
  });

  it('draws every indent guide and bracket in the neutral line colour, never the accent', async () => {
    const guides = [...css.matchAll(/\.el-row[^{]*::(?:before|after)\s*\{[^}]*\}/g)].map((m) => m[0]).join('\n');
    expect(guides).toContain('var(--line)');
    expect(guides).not.toMatch(/var\(--accent\)/);
  });

  it('starts the first cell of a row with the twisty, so the guides line up', async () => {
    await boot();
    expect(rowOf('Email').firstElementChild.classList.contains('el-twisty')).toBe(true);
    expect(document.querySelector('#struct-list .el-head').firstElementChild.classList.contains('el-twisty')).toBe(true);
  });
});

describe('a step passed without running', () => {
  it('is italic and dimmed by class, and its name tooltip says why', async () => {
    const skipped = [
      { name: 'Gate', elements: [{ name: 'Kind', type: 'Text' }] },
      { name: 'Maybe', propSetMap: { show: { operator: 'AND', rules: [{ field: 'Gate:Kind', condition: '=', data: 'x' }] } }, elements: [] },
      { name: 'Here', elements: [{ name: 'Field', type: 'Text' }] }
    ];
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: skipped, asIndex: 2 }), data: { Gate: { Kind: 'y' } } }] });
    await tick();
    const row = rowOf('Maybe');
    expect(row.classList.contains('is-skipped')).toBe(true);
    expect(row.querySelector('.el-name').title.startsWith('Passed without running: its show rule was false')).toBe(true);
    expect(rowOf('Gate').querySelector('.el-name').title.startsWith('Gate')).toBe(true);
    const verdict = row.querySelector('.el-verdict');
    expect(verdict.title).toBe('Passed without running');
    expect(verdict.querySelector('.verdict.is-neutral')).not.toBeNull();
  });
});

describe('the Valid column', () => {
  const NEXT_TITLE = 'Whether the element is valid now: ✕ would stop Next, – the panel cannot tell; a step shows ✓ when nothing stops Next on it. Blank is valid or nothing to judge. Judged against the data right now; best effort.';
  const verdictOf = (name) => rowOf(name).querySelector('.el-verdict');

  async function bootNext({ data, asIndex = 1 } = {}) {
    const flow = [
      { name: 'Done', elements: [{ name: 'Old', type: 'Text', propSetMap: { required: true } }] },
      { name: 'Now', elements: [
        { name: 'Email', type: 'Email', propSetMap: { required: true } },
        { name: 'Phone', type: 'Text', propSetMap: { required: true } },
        { name: 'Note', type: 'Text Block', propSetMap: { text: 'Hello' } }
      ] },
      { name: 'Ahead', elements: [{ name: 'Later', type: 'Text', propSetMap: { required: true } }] }
    ];
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: flow, asIndex }), data }] });
    await tick();
  }

  it('is the last cell of every row, after the Marks cell, with the word Next shown in the header', async () => {
    await bootNext({ data: { Done: { Old: 'x' }, Now: { Email: 'a@b.c' } } });
    const head = document.querySelector('#struct-list .el-head');
    expect(head.lastElementChild.classList.contains('el-verdict')).toBe(true);
    expect(head.lastElementChild.textContent).toBe('Valid');
    expect(head.lastElementChild.title).toBe(NEXT_TITLE);
    expect(css).not.toMatch(/\.el-head \.el-verdict\s*\{[^}]*font-size:\s*0/); // the word is visible
    document.querySelectorAll('#struct-list .el-row:not(.el-head)').forEach((row) => {
      expect(row.lastElementChild.classList.contains('el-verdict')).toBe(true);
      expect(row.lastElementChild.previousElementSibling.classList.contains('el-marks')).toBe(true);
    });
  });

  it('is divided from the marks by a 1 px hairline on every row, the header and the empty rows included', async () => {
    await bootNext({ data: { Done: { Old: 'x' }, Now: { Email: 'a@b.c' } } });
    expect(css).toMatch(/\.el-verdict\s*\{[^}]*border-left:\s*1px solid var\(--line\)/);
    expect(css).not.toMatch(/\.el-verdict:not\(/);
    expect(document.querySelectorAll('#struct-list .el-row .el-verdict').length).toBe(document.querySelectorAll('#struct-list .el-row').length);
  });

  it('is pinned at the right edge: the verdict is a flex item that does not shrink, whatever comes before it', () => {
    expect(css).toMatch(/\.el-verdict\s*\{\s*flex:\s*none;/);
    expect(css).toMatch(/\.el-marks\s*\{\s*flex:\s*none;/);
    expect(css).toMatch(/\.list-name\s*\{\s*flex:\s*1 1 auto;\s*min-width:\s*0;/);
  });

  it('draws the glyph large and bold', () => {
    expect(css).toMatch(/\.verdict\.is-good::before[^{]*\{[^}]*font-size:\s*14px;\s*font-weight:\s*700/);
  });

  it('draws a glyph pill for a field: the sentence in the text, the title and the accessible name', async () => {
    await bootNext({ data: { Done: { Old: 'x' }, Now: { Email: 'a@b.c' } } });
    const filled = verdictOf('Email'); // valid: no tick, only failures and doubts are drawn on an element
    expect(filled.children).toHaveLength(0);
    expect(filled.hasAttribute('title')).toBe(false);

    const empty = verdictOf('Phone');
    expect(empty.title).toBe('Required and empty: would stop Next');
    expect(empty.getAttribute('aria-label')).toBe('Required and empty: would stop Next');
    expect(empty.querySelector('.tag.tag-error.verdict.is-bad')).not.toBeNull();
  });

  it('leaves what has nothing to judge, and a step ahead, empty and silent', async () => {
    await bootNext({ data: { Done: { Old: 'x' }, Now: { Email: 'a@b.c' } } });
    ['Note', 'Ahead', 'Later'].forEach((name) => {
      const cell = verdictOf(name);
      expect(cell.children).toHaveLength(0);
      expect(cell.hasAttribute('role')).toBe(false);
      expect(cell.hasAttribute('title')).toBe(false);
    });
  });

  it('shows a cross on a passed step whose data has gone bad', async () => {
    await bootNext({ data: { Done: { Old: '' }, Now: { Email: 'a@b.c', Phone: '1' } } });
    expect(verdictOf('Done').querySelector('.verdict.is-bad')).not.toBeNull();
    expect(verdictOf('Old').title).toBe('Required and empty: would stop Next');
    expect(rowOf('Done').querySelector('.el-badge')).toBeNull(); // only the current step carries the badge
  });

  it('is blank throughout, and the header says why, while no data has been read', async () => {
    await bootNext({ data: '' });
    document.querySelectorAll('#struct-list .el-row:not(.el-head) .el-verdict').forEach((cell) => expect(cell.children).toHaveLength(0));
    expect(document.querySelector('#struct-list .el-head .el-verdict').title).toBe(`${NEXT_TITLE} No data has been read yet.`);
  });

  it('follows the data in place, without redrawing the list', async () => {
    jest.useFakeTimers();
    try {
      await bootNext({ data: { Done: { Old: 'x' }, Now: { Email: 'a@b.c' } } });
      const cell = verdictOf('Phone');
      expect(cell.querySelector('.verdict.is-bad')).not.toBeNull();
      document.getElementById('main').jsonDataStr = JSON.stringify({ Done: { Old: 'x' }, Now: { Email: 'a@b.c', Phone: '1' } });
      jest.advanceTimersByTime(3000);
      await tick();
      expect(verdictOf('Phone')).toBe(cell); // the same node: nothing was redrawn
      expect(cell.children).toHaveLength(0); // now valid: the cross goes and nothing replaces it
      expect(cell.hasAttribute('title')).toBe(false);
      expect(verdictOf('Now').title).toBe('Nothing stops Next on this step');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the Marks column', () => {
  it('keeps the * for required and draws the rest as icons with a name and a tooltip', async () => {
    await boot();
    expect(rowOf('Email').querySelector('.tag-req').textContent).toBe('*');
    const gated = rowOf('Gated');
    const rule = rowOf('Open').querySelector('.tag-cond');
    expect(rule.querySelector('svg.ic-diamond')).not.toBeNull();
    expect(rule.title).toContain('Shown when: Intro:Email = "a@b.c"');
    expect(rowOf('Open').querySelector('.tag-hidden')).toBeNull();
    expect(gated.querySelector('.tag-cond')).toBeNull(); // hidden by its rule: the closed eye alone
    const hidden = gated.querySelector('.tag-hidden');
    expect(hidden.title).toContain('Shown when: Intro:Email = "x"');
    expect(hidden.querySelector('svg.ic-eye-off')).not.toBeNull();
    expect(hidden.title).toMatch(/^Hidden by its show rule: /);
    expect(hidden.getAttribute('aria-label')).toMatch(/^Hidden: /);
    expect(rowOf('Load').querySelector('.tag-act svg.ic-calls')).not.toBeNull();
  });

  it('marks an element a custom component overrides, and says what that means', async () => {
    await boot();
    const mark = rowOf('Gated').querySelector('.tag-override');
    expect(mark.querySelector('svg.ic-component')).not.toBeNull();
    expect(mark.title).toBe('Overridden by c-demo-input: its own markup and validation run instead of the standard element');
    expect(mark.getAttribute('role')).toBe('img');
    expect(rowOf('Email').querySelector('.tag-override')).toBeNull();
  });

  it('puts the marks in a cell of their own, in the order they always had, between the name and the Next cell', async () => {
    await boot();
    const row = rowOf('Gated');
    const cells = [...row.children].map((cell) => cell.className.split(' ')[0]);
    expect(cells.slice(-2)).toEqual(['el-marks', 'el-verdict']);
    const marks = row.querySelector('.el-marks');
    expect([...marks.children].map((mark) => [...mark.classList].find((name) => /^tag-(hidden|req|cond|override|act|missing|type)$/.test(name)).slice(4))).toEqual(['hidden', 'override']);
    expect(row.querySelector('.el-name .tag')).toBeNull(); // nothing inside the name cell
    expect(rowOf('Agree').querySelector('.el-marks').children).toHaveLength(0); // an empty cell, so the divider stays
    expect(rowOf('Email').querySelector('.el-marks .tag-req')).not.toBeNull();
    expect(css).toMatch(/\.el-marks\s*\{[^}]*gap:\s*4px/);
  });

  it('names the three columns in the header: Element, Marks and Next', async () => {
    await boot();
    const head = document.querySelector('#struct-list .el-head');
    expect([...head.querySelectorAll('.el-name, .el-marks, .el-verdict')].map((cell) => cell.textContent)).toEqual(['Element', 'Marks', 'Valid']);
    expect(head.querySelector('.el-marks').tagName).toBe('BUTTON');
  });

  it('lists every mark in the legend of the Marks header', async () => {
    await boot();
    const legend = document.querySelector('#struct-list .el-head .el-marks').title;
    ['cube = overridden by a custom component', 'closed eye = hidden by its show rule', 'diamond = has a show rule']
      .forEach((line) => expect(legend).toContain(line));
  });
});
