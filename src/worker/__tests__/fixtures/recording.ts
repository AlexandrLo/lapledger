import { buildLd } from '@tests/fixtures/buildLd';

/**
 * Three laps of a one-kilometre track at 10 Hz: position ramps 0 → 1 three
 * times, the lap counter follows it, and Lap Time restarts at each wrap. Three
 * rather than two, so that the middle lap is bounded by a wrap on both sides
 * and comes out of the lap index as `complete`.
 */
export function recording(venue = 'test-venue', speed = 100): Uint8Array {
  const position: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];
  const speedValues: number[] = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < 100; i++) {
      position.push(i / 100);
      lapNumber.push(lap);
      lapTime.push(i / 10);
      speedValues.push(speed);
    }
  }

  return buildLd({
    venue,
    channels: [
      { name: 'Car Pos Norm', freq: 10, values: position },
      { name: 'Lap Number', freq: 10, values: lapNumber },
      { name: 'Lap Time', freq: 10, values: lapTime },
      { name: 'Ground Speed', freq: 10, values: speedValues },
    ],
  });
}

export const LDX = '<LDXFile><Numeric Id="Venue Length" Value="1000" Unit="m"/></LDXFile>';
