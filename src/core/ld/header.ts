import { EVENT, HEADER, LD_MARKER } from './layout';
import type { LdHeader } from './types';
import type { ByteWindow } from './window';

export function parseHeader(win: ByteWindow): LdHeader {
  const marker = win.u32(HEADER.marker);
  if (marker !== LD_MARKER) {
    throw new Error(
      `not a MoTeC .ld file: expected marker 0x${LD_MARKER.toString(16)} at offset 0, got 0x${marker.toString(16)}`,
    );
  }

  const eventPtr = win.u32(HEADER.eventPtr);

  return {
    channelMetaPtr: win.u32(HEADER.channelMetaPtr),
    channelDataPtr: win.u32(HEADER.channelDataPtr),
    eventPtr,
    channelCount: win.u32(HEADER.channelCount),
    deviceSerial: win.u32(HEADER.deviceSerial),
    deviceType: win.str(HEADER.deviceType, HEADER.deviceTypeLen),
    deviceVersion: win.u16(HEADER.deviceVersion),
    date: win.str(HEADER.date, HEADER.dateLen),
    time: win.str(HEADER.time, HEADER.dateLen),
    driver: win.str(HEADER.driver, HEADER.textLen),
    vehicle: win.str(HEADER.vehicle, HEADER.textLen),
    venue: win.str(HEADER.venue, HEADER.textLen),
    shortComment: win.str(HEADER.shortComment, HEADER.textLen),
    eventName: win.str(eventPtr + EVENT.name, EVENT.textLen),
    sessionName: win.str(eventPtr + EVENT.session, EVENT.textLen),
  };
}
