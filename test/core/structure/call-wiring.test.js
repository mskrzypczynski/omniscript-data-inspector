'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { callWiring, pathSegments } from '../../../src/core/structure/call-wiring.js';

const wiringOf = (type, propSetMap) => {
  const list = flatten({
    children: [{ name: 'S', type: 'Step', propSetMap: {}, children: [{ eleArray: [{ name: 'Act', type, propSetMap }] }] }]
  }, null);
  return callWiring(list.find((e) => e.name === 'Act'));
};

describe('pathSegments', () => {
  it('splits a JSONPath into keys and drops repeat positions', () => {
    expect(pathSegments('Step1:Block|2:Field')).toEqual(['Step1', 'Block', 'Field']);
    expect(pathSegments('Result')).toEqual(['Result']);
    expect(pathSegments('%Step1:Field%')).toEqual(['Step1', 'Field']);
    expect(pathSegments(' a : b ')).toEqual(['a', 'b']);
  });
  it('is empty for nothing', () => {
    expect(pathSegments('')).toEqual([]);
    expect(pathSegments(undefined)).toEqual([]);
  });
});

describe('callWiring', () => {
  it('is null for an element that is not an action and has none of the keys', () => {
    expect(wiringOf('Text', { label: 'x' })).toBeNull();
    expect(callWiring(null)).toBeNull();
  });

  it('says the whole data is sent and that no response node is set, for a bare action', () => {
    const wiring = wiringOf('Integration Procedure Action', { integrationProcedureKey: 'Acme_Find' });
    expect(wiring.sends.line).toBe('Sends: the whole data');
    expect(wiring.sends.segments).toBeNull();
    expect(wiring.lands.line).toBe('Response node: none set · the answer lands in the data root');
    expect(wiring.lands.segments).toBeNull();
    expect(wiring.remote).toBe('Acme_Find');
    expect(wiring.failure).toEqual([]);
  });

  it('reads the send side: path, node and extra payload', () => {
    const wiring = wiringOf('DataRaptor Post Action', {
      bundle: 'Acme_Save',
      sendJSONPath: 'Step1:Customer',
      sendJSONNode: 'Payload',
      extraPayload: { Mode: 'full', Dry: false }
    });
    expect(wiring.sends).toMatchObject({
      value: 'Step1:Customer', note: ' as Payload, plus extra payload: Mode, Dry', segments: ['Step1', 'Customer'],
      line: 'Sends: Step1:Customer as Payload, plus extra payload: Mode, Dry'
    });
  });

  it('sends only the extra payload when it is told to, whatever the path', () => {
    const wiring = wiringOf('Integration Procedure Action', {
      integrationProcedureKey: 'A_B', sendOnlyExtraPayload: true, sendJSONPath: 'Step1', extraPayload: { Id: '1' }
    });
    expect(wiring.sends).toMatchObject({ value: 'only the extra payload', note: ' (Id)', segments: null });
    expect(wiring.sends.line).toBe('Sends: only the extra payload (Id)');
  });

  it('accepts "true" as text and an extra payload kept as JSON text', () => {
    const wiring = wiringOf('Integration Procedure Action', {
      sendOnlyExtraPayload: 'true', extraPayload: '{"A":1,"B":2}'
    });
    expect(wiring.sends.line).toBe('Sends: only the extra payload (A, B)');
  });

  it('ignores an extra payload that is not an object', () => {
    expect(wiringOf('Integration Procedure Action', { extraPayload: '[1]' }).sends.line).toBe('Sends: the whole data');
    expect(wiringOf('Integration Procedure Action', { extraPayload: 'nope' }).sends.line).toBe('Sends: the whole data');
    expect(wiringOf('Integration Procedure Action', { extraPayload: {} }).sends.line).toBe('Sends: the whole data');
  });

  it('reads the response side: node, and path into the response', () => {
    const wiring = wiringOf('Integration Procedure Action', { responseJSONNode: 'Step2:Result', responseJSONPath: 'data.items' });
    expect(wiring.lands).toMatchObject({
      value: 'Step2:Result', note: ' (from data.items of the response)', segments: ['Step2', 'Result'],
      line: 'Response node: Step2:Result (from data.items of the response)'
    });
  });

  it('explains the response node in a tooltip', () => {
    const wiring = wiringOf('Remote Action', { remoteClass: 'Acme' });
    expect(wiring.lands.title).toContain('data root');
  });

  it('says what it takes when only a response path is set', () => {
    const wiring = wiringOf('Remote Action', { remoteClass: 'Acme', responseJSONPath: 'rows' });
    expect(wiring.lands.line).toBe('Response node: none set · takes rows of the response, the answer lands in the data root');
    expect(wiring.lands.segments).toBeNull();
  });

  it('lists the failure settings that are present', () => {
    const wiring = wiringOf('Integration Procedure Action', {
      integrationProcedureKey: 'A_B', failureNextStep: 'Retry', failureResponse: { Error: 'x' }
    });
    expect(wiring.failure).toEqual([
      { label: 'On failure goes to', value: 'Retry' },
      { label: 'On failure responds with', value: '{"Error":"x"}' }
    ]);
  });

  it('is shown for a non-action element that names a wiring key', () => {
    expect(wiringOf('Text', { sendJSONPath: 'Step1' }).sends.value).toBe('Step1');
  });

  it('copes with blank and odd values', () => {
    const wiring = wiringOf('Remote Action', {
      sendJSONPath: '  ', sendJSONNode: 5, responseJSONNode: null, failureNextStep: '  ', failureResponse: 7
    });
    expect(wiring.sends.line).toBe('Sends: the whole data');
    expect(wiring.lands.line).toBe('Response node: none set · the answer lands in the data root');
    expect(wiring.failure).toEqual([]);
  });
});
