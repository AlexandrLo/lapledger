import type { ChannelMeta } from '@core/index';
import type { SessionSummary } from '@worker/protocol';

export type ChannelInfo = { unit: string; discrete: boolean };

/**
 * The wanted channels that this recording actually has, in the wanted order.
 *
 * The default stack names six channels; a recording from another sim or an
 * older version of the logger may carry only four of them, and a missing
 * channel must not take the panel down with it.
 */
export function presentChannels(available: ChannelMeta[], wanted: readonly string[]): string[] {
  const names = new Set(available.map((channel) => channel.name));
  return wanted.filter((name) => names.has(name));
}

export function channelInfo(available: ChannelMeta[], name: string): ChannelInfo {
  const channel = available.find((entry) => entry.name === name);
  return channel
    ? { unit: channel.unit, discrete: channel.discrete }
    : { unit: '', discrete: false };
}

/**
 * The channels every one of these sessions carries.
 *
 * A channel only one drawn session has cannot be plotted for the other lap,
 * and asking for it rejects the whole batch — so it is never offered.
 */
export function sharedChannels(sessions: readonly SessionSummary[]): ChannelMeta[] {
  const [first, ...rest] = sessions;
  if (!first) return [];
  return first.channels.filter((channel) =>
    rest.every((session) => session.channels.some((other) => other.name === channel.name)),
  );
}
