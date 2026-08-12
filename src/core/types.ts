export type SessionId = string;

export type ChannelMeta = {
  /** Full channel name — the only unique key. */
  name: string;
  /** Not unique; labels only. */
  shortName: string;
  unit: string;
  freq: number;
  count: number;
  /** Integer-valued channels are resampled as steps, not interpolated. */
  discrete: boolean;
};

export type VehicleInfo = {
  wheelbase?: number;
  track?: number;
  weight?: number;
  fuelCapacity?: number;
};

export type DistanceGrid = {
  /** Metres between grid nodes. */
  step: number;
  /** Track length in metres. */
  length: number;
  points: number;
  /** True when the length was estimated rather than read from the .ldx. */
  approximate: boolean;
};

export type LapRef = { sessionId: SessionId; lapNumber: number };
