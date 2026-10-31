'use strict';

/* Invented designer previews (Visualforce remoting) for the Calls
 * tests: the request and the answer of an Integration Procedure preview and of
 * a DataRaptor preview. Every name, Id and host is made up. */

export const VF_URL = 'https://demo.example.invalid/apexremote';
export const IP_ID = 'a0A000000000001AAA';
export const ACCOUNT_ID = '001000000000001AAA';

export const CTX = { csrf: 'csrf-demo-token', vid: '06600000000demo', ns: 'ns', ver: 66, authorization: 'auth-demo-token' };

export function ipPreviewCall({ tid = 12, klass = 'ns.OmniScriptDesignerController', input = { ContextId: ACCOUNT_ID }, options, ctx = CTX } = {}) {
  return {
    action: klass,
    method: 'testIntegrationProcedure',
    data: [IP_ID, JSON.stringify(input), options || {
      isDebug: true, chainable: false, resetCache: false, ignoreCache: true, queueableChainable: false, useQueueableApexRemoting: false
    }],
    type: 'rpc',
    tid,
    ctx
  };
}

export function drPreviewCall({ tid = 24, klass = 'ns.DRMapperControllerFoundation', input = { accountId: ACCOUNT_ID }, ctx = CTX } = {}) {
  return {
    action: klass,
    method: 'drPreviewExecute',
    data: [{
      bundleName: 'DRDemoGetAccount', inputType: 'JSON', interfaceType: 'Extract',
      objectList: JSON.stringify(input), ignoreCache: true, bulkUpload: false, debug: true
    }],
    type: 'rpc',
    tid,
    ctx
  };
}

/* The debug log of the Integration Procedure run, in the order it was written. */
export const IP_LOG = [
  '2026-03-02T09:15:00.000Z: Run started',
  `2026-03-02T09:15:00.037Z: Query: SELECT Id, Name FROM Account WHERE Id = '${ACCOUNT_ID}' AND Name = 'Demo Corp'`,
  '2026-03-02T09:15:00.052Z: Query results found: 1',
  '2026-03-02T09:15:00.060Z: Query time: 14',
  '2026-03-02T09:15:00.410Z: Time in Server: 410'
];

export function ipFullData({ failSecondStep = false } = {}) {
  return {
    originalInput: { ContextId: ACCOUNT_ID },
    response: { total: 120, currency: 'EUR' },
    executionSequence: ['GetAccount', 'SetTotals', 'CallRating'],
    elapsedTimeActual: 410,
    elapsedTimeCPU: 95,
    debugLog: IP_LOG,
    isDebug: true,
    vlcPersistentComponent: { noise: true },
    GetAccount: { Name: 'Demo Corp', Address: { City: 'Demo City', Lines: ['1 Demo Street'] } },
    GetAccountDebug: {
      Status: 'Success', Type: 'DataRaptor Extract Action', ElapsedTime: 120, ElapsedTimeCPU: 30,
      Input: { accountId: ACCOUNT_ID }, Options: { bundle: 'DRDemoGetAccount' }
    },
    SetTotals: { total: 120 },
    SetTotalsDebug: {
      Status: failSecondStep ? 'Error' : 'Success', Type: 'Set Values', ElapsedTime: 10, ElapsedTimeCPU: 2, Input: {}, Options: {}
    },
    CallRating: { rating: 'A' },
    CallRatingDebug: {
      Status: 'Success', Type: 'HTTP Action', ElapsedTime: 240, ElapsedTimeCPU: 60, Input: { name: 'Demo Corp' }, Options: { method: 'POST' }
    }
  };
}

export const DR_LOG = [
  '2026-03-02T09:20:00.000Z: Run started',
  `2026-03-02T09:20:00.021Z: Query: SELECT Id FROM Account WHERE Id = '${ACCOUNT_ID}'`,
  '2026-03-02T09:20:00.030Z: Query results found: 1'
];

export function drResult({ error = null } = {}) {
  return {
    ActualTime: 48,
    CpuTime: 20,
    debugLog: DR_LOG,
    returnResultsData: { Account: [{ Name: 'Demo Corp', Id: ACCOUNT_ID }] },
    responseType: 'JSON',
    hasErrors: !!error,
    errorsAsJson: { DRError: error },
    interfaceInfo: { DRDemoGetAccount: 'JSON' },
    errorsByField: {},
    errors: [],
    createdObjectsByOrder: [],
    createdObjectsByType: {}
  };
}

/* A remoting answer to the call with this tid; result goes over the wire as text. */
export function remotingAnswer(tid, result, extra = {}) {
  return JSON.stringify([{ statusCode: 200, type: 'rpc', tid, ref: false, action: 'ns.X', method: 'y', result: JSON.stringify(result), ...extra }]);
}

/* The network entry the DevTools stream hands over for a preview. */
export function vfNetworkEntry({ call, text, status = 200, time = 410, headers = [{ name: 'Content-Type', value: 'application/json' }], startedDateTime = '2026-03-02T09:15:00Z' }) {
  return {
    request: { url: VF_URL, method: 'POST', headers, postData: { text: JSON.stringify(call) } },
    response: { status, bodySize: text.length },
    time,
    startedDateTime: new Date(startedDateTime).toISOString(),
    getContent: (callback) => callback(text)
  };
}

/* The answer of an Integration Procedure a page called (Aura, LWR) with
 * isDebug: true in its options: the run sits under IPResult, beside a
 * fullDataJson that holds only the procedure's data (its nodes, <Name>Status
 * flags, response and options). One block reports its Status as a flag, not
 * a word, and one hands its Input over as JSON text, as orgs do. */
export function ipDebugAnswer({ failSecondStep = false } = {}) {
  return {
    IPResult: {
      fullDataJson: {
        response: { total: 120, currency: 'EUR' },
        GetAccount: { Name: 'Demo Corp' },
        GetAccountStatus: true,
        SetTotals: { total: 120 },
        SetTotalsStatus: !failSecondStep,
        CallRatingStatus: true,
        options: { chainable: true, isDebug: true, resetCache: false }
      },
      GetAccount: { Name: 'Demo Corp', Address: { City: 'Demo City', Lines: ['1 Demo Street'] } },
      GetAccountDebug: {
        Status: true, Type: 'DataRaptor Extract Action', ElapsedTime: 120, ElapsedTimeCPU: 30,
        Input: { accountId: ACCOUNT_ID }, Options: { bundle: 'DRDemoGetAccount' }
      },
      SetTotals: { total: 120 },
      SetTotalsDebug: {
        Status: failSecondStep ? 'Error' : 'Success', Type: 'Set Values', ElapsedTime: 10, ElapsedTimeCPU: 2,
        Input: JSON.stringify({ total: 120 })
      },
      CallRating: { rating: 'A' },
      CallRatingDebug: {
        Status: 'Success', Type: 'HTTP Action', ElapsedTime: 240, ElapsedTimeCPU: 60, Input: { name: 'Demo Corp' }, Options: { method: 'POST' }
      },
      elapsedTimeCPU: 95,
      elapsedTimeActual: 410,
      executionSequence: ['GetAccount', 'SetTotals', 'CallRating'],
      response: { total: 120, currency: 'EUR' },
      originalInput: { ContextId: ACCOUNT_ID },
      debugLog: IP_LOG
    },
    error: null
  };
}

/* What the same procedure answers without isDebug: only its data under IPResult. */
export function ipPlainAnswer() {
  return { IPResult: { total: 120, currency: 'EUR', rating: 'A' }, error: null };
}
