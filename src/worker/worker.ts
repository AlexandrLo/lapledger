import { handleRequest } from './handlers';
import type { Request, Response } from './protocol';
import { SessionStore } from './sessionStore';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const store = new SessionStore();

scope.addEventListener('message', (event: MessageEvent<Request>) => {
  // The request is passed on whole rather than stripped of its id: rest
  // destructuring a discriminated union loses the discriminant, and one extra
  // property costs the handler nothing.
  const request = event.data;
  try {
    const { body, transfer } = handleRequest(store, request);
    const response: Response = { id: request.id, ok: true, result: body };
    scope.postMessage(response, transfer);
  } catch (error) {
    const response: Response = {
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
    scope.postMessage(response);
  }
});
