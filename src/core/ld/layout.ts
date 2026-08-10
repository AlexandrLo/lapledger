/**
 * Byte offsets inside the .ld structures.
 *
 * Verified byte by byte against the sample files. The header is 1762 bytes,
 * which equals the eventPtr both samples carry; the event struct is 1154 bytes,
 * and 1762 + 1154 = 2916, which equals the channelMetaPtr both samples carry.
 */
export const HEADER = {
  marker: 0,
  channelMetaPtr: 8,
  channelDataPtr: 12,
  eventPtr: 36,
  deviceSerial: 70,
  deviceType: 74,
  deviceTypeLen: 8,
  deviceVersion: 82,
  channelCount: 86,
  date: 94,
  time: 126,
  driver: 158,
  vehicle: 222,
  venue: 350,
  shortComment: 1572,
  textLen: 64,
  dateLen: 16,
  size: 1762,
} as const;

export const EVENT = {
  name: 0,
  session: 64,
  comment: 128,
  venuePtr: 1152,
  textLen: 64,
  size: 1154,
} as const;

export const CHAN = {
  prevPtr: 0,
  nextPtr: 4,
  dataPtr: 8,
  count: 12,
  counter: 16,
  dtypeA: 18,
  dtype: 20,
  freq: 22,
  shift: 24,
  mul: 26,
  scale: 28,
  dec: 30,
  name: 32,
  nameLen: 32,
  shortName: 64,
  shortNameLen: 8,
  unit: 72,
  unitLen: 12,
  size: 124,
} as const;

export const LD_MARKER = 0x40;
