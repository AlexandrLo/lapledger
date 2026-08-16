import { createStore } from 'zustand/vanilla';

import { LAP_SLOTS } from '@app/theme/palette';
import type { LapRef, SessionId } from '@core/index';
import type { SessionSummary } from '@worker/protocol';

/** Slot 0 is the reference; the rest are comparisons. */
export const SLOT_COUNT = LAP_SLOTS.length;

/** The stack the design document opens with, filtered to what a file carries. */
export const DEFAULT_CHANNELS = [
  'Ground Speed',
  'Throttle Pos',
  'Brake Pos',
  'Steering Angle',
  'Gear',
  'Engine RPM',
] as const;

export function lapKey(lap: LapRef): string {
  return `${lap.sessionId} ${lap.lapNumber}`;
}

function sameLap(a: LapRef | null, b: LapRef): boolean {
  return a !== null && a.sessionId === b.sessionId && a.lapNumber === b.lapNumber;
}

export function slotOf(slots: readonly (LapRef | null)[], lap: LapRef): number {
  return slots.findIndex((slot) => sameLap(slot, lap));
}

export function drawnLaps(slots: readonly (LapRef | null)[]): LapRef[] {
  return slots.filter((slot): slot is LapRef => slot !== null);
}

/**
 * The fastest lap that is both complete and valid. A partial lap is never
 * offered as the reference — the first and last lap of a session usually are
 * partial, and a delta against half a lap is meaningless.
 */
export function pickDefaultReference(session: SessionSummary): LapRef | null {
  let best: SessionSummary['laps'][number] | undefined;
  for (const lap of session.laps) {
    if (!lap.complete || !lap.valid) continue;
    if (!best || lap.lapTime < best.lapTime) best = lap;
  }
  return best ? { sessionId: session.id, lapNumber: best.number } : null;
}

export type AppState = {
  sessions: SessionSummary[];
  slots: (LapRef | null)[];
  /** Distance in metres, shared by every panel. Null when the pointer is out. */
  cursor: number | null;
  channels: string[];

  addSession(session: SessionSummary): void;
  removeSession(sessionId: SessionId): void;
  setReference(lap: LapRef): void;
  toggleComparison(lap: LapRef): void;
  setCursor(distance: number | null): void;
  addChannel(name: string): void;
  removeChannel(name: string): void;
  reset(): void;
};

const initial = (): Pick<AppState, 'sessions' | 'slots' | 'cursor' | 'channels'> => ({
  sessions: [],
  slots: Array.from({ length: SLOT_COUNT }, () => null),
  cursor: null,
  channels: [...DEFAULT_CHANNELS],
});

export const appStore = createStore<AppState>()((set, get) => ({
  ...initial(),

  addSession(session) {
    set((state) => ({ sessions: [...state.sessions, session] }));
    if (get().slots[0] === null) {
      const reference = pickDefaultReference(session);
      if (reference) get().setReference(reference);
    }
  },

  removeSession(sessionId) {
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== sessionId),
      slots: state.slots.map((slot) => (slot?.sessionId === sessionId ? null : slot)),
    }));
  },

  setReference(lap) {
    set((state) => {
      const slots = state.slots.map((slot) => (sameLap(slot, lap) ? null : slot));
      slots[0] = lap;
      return { slots };
    });
  },

  toggleComparison(lap) {
    set((state) => {
      if (sameLap(state.slots[0], lap)) return state;

      const slots = [...state.slots];
      const held = slotOf(slots, lap);
      if (held > 0) {
        slots[held] = null;
        return { slots };
      }

      const free = slots.findIndex((slot, index) => index > 0 && slot === null);
      if (free === -1) return state;
      slots[free] = lap;
      return { slots };
    });
  },

  setCursor(distance) {
    set({ cursor: distance });
  },

  addChannel(name) {
    set((state) =>
      state.channels.includes(name) ? state : { channels: [...state.channels, name] },
    );
  },

  removeChannel(name) {
    set((state) => ({ channels: state.channels.filter((channel) => channel !== name) }));
  },

  reset() {
    set(initial());
  },
}));
