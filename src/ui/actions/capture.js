'use strict';

/* Calls: capture. Listens to the DevTools network stream, decodes the
 * Apex calls OmniStudio makes and puts each in the tab's list. A remote action
 * reaches the server as an Aura ApexAction wrapping
 * { sClassName, sMethodName, input, options }, so one HTTP request can carry
 * several actions: each becomes its own row. */

import { classify, parseRequest, decodeResponse, buildActionRecord } from '../../core/shared/actions-model.js';
import { pruneMarks } from '../../core/actions/actions-selection.js';
import { isChainId } from '../../core/actions/actions-chains.js';
import { admit, undecodedNote, MAX_ENTRIES } from '../../core/actions/actions-capture.js';
import { envelopeOf, rememberEnvelope, testTokenOf, TEST_HEADER } from '../../core/actions/call-wire.js';
import { resolveTest, dropStale } from '../../core/actions/test-calls.js';

export { MAX_ENTRIES };

/* state: the tab's state. redraw(drawList): the tab's redraw. */
export function createCapture({ state, redraw }) {
  /* Requests finish in the order their answers arrive, not the order they were
   * sent, so a call goes where its start time puts it: "previous call", the span
   * and the step column all read the list as a time line. */
  function insert(record) {
    const { entries, dropped } = admit(state.entries, record);
    state.entries = entries;
    if (dropped.length) forget(dropped);
  }

  /* Calls went to stay within the caps, and so does everything that pointed at
   * them. Losing only calls that are not OmniStudio's is no loss to a list that
   * shows only OmniStudio's, so it does not set the status bar's note. */
  function forget(dropped) {
    if (dropped.some((entry) => entry.omni)) state.droppedOmni = true;
    state.dropped = true;
    state.marked = pruneMarks(state.marked, state.entries);
    state.openErrors = pruneMarks(state.openErrors, state.entries);
    state.debugOpen.forEach((open, id) => { if (!state.entries.some((entry) => entry.id === id)) state.debugOpen.delete(id); });
    const alive = (id) => state.entries.some((entry) => entry.id === id);
    // A chain keeps being selected as long as it exists; redraw finds out.
    if (state.selectedId !== null && !isChainId(state.selectedId) && !alive(state.selectedId)) state.selectedId = null;
    if (state.compareId !== null && !alive(state.compareId)) state.compareId = null;
    if (state.markAnchor !== null && !alive(state.markAnchor)) state.markAnchor = null;
  }

  /* The latest request of each kind, per origin, is what a test call is built
   * from. A request that is itself a test call is not a model: it holds what
   * the user edited. Only the request is kept, never an answer. */
  function rememberModel(kind, request, actions) {
    if (testTokenOf(request.headers)) return;
    const envelope = envelopeOf(kind, request, actions);
    if (envelope) state.envelopes = rememberEnvelope(state.envelopes, envelope);
  }

  /* A call the panel sent is marked, so the list can say which calls are its
   * own: by the header the request carried, else by being the next call with
   * the signature of a send (core resolveTest). */
  function tagTest(record, request, startedMs) {
    const pending = dropStale(state.pendingTests, Date.now());
    const found = resolveTest(request.headers, record.signature, startedMs, pending);
    state.pendingTests = found.pending;
    if (found.test) record.test = found.test;
  }

  /* A call the panel sent is listed once: by the answer the page handed back
   * (recordSent) or by the network stream, whichever comes first (the token
   * tells them apart). */

  /* The action a request carries when the parser reads nothing from it: the
   * row still shows the answer, so the tester sees what came back. */
  const undecodedAction = (postText) => ({ descriptor: 'test', apexClass: '', apexMethod: '', namespace: '', remoteClass: 'Test call', remoteMethod: 'request not decoded', input: undecodedNote(postText), options: null });

  const CUT_NOTE = 'The answer was longer than 2 MB, so the panel did not keep it. The Network tab of DevTools has all of it.';

  /* A row listed from an answer the page cut at 2 MB is replaced when the
   * network stream brings the whole answer: same token, and whatever pointed
   * at the old row now points at the new one. */
  function retire(oldRows, replacementId) {
    const oldIds = oldRows.map((entry) => entry.id);
    state.entries = state.entries.filter((entry) => !oldIds.includes(entry.id));
    if (oldIds.includes(state.selectedId)) state.selectedId = replacementId;
    if (oldIds.includes(state.compareId)) state.compareId = replacementId;
    state.marked = pruneMarks(state.marked, state.entries);
    state.openErrors = pruneMarks(state.openErrors, state.entries);
  }

  /* The answer to a call the panel sent, as the page handed it back:
   * sent = { kind, request: { url, method, body }, token, status, text, truncated, ms, sentAt }.
   * It becomes rows like a captured call, tagged as the test it was, whatever
   * Recording says: a call the user sent is never dropped. An answer the page
   * cut at 2 MB is listed with no body (not as a failure it is not) and the
   * tag "answer cut at 2 MB". Returns the rows it added (none when the network
   * stream listed the call first). */
  function recordSent(sent) {
    if (state.session) return [];
    const have = state.entries.filter((entry) => entry.test && entry.test.token === sent.token);
    if (have.length) return have.map((entry) => entry.id); // the network stream listed it first
    const kind = sent.kind || classify(sent.request.url || '', sent.request.method) || 'aura';
    const body = typeof sent.request.body === 'string' ? sent.request.body : '';
    let actions = parseRequest(kind, body, sent.request.url);
    const unparsed = !actions.length;
    if (unparsed) actions = [undecodedAction(body)];
    const full = typeof sent.text === 'string' ? sent.text : '';
    const cut = sent.truncated === true;
    const responseText = cut ? '' : full;
    const responseBody = decodeResponse(responseText).body;
    const startedAt = new Date(sent.sentAt || Date.now());
    const requestMeta = {
      url: sent.request.url,
      startedAt,
      // The fetch as the page timed it; the panel's own polling is not part of the call.
      durationMs: typeof sent.ms === 'number' ? Math.max(0, sent.ms) : Math.max(0, Date.now() - startedAt.getTime()),
      httpStatus: sent.status || 0,
      bodySize: full.length,
      timings: undefined,
      responseText,
      requestId: ++state.reqSeq,
      batchSize: actions.length
    };
    const headers = [{ name: TEST_HEADER, value: sent.token }];
    const added = [];
    actions.forEach((action, index) => {
      const record = buildActionRecord(++state.seq, kind, action, index, responseBody, requestMeta);
      if (unparsed) record.omni = true;
      tagTest(record, { headers }, requestMeta.startedAt.getTime());
      if (cut && record.test) {
        record.test.truncated = true;
        if (!record.responseNote) record.responseNote = CUT_NOTE;
      }
      insert(record);
      added.push(record);
    });
    redraw(state.active);
    return added.map((record) => record.id);
  }

  function onRequestFinished(networkEntry) {
    // A loaded session is a file, not the page: nothing the page does is added to it.
    if (state.session) return;

    const request = networkEntry.request || {};
    const testToken = testTokenOf(request.headers);
    // Paused: the page's own calls are left out, but a call the panel sent is not.
    if (!state.recording && !testToken) return;
    let kind = classify(request.url || '', request.method);
    if (!kind && !testToken) return;

    const postText = (request.postData && request.postData.text) || '';
    let actions = kind ? parseRequest(kind, postText, request.url) : [];
    /* A call the panel itself sent is never dropped on the floor: when its
     * request is not in a shape the parser reads, the row still shows the
     * answer, so the tester sees what came back and why nothing was decoded. */
    const unparsed = !actions.length && !!testToken;
    if (unparsed) {
      kind = kind || 'aura';
      actions = [undecodedAction(postText)];
    }
    if (!actions.length) return;
    const requestId = ++state.reqSeq;
    if (!unparsed) rememberModel(kind, request, actions);

    networkEntry.getContent((content) => {
      if (state.session) return; // a session was opened while the answer was on its way
      const responseText = typeof content === 'string' ? content : '';
      const responseBody = decodeResponse(responseText).body;
      const requestMeta = {
        url: request.url,
        startedAt: new Date(networkEntry.startedDateTime || Date.now()),
        durationMs: Math.round(networkEntry.time || 0),
        httpStatus: (networkEntry.response && networkEntry.response.status) || 0,
        bodySize: (networkEntry.response && networkEntry.response.bodySize) || 0,
        timings: networkEntry.timings,
        responseText,
        requestId,
        batchSize: actions.length
      };

      /* The page's own answer may have listed the call first. That is the end of
       * it, unless the answer was cut: then the whole one replaces the cut rows. */
      const known = testToken ? state.entries.filter((entry) => entry.test && entry.test.token === testToken) : [];
      const cutRows = known.filter((entry) => entry.test.truncated);
      if (known.length && !cutRows.length) return;
      const added = [];
      actions.forEach((action, index) => {
        const record = buildActionRecord(++state.seq, kind, action, index, responseBody, requestMeta);
        if (unparsed) record.omni = true; // the panel's own call stays in view whatever the filter
        tagTest(record, request, requestMeta.startedAt.getTime());
        if (cutRows.length) record.test = { ...cutRows[0].test, truncated: false };
        insert(record);
        added.push(record);
      });
      if (cutRows.length) retire(cutRows, added[0].id);
      redraw(state.active);
    });
  }

  return { onRequestFinished, recordSent };
}
