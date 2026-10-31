'use strict';

import { isRecordId, idChecksum, recordUrl } from '../../../src/core/data/record-id.js';

const ID15 = '0015g00000AbCdE';
const ID18 = '0015g00000AbCdEAAV'; // ends with the checksum of ID15

describe('isRecordId', () => {
  it('accepts 15 and 18 characters', () => {
    expect(isRecordId(ID15)).toBe(true);
    expect(isRecordId(ID18)).toBe(true);
  });

  it('accepts lower case', () => {
    expect(isRecordId('0015g00000abcde')).toBe(true);
  });

  it('checks the suffix of an 18-character Id against its first 15 characters', () => {
    expect(isRecordId('0015g00000AbCdEAAA')).toBe(false); // a wrong suffix
    expect(isRecordId('0015g00000AbCdEAAV')).toBe(true);
    expect(isRecordId('001D000000IRFmIIAX')).toBe(true);
    expect(isRecordId('001D000000IRFmIIAY')).toBe(false);
  });

  it('refuses a word of 15 or 18 letters that holds no digit in its first nine characters', () => {
    expect(isRecordId('RetirementPlans')).toBe(false); // 15
    expect(isRecordId('InternationalTrade')).toBe(false); // 18
    expect(isRecordId('ProductCatalog12')).toBe(false); // 16
    expect(isRecordId('ProductCatalogs')).toBe(false); // 15
  });

  it('refuses a word-shaped 18-character value even when it has a digit up front', () => {
    expect(isRecordId('Offer1PremiumPlans')).toBe(false); // 18 characters, wrong suffix
    expect(isRecordId('Plan9PremiumOffer1')).toBe(false);
  });

  it('refuses a value of only digits', () => {
    expect(isRecordId('123456789012345')).toBe(false);
    expect(isRecordId('123456789012345678')).toBe(false);
  });

  it('refuses other lengths, spaces and punctuation', () => {
    expect(isRecordId('0015g00000AbCd')).toBe(false);
    expect(isRecordId('0015g00000AbCdEA')).toBe(false);
    expect(isRecordId('0015g00000AbCdEAAVA')).toBe(false);
    expect(isRecordId(' 0015g00000AbCdE')).toBe(false);
    expect(isRecordId('0015g00000 AbCdE')).toBe(false);
    expect(isRecordId('0015g00000-AbCdE')).toBe(false);
  });

  it('refuses numbers, other types and empty text', () => {
    expect(isRecordId(123456789012345)).toBe(false);
    expect(isRecordId(null)).toBe(false);
    expect(isRecordId(undefined)).toBe(false);
    expect(isRecordId({})).toBe(false);
    expect(isRecordId('')).toBe(false);
  });
});

describe('idChecksum', () => {
  it('writes each group of five as its upper-case bits, first character lowest', () => {
    expect(idChecksum('001000000000001')).toBe('AAA');
    expect(idChecksum('0015g00000AbCdE')).toBe('AAV'); // A, C, E in the third group: 1 + 4 + 16 = 21
    expect(idChecksum('ZZZZZZZZZZZZZZZ')).toBe('555'); // 31 = the last of the 32 characters
    expect(idChecksum('00A00000000000a')).toBe('EAA'); // only the third character of the first group
  });
});

describe('recordUrl', () => {
  it('joins the origin and the Id', () => {
    expect(recordUrl('https://acme.lightning.force.com', ID18)).toBe(`https://acme.lightning.force.com/${ID18}`);
  });

  it('copes with a trailing slash on the origin', () => {
    expect(recordUrl('https://acme.lightning.force.com/', ID15)).toBe(`https://acme.lightning.force.com/${ID15}`);
  });

  it('gives nothing for an empty or unusable origin', () => {
    expect(recordUrl('', ID15)).toBe('');
    expect(recordUrl(undefined, ID15)).toBe('');
    expect(recordUrl('null', ID15)).toBe('');
    expect(recordUrl('javascript:alert(1)', ID15)).toBe('');
  });

  it('gives nothing for a value that is not an Id', () => {
    expect(recordUrl('https://acme.lightning.force.com', '123456789012345')).toBe('');
    expect(recordUrl('https://acme.lightning.force.com', 'a/../b')).toBe('');
    expect(recordUrl('https://acme.lightning.force.com', 12)).toBe('');
  });
});
