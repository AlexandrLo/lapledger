import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('appStore Redux DevTools integration', () => {
  it('opens a named connection and reports named state transitions', async () => {
    const send = vi.fn();
    const unsubscribe = vi.fn();
    const connect = vi.fn(() => ({
      init: vi.fn(),
      send,
      subscribe: vi.fn(),
      unsubscribe,
    }));
    vi.stubGlobal('window', {
      __REDUX_DEVTOOLS_EXTENSION__: { connect },
    });
    vi.resetModules();

    const { appStore } = await import('@app/state/store');
    appStore.getState().setCursor(42);

    expect(connect).toHaveBeenCalledWith({ name: 'LapLedger' });
    expect(send).toHaveBeenCalledWith(
      { type: 'cursor/set' },
      expect.objectContaining({ cursor: 42 }),
    );

    appStore.devtools.cleanup();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
