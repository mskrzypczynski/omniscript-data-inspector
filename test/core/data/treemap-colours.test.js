'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* The treemap's colours live in panel.css (so they follow the theme). This
 * reads them back and checks what the chart relies on: a label on a fill is
 * readable, and the two themes define the same slots. */

import { readFileSync } from 'node:fs';
import { TREEMAP_SLOTS } from '../../../src/core/data/treemap.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

/* The declarations of --tm-* inside the rule that starts with `selector`. */
function colours(selector) {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--(tm-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/* The hue of a #rrggbb colour, in degrees. */
function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  let h;
  if (max === r) h = ((g - b) / delta) % 6; else if (max === g) h = (b - r) / delta + 2; else h = (r - g) / delta + 4;
  return (h * 60 + 360) % 360;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = colours(':root {');
const dark = colours(':root[data-theme="dark"]');
const darkByOs = colours(':root:not([data-theme="light"])');

describe('treemap colours', () => {
  it('defines the neutral and every slot, each with a label colour and a darker colour for the blocks inside it, in both themes', () => {
    for (const theme of [light, dark, darkByOs]) {
      for (let slot = 0; slot <= TREEMAP_SLOTS; slot++) {
        ['', '-ink', '-kid', '-kid-ink'].forEach((part) => expect(theme[`tm-${slot}${part}`]).toMatch(/^#[0-9a-f]{6}$/i));
      }
    }
  });

  it('keeps the dark theme the same whether DevTools or the system chose it', () => {
    expect(darkByOs).toEqual(dark);
  });

  it.each([['light', light], ['dark', dark]])('puts text with at least 4.5:1 contrast on every fill, top-level and inside (%s)', (name, theme) => {
    for (let slot = 0; slot <= TREEMAP_SLOTS; slot++) {
      expect({ slot, ratio: contrast(theme[`tm-${slot}`], theme[`tm-${slot}-ink`]) >= 4.5 }).toEqual({ slot, ratio: true });
      expect({ slot, kid: contrast(theme[`tm-${slot}-kid`], theme[`tm-${slot}-kid-ink`]) >= 4.5 }).toEqual({ slot, kid: true });
    }
  });

  it.each([['light', light], ['dark', dark]])('is one hue family: the accent\'s hue, a lightness step per key, the blocks inside darker (%s)', (name, theme) => {
    const accent = hue(name === 'light' ? '#1a73e8' : '#8ab4f8');
    let previous = Infinity;
    for (let slot = 1; slot <= TREEMAP_SLOTS; slot++) {
      expect(Math.abs(hue(theme[`tm-${slot}`]) - accent)).toBeLessThan(6);
      expect(Math.abs(hue(theme[`tm-${slot}-kid`]) - accent)).toBeLessThan(6);
      const here = luminance(theme[`tm-${slot}`]);
      expect(here).toBeLessThan(previous); // each key a step darker than the one before
      previous = here;
      expect(luminance(theme[`tm-${slot}-kid`])).toBeLessThan(here); // the blocks inside are darker than their cell
    }
  });

  it('gives each theme fills that stand apart from the panel colour (3:1)', () => {
    const surfaces = { light: '#ffffff', dark: '#1f1f1f' };
    for (const [name, theme] of [['light', light], ['dark', dark]]) {
      for (let slot = 1; slot <= TREEMAP_SLOTS; slot++) {
        expect({ name, slot, ok: contrast(theme[`tm-${slot}`], surfaces[name]) >= 3 }).toEqual({ name, slot, ok: true });
      }
    }
  });
});
