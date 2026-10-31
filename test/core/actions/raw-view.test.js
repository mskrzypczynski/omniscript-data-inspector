'use strict';

import { rawView, rawRequestView, rawResponseView, withoutCredentials, isCredentialKey, NOT_KEPT, HIDDEN_FIELD } from '../../../src/core/actions/raw-view.js';
import { RAW_LIMIT } from '../../../src/core/shared/actions-model.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const call = (rawRequest, rawResponse) => ({ action: { rawRequest }, rawResponse });
const aura = { id: '1', descriptor: 'aura://ApexActionController/ACTION$execute', params: { classname: 'omnistudiocore.IPService', params: { input: '{"Name":"Ada"}' } } };

describe('the request', () => {
  it('is the object the page sent, as pretty JSON', () => {
    const view = rawRequestView(call(aura), undefined);
    expect(JSON.parse(view.text)).toEqual(aura);
    expect(view.text.split('\n').length).toBeGreaterThan(5);
    expect(view.note).toBe('');
  });

  it('is text as it was when the page sent text', () => {
    expect(rawRequestView(call('a=1&b=2'), undefined)).toEqual({ text: 'a=1&b=2', note: '' });
  });

  it('says it was not kept when the record has none', () => {
    expect(rawRequestView(call(undefined), undefined)).toEqual({ text: null, note: NOT_KEPT });
    expect(rawRequestView({}, undefined).note).toBe(NOT_KEPT);
    expect(rawRequestView(null, undefined).note).toBe(NOT_KEPT);
  });

  it('masks the values and keeps the structure while Mask values is on', () => {
    const view = rawRequestView(call(aura), maskValues);
    expect(view.text).not.toContain('Ada');
    expect(view.text).not.toContain('omnistudiocore');
    expect(view.text).toContain('"classname"');
  });

  it('shows no text that cannot be masked', () => {
    const view = rawRequestView(call('name=Ada'), maskValues);
    expect(view.text).toBeNull();
    expect(view.note).toMatch(/Mask values is on/);
  });

  it('leaves out credential-like fields, with or without masking, and says how many', () => {
    const vf = { action: 'Remote', method: 'run', data: ['a'], ctx: { csrf: 'abc123', vid: '066', authorization: 'Bearer xyz' } };
    [undefined, maskValues].forEach((mask) => {
      const view = rawRequestView(call(vf), mask);
      expect(view.text).not.toContain('abc123');
      expect(view.text).not.toContain('Bearer');
      expect(view.note).toBe('2 credential-like fields left out.');
    });
    expect(rawRequestView(call(vf), undefined).text).toContain(HIDDEN_FIELD);
    expect(rawRequestView(call({ 'aura.token': 't0k' }), undefined).note).toBe('1 credential-like field left out.');
  });
});

describe('withoutCredentials', () => {
  it('copies the value, hides only credential keys that hold something, and counts them', () => {
    const source = { token: 'x', nested: [{ sid: 's' }, { Name: 'Ada' }], csrf: '', password: null };
    const { value, hidden } = withoutCredentials(source);
    expect(value).toEqual({ token: HIDDEN_FIELD, nested: [{ sid: HIDDEN_FIELD }, { Name: 'Ada' }], csrf: '', password: null });
    expect(hidden).toBe(2);
    expect(source.token).toBe('x');
  });
});

describe('the response', () => {
  const body = '{"actions":[{"id":"1","state":"SUCCESS","returnValue":{"Name":"Ada"}}]}';

  it('lays JSON out for reading and leaves the guard out', () => {
    const view = rawResponseView(call(aura, `while(1);${body}`), undefined);
    expect(view.text).toBe(JSON.stringify(JSON.parse(body), null, 2));
    expect(view.note).toMatch(/guard/);
  });

  it('keeps the digits of a large number as the page wrote them', () => {
    const view = rawResponseView(call(aura, '{"id":12345678901234567890}'), undefined);
    expect(view.text).toContain('12345678901234567890');
  });

  it('shows text that is not JSON as it came', () => {
    expect(rawResponseView(call(aura, '<html>Down</html>'), undefined)).toEqual({ text: '<html>Down</html>', note: '' });
  });

  it('masks JSON, and shows no text it cannot mask', () => {
    expect(rawResponseView(call(aura, body), maskValues).text).not.toContain('Ada');
    const html = rawResponseView(call(aura, '<html>Ada</html>'), maskValues);
    expect(html.text).toBeNull();
    expect(html.note).toMatch(/not JSON/);
  });

  it('says "cut at 20 KB" when the kept text reached the limit', () => {
    const long = `{"a":"${'x'.repeat(RAW_LIMIT)}`.slice(0, RAW_LIMIT);
    const view = rawResponseView(call(aura, long), undefined);
    expect(view.text).toBe(long);
    expect(view.note).toBe('Cut at 20 KB: the rest was not kept.');
    expect(rawResponseView(call(aura, body), undefined).note).not.toMatch(/Cut/);
  });

  it('says it was not kept when the record has no text, and that an empty answer was empty', () => {
    expect(rawResponseView(call(aura, undefined), undefined)).toEqual({ text: null, note: NOT_KEPT });
    expect(rawResponseView(call(aura, ''), undefined)).toEqual({ text: null, note: 'The answer had no body.' });
    expect(rawResponseView(undefined, undefined).note).toBe(NOT_KEPT);
  });
});

describe('rawView', () => {
  it('holds both sides', () => {
    const view = rawView(call(aura, '{"ok":true}'), undefined);
    expect(Object.keys(view)).toEqual(['request', 'response']);
    expect(view.response.text).toContain('"ok": true');
  });
});

/* ------------------------------------------------ credentials, round 7 review */

const SHOWN_KEYS = ['vid', 'ns', 'tid', 'Name', 'ver', 'Amount', 'Author', 'AccountId', 'statusCode', 'type', 'Description', 'bundleName'];
const HIDDEN_KEYS = [
  'csrfToken', 'X-CSRF-Token', '_csrf', 'refresh_token', 'refreshToken', 'sessionToken', 'apiKey', 'client_secret', 'jwt', 'bearer', 'sfdcSession',
  'aura.token', 'token', 'access_token', 'id_token', 'authorization', 'Authorization', 'session_id', 'SessionId', 'sid', 'password', 'secret', 'cookie',
  'csrf', 'CSRFToken', 'api_key', 'API-Key', 'xsrf-token', 'oauthToken'
];

describe('which keys are credentials', () => {
  it.each(HIDDEN_KEYS)('hides %s', (key) => {
    expect(isCredentialKey(key)).toBe(true);
    const { value, hidden } = withoutCredentials({ [key]: 'INVENTED-VALUE', other: 1 });
    expect(value[key]).toBe(HIDDEN_FIELD);
    expect(hidden).toBe(1);
  });

  it.each(SHOWN_KEYS)('leaves %s visible', (key) => {
    expect(isCredentialKey(key)).toBe(false);
    expect(withoutCredentials({ [key]: 'x' }).value[key]).toBe('x');
  });
});

describe('credentials in the answer', () => {
  const answer = '[{"statusCode":200,"tid":7,"result":{"Name":"Zed Example","sessionId":"SESSION-INVENTED-CCC","csrfToken":"CSRF-INVENTED-DDD"}}]';

  [['off', undefined], ['on', maskValues]].forEach(([state, mask]) => {
    it(`never reaches the text with Mask values ${state}, and the note counts them`, () => {
      const view = rawResponseView(call(aura, answer), mask);
      expect(view.text).not.toContain('SESSION-INVENTED-CCC');
      expect(view.text).not.toContain('CSRF-INVENTED-DDD');
      expect(view.text).toContain(HIDDEN_FIELD);
      expect(view.text).toContain('"statusCode"');
      expect(view.note).toContain('2 credential-like fields left out.');
    });
  });

  it('keeps the page\'s own layout when nothing had to go', () => {
    const text = '{"id":12345678901234567890,"Name":"Ada"}';
    const view = rawResponseView(call(aura, text), undefined);
    expect(view.text).toContain('12345678901234567890');
    expect(view.note).toBe('Laid out for reading.');
  });

  it('hides a credential in text that is not JSON, a cut answer included', () => {
    const cutAnswer = `{"Name":"Ada","sessionId":"SESSION-INVENTED-EEE","pad":"${'x'.repeat(RAW_LIMIT)}`.slice(0, RAW_LIMIT);
    const view = rawResponseView(call(aura, cutAnswer), undefined);
    expect(view.text).not.toContain('SESSION-INVENTED-EEE');
    expect(view.note).toBe('1 credential-like field left out. Cut at 20 KB: the rest was not kept.');
    const endsInside = '{"Name":"Ada","sessionId":"SESSION-INV';
    expect(rawResponseView(call(aura, endsInside), undefined).text).toBe('{"Name":"Ada","sessionId":"<hidden>"');
  });

  it('hides a credential written escaped inside a cut string (a Visualforce result)', () => {
    const inner = `{"Name":"Ada","sessionId":"SESS-BIG","csrfToken":"CSRF-BIG","pad":"${'y'.repeat(RAW_LIMIT)}`;
    const cut = `[{"statusCode":200,"tid":7,"result":${JSON.stringify(inner)}`.slice(0, RAW_LIMIT);
    expect(cut).toContain('\\"sessionId\\":\\"SESS-BIG\\"');
    const view = rawResponseView(call(aura, cut), undefined);
    expect(view.text).not.toContain('SESS-BIG');
    expect(view.text).not.toContain('CSRF-BIG');
    expect(view.text).toContain('\\"sessionId\\":\\"<hidden>\\"');
    expect(view.text).toContain('\\"Name\\":\\"Ada\\"');
    expect(view.note).toBe('2 credential-like fields left out. Cut at 20 KB: the rest was not kept.');
  });

  it('hides an escaped credential two levels down, and one the cut ends inside', () => {
    const twice = JSON.stringify(JSON.stringify({ sessionId: 'SESS-DEEP', Name: 'Ada' }));
    const view = rawResponseView(call(aura, `[{"result":${twice}`), undefined);
    expect(view.text).not.toContain('SESS-DEEP');
    expect(view.note).toBe('1 credential-like field left out.');
    const ends = rawResponseView(call(aura, '[{"result":"{\\"refresh_token\\":\\"TOK-CUT'), undefined);
    expect(ends.text).not.toContain('TOK-CUT');
    expect(ends.text).toContain('<hidden>');
  });

  it('leaves escaped pairs of other keys alone', () => {
    const text = '[{"result":"{\\"Name\\":\\"Ada\\",\\"vid\\":\\"06600000000demo\\"';
    const view = rawResponseView(call(aura, text), undefined);
    expect(view.text).toBe(text);
    expect(view.note).toBe('');
  });

  it('knows private and access keys, signatures and one-time codes as credentials', () => {
    ['privateKey', 'private_key', 'accessKey', 'access-key', 'signature', 'otp', 'Signature'].forEach((key) => {
      expect(isCredentialKey(key)).toBe(true);
    });
    ['key', 'keyName', 'primaryKey', 'otpion'].forEach((key) => expect(isCredentialKey(key)).toBe(false));
  });

  it('shows <hidden> in the request with Mask values on, not a placeholder', () => {
    const vf = { action: 'Remote', method: 'run', data: ['a'], ctx: { csrf: 'abc123', vid: '066', authorization: 'Bearer xyz' } };
    const view = rawRequestView(call(vf), maskValues);
    expect(view.text).toContain('"csrf": "<hidden>"');
    expect(view.text).toContain('"authorization": "<hidden>"');
    expect(view.note).toBe('2 credential-like fields left out.');
  });
});

describe('an Aura error answer', () => {
  const failure = '*/{"exceptionEvent":true,"event":{"descriptor":"markup://aura:systemError","attributes":{"values":{"message":"Demo failure"}}}}/*ERROR*/';

  it('is laid out like any JSON, with Mask values off and on', () => {
    const plain = rawResponseView(call(aura, failure), undefined);
    expect(plain.text.split('\n').length).toBeGreaterThan(3);
    expect(plain.text).toContain('"exceptionEvent": true');
    expect(plain.note).toMatch(/error wrapper/);
    const masked = rawResponseView(call(aura, failure), maskValues);
    expect(masked.text).not.toContain('Demo failure');
    expect(masked.text).toContain('"exceptionEvent": true');
  });

  it('says a cut answer cannot be masked, not that it is not JSON', () => {
    const cutAnswer = `{"returnValue":"${'x'.repeat(RAW_LIMIT)}`.slice(0, RAW_LIMIT);
    const view = rawResponseView(call(aura, cutAnswer), maskValues);
    expect(view.text).toBeNull();
    expect(view.note).toBe('Cut at 20 KB, so its values cannot be masked.');
  });
});

describe('credentials inside JSON text', () => {
  it('are hidden in a Visualforce answer whose result is text, and the text is written again', () => {
    const inner = JSON.stringify({ Name: 'Zed Example', sessionId: 'SESSION-INVENTED-FFF', nested: { apiKey: 'KEY-INVENTED-GGG' } });
    const answer = JSON.stringify([{ statusCode: 200, tid: 3, result: inner }]);
    const view = rawResponseView(call(aura, answer), undefined);
    expect(view.text).not.toContain('SESSION-INVENTED-FFF');
    expect(view.text).not.toContain('KEY-INVENTED-GGG');
    expect(view.text).toContain('Zed Example');
    expect(view.note).toContain('2 credential-like fields left out.');
  });

  it('leaves JSON text that holds nothing to hide exactly as it was', () => {
    const { value, hidden } = withoutCredentials({ result: '{"Name":"Ada"}', note: '[not json' });
    expect(value).toEqual({ result: '{"Name":"Ada"}', note: '[not json' });
    expect(hidden).toBe(0);
  });
});
