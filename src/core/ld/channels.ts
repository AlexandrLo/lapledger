import { CHAN } from './layout';
import type { LdChannel, LdHeader } from './types';
import type { ByteWindow } from './window';

export function parseChannels(win: ByteWindow, header: LdHeader): LdChannel[] {
  const channels: LdChannel[] = [];
  const visited = new Set<number>();

  let ptr = header.channelMetaPtr;
  while (ptr !== 0 && !visited.has(ptr)) {
    visited.add(ptr);
    channels.push({
      name: win.str(ptr + CHAN.name, CHAN.nameLen),
      shortName: win.str(ptr + CHAN.shortName, CHAN.shortNameLen),
      unit: win.str(ptr + CHAN.unit, CHAN.unitLen),
      freq: win.u16(ptr + CHAN.freq),
      count: win.u32(ptr + CHAN.count),
      dataPtr: win.u32(ptr + CHAN.dataPtr),
      dtypeA: win.u16(ptr + CHAN.dtypeA),
      dtype: win.u16(ptr + CHAN.dtype),
      shift: win.i16(ptr + CHAN.shift),
      mul: win.i16(ptr + CHAN.mul),
      scale: win.i16(ptr + CHAN.scale),
      dec: win.i16(ptr + CHAN.dec),
    });
    ptr = win.u32(ptr + CHAN.nextPtr);
  }

  if (channels.length !== header.channelCount) {
    throw new Error(
      `channel list is inconsistent: header declares ${header.channelCount} channels, list yields ${channels.length}`,
    );
  }

  return channels;
}
