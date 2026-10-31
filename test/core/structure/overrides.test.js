'use strict';

import { flatten, overrideOf } from '../../../src/core/shared/structure-model.js';
import {
  overrideTitle, overriddenElements, componentKey, overrideQuery, matchesOverride, OVERRIDE_EXPLAIN
} from '../../../src/core/structure/overrides.js';
import { filterElements, noMatchText } from '../../../src/core/structure/element-filter.js';
import { scriptSummary } from '../../../src/core/structure/script-summary.js';
import { customComponents, stepStoppers } from '../../../src/core/structure/step-validation.js';
import { computeVisibility } from '../../../src/core/structure/visibility.js';

const el = (name, type, propSetMap = {}) => ({ name, type, propSetMap });
const build = (elements) => flatten({
  children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: elements }] }]
}, null);

const script = () => build([
  el('Plain', 'Text'),
  el('Postcode', 'Text', { lwcComponentOverride: 'c-postcode-lookup' }),
  el('Toggle', 'Checkbox', { lwcOverride: 'newsletterToggle' }),
  el('Blank', 'Text', { lwcComponentOverride: '   ' })
]);

describe('overrideOf', () => {
  it('reads lwcComponentOverride, then lwcOverride, trimmed', () => {
    expect(overrideOf({ lwcComponentOverride: ' c-my-input ' })).toBe('c-my-input');
    expect(overrideOf({ lwcOverride: 'myInput' })).toBe('myInput');
    expect(overrideOf({ lwcComponentOverride: 'a', lwcOverride: 'b' })).toBe('a');
  });

  it('is empty for nothing, blank text or a value that is not text', () => {
    expect(overrideOf(undefined)).toBe('');
    expect(overrideOf({})).toBe('');
    expect(overrideOf({ lwcComponentOverride: '  ' })).toBe('');
    expect(overrideOf({ lwcComponentOverride: true })).toBe('');
  });

  it('is on every flattened element', () => {
    expect(script().map((element) => element.override)).toEqual(['', '', 'c-postcode-lookup', 'newsletterToggle', '']);
  });
});

describe('overrides', () => {
  it('lists the overridden elements in script order', () => {
    expect(overriddenElements(script()).map((element) => element.name)).toEqual(['Postcode', 'Toggle']);
    expect(overriddenElements(undefined)).toEqual([]);
  });

  it('says what the override means in the tooltip', () => {
    const [postcode] = overriddenElements(script());
    expect(overrideTitle(postcode)).toBe(`Overridden by c-postcode-lookup: ${OVERRIDE_EXPLAIN}`);
    expect(overrideTitle(postcode)).toContain('its own markup and validation run instead of the standard element');
  });

  it('treats the kebab tag and the camel name as one component', () => {
    expect(componentKey('c-my-custom-input')).toBe(componentKey('myCustomInput'));
    expect(componentKey('c:myCustomInput')).toBe('mycustominput');
  });

  it('reads the override: prefix of the filter box', () => {
    expect(overrideQuery('override:')).toBe('');
    expect(overrideQuery('  Override: c-my-input ')).toBe('c-my-input');
    expect(overrideQuery('override')).toBeNull();
    expect(overrideQuery('postcode')).toBeNull();
  });

  it('matches by component name in either spelling', () => {
    const [postcode, toggle] = overriddenElements(script());
    expect(matchesOverride(postcode, '')).toBe(true);
    expect(matchesOverride(postcode, 'postcodeLookup')).toBe(true);
    expect(matchesOverride(postcode, 'c-postcode')).toBe(true);
    expect(matchesOverride(toggle, 'newsletter-toggle')).toBe(true);
    expect(matchesOverride(toggle, 'postcode')).toBe(false);
    expect(matchesOverride({ override: '' }, '')).toBe(false);
  });
});

describe('the filter box with override:', () => {
  it('lists only overridden elements', () => {
    expect(filterElements(script(), { query: 'override:' }).map((element) => element.name)).toEqual(['Postcode', 'Toggle']);
  });

  it('narrows to a component by name', () => {
    expect(filterElements(script(), { query: 'override:newsletter' }).map((element) => element.name)).toEqual(['Toggle']);
  });

  it('says what it found nothing for', () => {
    expect(noMatchText({ query: 'override:' })).toBe('No element is overridden by a custom component');
    expect(noMatchText({ query: 'override:nothing' })).toBe('No element is overridden by “nothing”');
  });

  it('leaves an ordinary query alone', () => {
    expect(filterElements(script(), { query: 'plain' }).map((element) => element.name)).toEqual(['Plain']);
  });
});

describe('the summary', () => {
  it('has an Overridden row with each element, only while there are any', () => {
    const row = scriptSummary({}, script()).rows.find((candidate) => candidate.id === 'overridden');
    expect(row.label).toBe('Overridden: 2');
    expect(row.items.map((item) => item.text)).toEqual(['Postcode', 'Toggle']);
    expect(row.items[0].key).toBe(script().find((element) => element.name === 'Postcode').key);
    expect(row.items[0].title).toContain('Overridden by c-postcode-lookup');

    const none = scriptSummary({}, build([el('Plain', 'Text')]));
    expect(none.rows.find((candidate) => candidate.id === 'overridden')).toBeUndefined();
  });
});

describe('what may stop Next', () => {
  it('counts an overridden standard element with the custom components, and says by what', () => {
    const elements = script();
    const step = elements.find((element) => element.name === 'Intro');
    const found = customComponents(elements, step.key, {}, computeVisibility(elements, {}));
    expect(found.map((item) => item.name)).toEqual(['Postcode', 'Toggle']);
    expect(found.map((item) => item.overriddenBy)).toEqual(['c-postcode-lookup', 'newsletterToggle']);
    expect(stepStoppers(elements, step.key, {}, computeVisibility(elements, {})).custom).toHaveLength(2);
  });

  it('does not say overriddenBy for a custom component that overrides nothing', () => {
    const elements = build([el('Widget', 'Custom Lightning Web Component')]);
    const [widget] = customComponents(elements, elements[0].key, {}, computeVisibility(elements, {}));
    expect(widget).not.toHaveProperty('overriddenBy');
  });
});
