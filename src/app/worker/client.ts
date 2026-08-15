import type { Request, RequestBody, ResultByKind, Response } from '@worker/protocol';

/** The part of `Worker` the client uses, so a test can supply a fake. */
export type ClientPort = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  terminate(): void;
};

export type TelemetryClient = {
  // The body itself is the inference site. `Extract<RequestBody, { kind: K }>`
  // would read better and not work: TypeScript cannot infer K out of a
  // conditional type.
  request<B extends RequestBody>(
    body: B,
    transfer?: Transferable[],
  ): Promise<ResultByKind[B['kind']]>;
  terminate(): void;
};

type Pending = { resolve: (result: never) => void; reject: (error: Error) => void };

export function createClient(port: ClientPort): TelemetryClient {
  const pending = new Map<number, Pending>();
  let nextId = 1;

  port.addEventListener('message', (event: MessageEvent) => {
    const response = event.data as Response;
    const waiting = pending.get(response.id);
    // A response with an unknown id belongs to nobody — a request that was
    // already settled, or a stray message. Dropping it is the only safe move.
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.result as never);
    else waiting.reject(new Error(response.message));
  });

  return {
    request(body, transfer) {
      const id = nextId++;
      const message: Request = { id, ...body };
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (result: never) => void, reject });
        port.postMessage(message, transfer ?? []);
      });
    },
    terminate() {
      port.terminate();
    },
  };
}
