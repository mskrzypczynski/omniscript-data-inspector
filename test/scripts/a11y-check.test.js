'use strict';

import { allowedBy, blockingViolations } from '../../scripts/a11y-check.mjs';

const violation = (id, impact, ...targets) => ({
  id, impact, help: `${id} help`, nodes: targets.map((target) => ({ target: Array.isArray(target) ? target : [target] }))
});

describe('allowedBy', () => {
  const allow = [{ rule: 'color-contrast', selector: '.disclaimer', reason: 'x' }, { rule: 'label-title-only', reason: 'y' }];

  it('matches the rule and a part of the target', () => {
    expect(allowedBy(allow, 'color-contrast', 'footer > .disclaimer')).toBe(allow[0]);
    expect(allowedBy(allow, 'color-contrast', '.other')).toBeNull();
  });

  it('lets an entry without a selector cover the whole rule', () => {
    expect(allowedBy(allow, 'label-title-only', '#anything')).toBe(allow[1]);
  });

  it('does not let one rule\'s entry cover another rule', () => {
    expect(allowedBy(allow, 'region', '.disclaimer')).toBeNull();
  });
});

describe('blockingViolations', () => {
  it('keeps serious and critical findings and drops the rest', () => {
    const found = blockingViolations([
      violation('a', 'critical', '#one'), violation('b', 'serious', ['#two', '#in-frame']),
      violation('c', 'moderate', '#three'), violation('d', 'minor', '#four')
    ], []);
    expect(found.map((item) => [item.rule, item.target])).toEqual([['a', '#one'], ['b', '#two #in-frame']]);
  });

  it('leaves out what the allowlist covers and says which entries were used', () => {
    const allow = [{ rule: 'a', selector: '#one', reason: 'x' }, { rule: 'z', selector: '#unused', reason: 'y' }];
    const used = new Set();
    const found = blockingViolations([violation('a', 'serious', '#one', '#two')], allow, used);
    expect(found.map((item) => item.target)).toEqual(['#two']);
    expect([...used]).toEqual([allow[0]]);
  });
});
