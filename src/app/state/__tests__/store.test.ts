import { beforeEach, describe, expect, it } from 'vitest';

import {
  appStore,
  drawnLaps,
  lapKey,
  pickDefaultReference,
  slotOf,
} from '@app/state/store';
import type { SessionSummary } from '@worker/protocol';

function lap(number: number, overrides: Partial<SessionSummary['laps'][number]> = {}) {
  return {
    number,
    sourceNumber: number,
    startTime: number * 100,
    endTime: number * 100 + 100,
    lapTime: 100 + number,
    lapTimeApproximate: false,
    valid: true,
    complete: true,
    startIndex: 0,
    endIndex: 1,
    ...overrides,
  };
}

function session(id: string, laps = [lap(0), lap(1), lap(2)]): SessionSummary {
  return {
    id,
    fileName: `${id}.ld`,
    driver: 'Test Driver',
    vehicle: 'test_car',
    venue: 'test-venue',
    eventName: 'Telemetrick',
    sessionName: 'Race',
    recordedAt: '10/03/2026 20:31:38',
    duration: 300,
    channels: [],
    laps,
    grid: { step: 1, length: 1000, points: 1000, approximate: false },
  };
}

beforeEach(() => {
  appStore.getState().reset();
});

describe('pickDefaultReference', () => {
  it('picks the fastest complete valid lap', () => {
    const summary = session('s', [
      lap(0, { lapTime: 90, complete: false }),
      lap(1, { lapTime: 101 }),
      lap(2, { lapTime: 99 }),
      lap(3, { lapTime: 95, valid: false }),
    ]);

    expect(pickDefaultReference(summary)).toEqual({ sessionId: 's', lapNumber: 2 });
  });

  it('returns null when no lap qualifies', () => {
    const summary = session('s', [lap(0, { complete: false })]);
    expect(pickDefaultReference(summary)).toBeNull();
  });
});

describe('appStore', () => {
  it('takes a reference automatically from the first session added', () => {
    appStore.getState().addSession(session('s'));

    expect(appStore.getState().slots[0]).toEqual({ sessionId: 's', lapNumber: 0 });
  });

  it('fills comparison slots in order and refuses a fourth lap', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 1 });
    state().toggleComparison({ sessionId: 's', lapNumber: 2 });
    state().toggleComparison({ sessionId: 's', lapNumber: 3 });

    expect(drawnLaps(state().slots).map((l) => l.lapNumber)).toEqual([0, 1, 2]);
  });

  it('frees only the slot of the lap that was removed', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    const first = { sessionId: 's', lapNumber: 1 };
    const second = { sessionId: 's', lapNumber: 2 };
    state().toggleComparison(first);
    state().toggleComparison(second);

    const secondSlot = slotOf(state().slots, second);
    state().toggleComparison(first);

    expect(slotOf(state().slots, second)).toBe(secondSlot);
    expect(slotOf(state().slots, first)).toBe(-1);
  });

  it('moves a lap out of its comparison slot when it becomes the reference', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    const promoted = { sessionId: 's', lapNumber: 2 };
    state().toggleComparison(promoted);
    state().setReference(promoted);

    expect(state().slots[0]).toEqual(promoted);
    expect(state().slots.slice(1).filter(Boolean)).toEqual([]);
  });

  it('keeps the other comparison lap in its slot when a different lap is promoted', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    const first = { sessionId: 's', lapNumber: 1 };
    const second = { sessionId: 's', lapNumber: 2 };
    state().toggleComparison(first);
    state().toggleComparison(second);

    const secondSlot = slotOf(state().slots, second);
    state().setReference(first);

    expect(state().slots[0]).toEqual(first);
    expect(slotOf(state().slots, second)).toBe(secondSlot);
  });

  it('ignores an attempt to compare the reference with itself', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 0 });

    expect(drawnLaps(state().slots)).toHaveLength(1);
  });

  it('clears every slot pointing at a removed session', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().toggleComparison({ sessionId: 's', lapNumber: 1 });
    state().removeSession('s');

    expect(state().sessions).toHaveLength(0);
    expect(state().slots).toEqual([null, null, null]);
  });

  it('keeps the other session comparison lap in place when a session is removed', () => {
    const state = () => appStore.getState();
    state().addSession(session('s'));
    state().addSession(session('t'));
    const fromS = { sessionId: 's', lapNumber: 1 };
    const fromT = { sessionId: 't', lapNumber: 1 };
    state().toggleComparison(fromS);
    state().toggleComparison(fromT);

    const fromTSlot = slotOf(state().slots, fromT);
    state().removeSession('s');

    expect(slotOf(state().slots, fromT)).toBe(fromTSlot);
    expect(slotOf(state().slots, fromS)).toBe(-1);
  });

  it('adds and removes chart channels without duplicating them', () => {
    const state = () => appStore.getState();
    const before = state().channels.length;
    state().addChannel('Ground Speed');
    state().addChannel('Ground Speed');
    state().addChannel('Oil Temp');

    expect(state().channels.filter((c) => c === 'Ground Speed')).toHaveLength(1);
    expect(state().channels).toHaveLength(before + 1);

    state().removeChannel('Oil Temp');
    expect(state().channels).toHaveLength(before);
  });

  it('holds the cursor as a single distance in metres', () => {
    appStore.getState().setCursor(1234);
    expect(appStore.getState().cursor).toBe(1234);

    appStore.getState().setCursor(null);
    expect(appStore.getState().cursor).toBeNull();
  });

  it('keys a lap by session and number together', () => {
    expect(lapKey({ sessionId: 'a', lapNumber: 1 })).not.toBe(
      lapKey({ sessionId: 'b', lapNumber: 1 }),
    );
  });
});
