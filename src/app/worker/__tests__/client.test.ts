import { describe, expect, it, vi } from 'vitest';

import { createClient, type ClientPort } from '@app/worker/client';
import type { Request, Response } from '@worker/protocol';

/** A port that answers whatever the test tells it to, one message at a time. */
function fakePort(answer: (request: Request) => Response): ClientPort & { sent: Request[] } {
  let listener: ((event: MessageEvent) => void) | undefined;
  const sent: Request[] = [];

  return {
    sent,
    postMessage(message: unknown) {
      const request = message as Request;
      sent.push(request);
      queueMicrotask(() => listener?.({ data: answer(request) } as MessageEvent));
    },
    addEventListener(_type: 'message', handler: (event: MessageEvent) => void) {
      listener = handler;
    },
    terminate: vi.fn(),
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
});
