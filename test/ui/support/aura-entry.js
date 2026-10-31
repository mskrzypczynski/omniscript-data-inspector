'use strict';

/* A fake DevTools network entry carrying Aura remote actions, for the Remote
 * actions tests. Names are invented.
 *
 *   status        the HTTP status (0: the request never got an answer)
 *   content       the response text as it came, instead of one built from the
 *                 other options (undefined builds it; null is an empty body)
 *   timings       HAR timings of the request
 *   extraActions  ids of further actions sent in the same request (a boxcar);
 *                 each is answered with the same output and method
 *   plainApex     { classname, method }: an ordinary Apex call that is not
 *                 OmniStudio's, in place of the remote call
 */

export function auraNetworkEntry({
  actionId = '1', method = 'Account_Fetch', remoteClass = 'omnistudiocore.IPService',
  responseActions, errorInAction, input = '{"AccountId":"001"}', options = {},
  time = 37, startedDateTime = '2024-01-01T00:00:00Z', output = { ok: true },
  status = 200, content, timings, extraActions = [], namespace, plainApex
} = {}) {
  const ids = [actionId, ...extraActions];
  const message = JSON.stringify({
    actions: ids.map((id) => ({
      id,
      descriptor: 'aura://ApexActionController/ACTION$execute',
      params: plainApex
        ? { classname: plainApex.classname, method: plainApex.method, params: {} }
        : {
          classname: remoteClass,
          method: 'invokeMethod',
          ...(namespace !== undefined ? { namespace } : {}),
          params: { sClassName: remoteClass, sMethodName: method, input, options }
        }
    }))
  });

  const answerFor = (id) => {
    const answer = { id, state: 'SUCCESS', returnValue: { returnValue: output } };
    if (errorInAction && id === actionId) answer.error = [{ message: errorInAction }];
    return answer;
  };

  const text = content !== undefined
    ? content
    : `while(1);${JSON.stringify({ actions: responseActions || ids.map(answerFor) })}`;

  return {
    request: {
      url: 'https://x.my.site.com/aura?r=1',
      method: 'POST',
      postData: { text: new URLSearchParams({ message }).toString() }
    },
    response: { status, bodySize: 42 },
    time,
    timings,
    startedDateTime: new Date(startedDateTime).toISOString(),
    getContent: (callback) => callback(text)
  };
}
