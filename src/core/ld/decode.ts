import type { LdChannel } from './types';
import type { ByteWindow } from './window';

const FLOAT_CLASS = 7;
const DOUBLE_CLASS = 8;

/** True when the channel stores integers, which must be resampled as steps. */
export function isDiscrete(channel: LdChannel): boolean {
  return channel.dtypeA !== FLOAT_CLASS && channel.dtypeA !== DOUBLE_CLASS;
}

export function decodeChannel(win: ByteWindow, channel: LdChannel): Float32Array {
  if (channel.scale === 0) {
    throw new Error(`channel "${channel.name}" declares a scale of 0, which cannot be applied`);
  }

  const raw = readRaw(win, channel);
  const identity =
    channel.scale === 1 && channel.mul === 1 && channel.dec === 0 && channel.shift === 0;

  if (identity && raw instanceof Float32Array) return raw;

  const out = new Float32Array(raw.length);
  const decFactor = 10 ** -channel.dec;
  for (let i = 0; i < raw.length; i++) {
    out[i] = (raw[i] / channel.scale * decFactor + channel.shift) * channel.mul;
  }
  return out;
}

function readRaw(win: ByteWindow, channel: LdChannel): Float32Array | Int32Array | Int16Array {
  const { dtypeA, dtype, dataPtr, count, name } = channel;

  if (dtypeA === FLOAT_CLASS) {
    if (dtype === 4) return win.f32Array(dataPtr, count);
    throw new Error(`channel "${name}" is float16, which is not supported`);
  }
  if (dtypeA === DOUBLE_CLASS) {
    throw new Error(`channel "${name}" is float64, which is not supported`);
  }
  if (dtype === 2) return win.i16Array(dataPtr, count);
  if (dtype === 4) return win.i32Array(dataPtr, count);

  throw new Error(`channel "${name}" has an unknown type (dtypeA=${dtypeA}, dtype=${dtype})`);
}
