'use strict';

/* What the Structure tab hands the debug bundle. */

import { bootStructure, definition } from '../support/structure-page.js';

const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Email', type: 'Email', propSetMap: { required: true, label: 'Your email' } },
  { name: 'Company', propSetMap: { show: rule('Intro:Kind', '=', 'business') } },
  { name: 'Kind' }
] }];

const data = { Intro: { Email: '', Kind: 'personal', Company: 'Acme' } };
const dumpOf = (mask) => globalDumps(mask).structure;
let globalDumps;

beforeEach(async () => {
  const { Shared } = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  globalDumps = (mask) => Shared.dumps(mask);
});

describe('the Structure dump', () => {
  it('lists every element without its definition node, each with its value through the mask', () => {
    const dump = dumpOf((value) => (typeof value === 'string' && value ? '<string>' : value));
    expect(dump.elements.map((element) => element.name)).toEqual(['Intro', 'Email', 'Company', 'Kind']);
    dump.elements.forEach((element) => {
      expect(element).not.toHaveProperty('node');
      expect(element.validation === undefined || element.validation.raw === undefined).toBe(true);
    });
    const byName = Object.fromEntries(dump.elements.map((element) => [element.name, element]));
    expect(byName.Kind.value).toBe('<string>');
    expect(byName.Company.value).toBe('<string>');
    expect(byName.Email.value).toBe('');
    expect(byName.Email.label).toBe('Your email'); // the script's own text is not masked
    expect(() => JSON.stringify(dump)).not.toThrow();
  });

  it('says which elements are hidden and why, masking the sentence', () => {
    const plain = dumpOf((value) => value).visibility;
    const keyOf = (name) => dumpOf((value) => value).elements.find((element) => element.name === name).key;
    expect(plain[keyOf('Company')].hidden).toBe(true);
    expect(plain[keyOf('Company')].headline).toContain('Intro:Kind is "personal", not "business"');
    expect(plain[keyOf('Kind')]).toEqual({ hidden: false, headline: '' });

    const masked = dumpOf(() => '<masked>').visibility;
    expect(masked[keyOf('Company')].headline).toBe('<masked>');
    expect(JSON.stringify(masked)).not.toContain('personal');
  });
});
