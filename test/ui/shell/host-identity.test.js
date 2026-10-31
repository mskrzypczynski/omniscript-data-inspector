'use strict';

/* Two scripts on one page often share an element name, so a label alone
 * cannot tell that the host list shifted: the panel would read another
 * script's data until the next rescan. The key (Type/SubType/Language) is
 * compared too, in hostFetch, hostProps and hostHighlight. Names invented. */

import { hostScan, hostFetch, hostProps, hostHighlight } from '../../../src/ui/targets.js';

function host(type) {
  const node = document.createElement('c-omni');
  node.className = 'runtime';
  node.jsonDataStr = JSON.stringify({ who: type });
  node.jsonDef = JSON.stringify({ bpType: type, bpSubType: 'flow', bpLang: 'English' });
  return node;
}

function scanned(index) {
  const { hosts } = hostScan('jsonDataStr', 'jsonDef');
  return hosts[index];
}

function fetchFor(index, expected) {
  return hostFetch('jsonDataStr', 'jsonDef', index, 'jsonDataStr', '', null, null, expected.label, expected.key);
}

afterEach(() => { document.body.innerHTML = ''; delete window.__omniHosts; });

describe('a host inserted before the selected one', () => {
  it('is reported missing by hostFetch even when both share a label', () => {
    const first = host('alpha');
    const second = host('beta');
    document.body.append(first, second);
    const expected = scanned(1);
    expect(expected.label).toBe(scanned(0).label); // the label cannot tell them apart
    expect(fetchFor(1, expected).value).toContain('beta');

    document.body.insertBefore(host('gamma'), first); // index 1 is now alpha
    const result = fetchFor(1, expected);
    expect(result.missing).toBe(true);
    expect(result.value).toBeNull();
  });

  it('is reported missing by hostProps and hostHighlight', () => {
    const first = host('alpha');
    const second = host('beta');
    document.body.append(first, second);
    const expected = scanned(1);
    document.body.insertBefore(host('gamma'), first);
    hostScan('jsonDataStr', 'jsonDef'); // refreshes window.__omniHosts, as every read does

    expect(hostProps(1, 'jsonDef', expected.label, expected.key).missing).toBe(true);
    expect(hostHighlight(1, 'x', 'y', true, 'jsonDef', expected.label, expected.key).missing).toBe(true);
    expect(hostProps(2, 'jsonDef', expected.label, expected.key).missing).toBeUndefined();
  });
});

describe('a host removed before the selected one', () => {
  it('is reported missing by hostFetch', () => {
    const first = host('alpha');
    const second = host('beta');
    const third = host('gamma');
    document.body.append(first, second, third);
    const expected = scanned(1); // beta
    first.remove(); // index 1 is now gamma
    expect(fetchFor(1, expected).missing).toBe(true);
    expect(fetchFor(0, expected).value).toContain('beta');
  });
});

describe('hostFetch without a key', () => {
  it('still answers, as the older calls do', () => {
    document.body.append(host('alpha'));
    expect(hostFetch('jsonDataStr', 'jsonDef', 0, 'jsonDataStr').value).toContain('alpha');
  });

  it('compares an empty key for a host with no definition', () => {
    const bare = document.createElement('c-omni');
    bare.jsonDataStr = '{"a":1}';
    document.body.append(bare);
    const expected = scanned(0);
    expect(expected.key).toBe('');
    expect(fetchFor(0, expected).value).toBe('{"a":1}');
  });
});
