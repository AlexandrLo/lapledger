import type { ChannelMeta } from '@core/index';

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
