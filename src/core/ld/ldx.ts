export type LdxVehicleInfo = {
  wheelbase?: number;
  track?: number;
  weight?: number;
  fuelCapacity?: number;
};

export type LdxData = {
  /** Lap beacon times in seconds from session start. */
  beaconTimes: number[];
  /** Venue Length in metres, when the file declares one. */
  trackLength?: number;
  vehicle: LdxVehicleInfo;
  appName?: string;
};

const MARKER_RE = /<Marker\b[^>]*\/>/g;
const NUMERIC_RE = /<Numeric\s+Id="([^"]*)"\s+Value="([^"]*)"/g;
const STRING_RE = /<String\s+Id="([^"]*)"\s+Value="([^"]*)"/g;

const MICROSECONDS_PER_SECOND = 1e6;

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

export function parseLdx(xml: string): LdxData {
  const beaconTimes: number[] = [];
  for (const [tag] of xml.matchAll(MARKER_RE)) {
    if (attr(tag, 'ClassName') !== 'BCN') continue;
    const raw = attr(tag, 'Time');
    if (raw === undefined) continue;
    const microseconds = Number(raw);
    if (Number.isFinite(microseconds)) {
      beaconTimes.push(microseconds / MICROSECONDS_PER_SECOND);
    }
  }
  beaconTimes.sort((a, b) => a - b);

  const numerics = new Map<string, number>();
  for (const [, id, value] of xml.matchAll(NUMERIC_RE)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) numerics.set(id, parsed);
  }

  const strings = new Map<string, string>();
  for (const [, id, value] of xml.matchAll(STRING_RE)) strings.set(id, value);

  const vehicle: LdxVehicleInfo = {};
  const wheelbase = numerics.get('Vehicle Wheelbase');
  const track = numerics.get('Vehicle Track');
  const weight = numerics.get('Vehicle Weight');
  const fuelCapacity = numerics.get('Fuel Tank Capacity');
  if (wheelbase !== undefined) vehicle.wheelbase = wheelbase;
  if (track !== undefined) vehicle.track = track;
  if (weight !== undefined) vehicle.weight = weight;
  if (fuelCapacity !== undefined) vehicle.fuelCapacity = fuelCapacity;

  const data: LdxData = { beaconTimes, vehicle };
  const trackLength = numerics.get('Venue Length');
  if (trackLength !== undefined) data.trackLength = trackLength;
  const appName = strings.get('AppName');
  if (appName !== undefined) data.appName = appName;

  return data;
}
