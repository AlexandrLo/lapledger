import { describe, expect, it, vi } from 'vitest';

import { createClient, type ClientPort } from '@app/worker/client';
import type { Request, Response } from '@worker/protocol';

/**
 * A port that answers whatever the test tells it to, one message at a time,
 * and lets a test fire the `error` or `messageerror` events a real `Worker`
 * would raise.
 */
function fakePort(answer: (request: Request) => Response): ClientPort & {
  sent: Request[];
  raiseError(event: Partial<ErrorEvent>): void;
  raiseMessageError(): void;
} {
  let messageListener: ((event: MessageEvent) => void) | undefined;
  let errorListener: ((event: ErrorEvent) => void) | undefined;
  let messageErrorListener: ((event: MessageEvent) => void) | undefined;
  const sent: Request[] = [];

  return {
    sent,
    postMessage(message: unknown) {
      const request = message as Request;
      sent.push(request);
      queueMicrotask(() => messageListener?.({ data: answer(request) } as MessageEvent));
    },
    addEventListener(
      type: 'error' | 'message' | 'messageerror',
      handler: ((event: ErrorEvent) => void) | ((event: MessageEvent) => void),
    ) {
      if (type === 'message') messageListener = handler as (event: MessageEvent) => void;
      else if (type === 'error') errorListener = handler as (event: ErrorEvent) => void;
      else messageErrorListener = handler as (event: MessageEvent) => void;
    },
    terminate: vi.fn(),
    raiseError(event) {
      errorListener?.(event as ErrorEvent);
    },
    raiseMessageError() {
      messageErrorListener?.({} as MessageEvent);
    },
  };
}

describe('createClient', () => {
  it('resolves a request with the matching response', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'series', values: Float32Array.from([1, 2, 3]) },
    }));
    const client = createClient(port);

    const result = await client.request({
      kind: 'getElapsed',
      lap: { sessionId: 's', lapNumber: 0 },
    });

    expect([...result.values]).toEqual([1, 2, 3]);
    expect(port.sent[0].kind).toBe('getElapsed');
  });

  it('gives each request its own id', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'series', values: Float32Array.from([request.id]) },
    }));
    const client = createClient(port);

    const [first, second] = await Promise.all([
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 0 } }),
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 1 } }),
    ]);

    expect(first.values[0]).not.toBe(second.values[0]);
  });

  it('rejects with the message the worker reported', async () => {
    const port = fakePort((request) => ({ id: request.id, ok: false, message: 'no such lap' }));
    const client = createClient(port);

    await expect(
      client.request({ kind: 'getElapsed', lap: { sessionId: 's', lapNumber: 9 } }),
    ).rejects.toThrow('no such lap');
  });

  it('ignores a response whose id it never issued', async () => {
    const port = fakePort((request) => ({
      id: request.id + 1000,
      ok: true,
      result: { kind: 'sessionClosed' },
    }));
    const client = createClient(port);

    const pending = client.request({ kind: 'closeSession', sessionId: 's' });
    const settled = await Promise.race([
      pending.then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 10)),
    ]);

    expect(settled).toBe('pending');
  });

  it('rejects an in-flight request when the worker reports an error', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'sessionClosed' },
    }));
    const client = createClient(port);

    const pending = client.request({ kind: 'closeSession', sessionId: 's' });
    port.raiseError({ message: 'boom' });

    await expect(pending).rejects.toThrow('boom');
  });

  it('rejects an in-flight request when the client is terminated', async () => {
    const port = fakePort((request) => ({
      id: request.id,
      ok: true,
      result: { kind: 'sessionClosed' },
    }));
    const client = createClient(port);

    const pending = client.request({ kind: 'closeSession', sessionId: 's' });
    client.terminate();

    await expect(pending).rejects.toThrow('terminated');
    expect(port.terminate).toHaveBeenCalledOnce();
  });
});
