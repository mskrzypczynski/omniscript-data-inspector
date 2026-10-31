import { readFileSync } from 'node:fs';
import { decorateButtons, ICON_NAMES } from '../../../src/ui/icons.js';

describe('toolbar button icons', () => {
  beforeEach(() => {
    document.body.innerHTML = readFileSync(new URL('../../../panel.html', import.meta.url), 'utf8')
      .replace(/^[\s\S]*<body>/, '').replace(/<script[\s\S]*$/, '');
    decorateButtons();
  });

  it('gives every named button a known icon, a label span and a title', () => {
    const buttons = [...document.querySelectorAll('button[data-icon]')];
    expect(buttons.length).toBeGreaterThan(15);
    buttons.forEach((b) => {
      expect(ICON_NAMES).toContain(b.dataset.icon);
      expect(b.querySelector('svg.ui-icon[aria-hidden="true"]')).not.toBeNull();
      expect(b.querySelector('.btn-label').textContent).toBeTruthy();
      expect(b.title).toBeTruthy();
    });
  });

  it('is safe to run twice', () => {
    decorateButtons();
    expect(document.querySelectorAll('#refresh .ui-icon')).toHaveLength(1);
  });
});
