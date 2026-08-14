import { describe, expect, it } from 'vitest';

import { buildLapIndex, type LapChannels } from '@core/lap/lapIndex';

/** Three laps of 10 samples each at 10 Hz, preceded by half an out-lap. */
function synthetic(): LapChannels {
  const pos: number[] = [];
  const lapNumber: number[] = [];
  const lapTime: number[] = [];

  // Out-lap: positions 0.5 .. 0.9, lap 0.
  for (let i = 5; i < 10; i++) {
    pos.push(i / 10);
    lapNumber.push(0);
    lapTime.push((i - 5) / 10);
  }
  // Laps 1..3: positions 0.0 .. 0.9.
  for (let lap = 1; lap <= 3; lap++) {
    for (let i = 0; i < 10; i++) {
      pos.push(i / 10);
      lapNumber.push(lap);
      lapTime.push(i / 10);
    }
  }

  return {
    carPosNorm: { values: Float32Array.from(pos), freq: 10 },
    lapNumber: { values: Float32Array.from(lapNumber), freq: 10 },
    lapTime: { values: Float32Array.from(lapTime), freq: 10 },
  };
}

describe('buildLapIndex', () => {
  it('finds every lap, marking the partial ones', () => {
    const laps = buildLapIndex(synthetic());

    expect(laps.map((l) => l.complete)).toEqual([false, true, true, false]);
    expect(laps.map((l) => l.number)).toEqual([0, 1, 2, 3]);
    expect(laps.map((l) => l.sourceNumber)).toEqual([0, 1, 2, 3]);
  });

  it('takes boundaries from Car Pos Norm wraps', () => {
    const laps = buildLapIndex(synthetic());

    expect(laps[1].startIndex).toBe(5);
    expect(laps[1].endIndex).toBe(14);
    expect(laps[1].startTime).toBeCloseTo(0.5, 6);
    expect(laps[1].endTime).toBeCloseTo(1.5, 6);
  });

  it('takes lap time from the Lap Time channel maximum', () => {
    const laps = buildLapIndex(synthetic());
    expect(laps[1].lapTime).toBeCloseTo(0.9, 6);
  });

  it('tolerates micro-reversals that are not wraps', () => {
    const channels = synthetic();
    // A 0.001 backwards step inside lap 2 must not be read as a lap boundary.
    channels.carPosNorm.values[18] = channels.carPosNorm.values[17] - 0.001;

    expect(buildLapIndex(channels)).toHaveLength(4);
  });

  it('marks a lap invalid when Lap Invalidated is set inside it', () => {
    const channels = synthetic();
    const flags = new Float32Array(channels.carPosNorm.values.length);
    flags[17] = 1;
    channels.lapInvalidated = { values: flags, freq: 10 };

    const laps = buildLapIndex(channels);
    expect(laps[1].valid).toBe(true);
    expect(laps[2].valid).toBe(false);
  });

  it('returns a single partial lap when there is no wrap at all', () => {
    const values = Float32Array.from([0.1, 0.2, 0.3]);
    const laps = buildLapIndex({
      carPosNorm: { values, freq: 10 },
      lapNumber: { values: Float32Array.from([0, 0, 0]), freq: 10 },
      lapTime: { values: Float32Array.from([0, 0.1, 0.2]), freq: 10 },
    });

    expect(laps).toHaveLength(1);
    expect(laps[0].complete).toBe(false);
  });

  it('assigns unique sequential numbers even when Lap Number channel repeats', () => {
    const channels = synthetic();
    // Lap Number stays at 0 through the first wrap; a second wrap happens.
    channels.lapNumber.values[10] = 0;

    const laps = buildLapIndex(channels);
    expect(laps.map((l) => l.number)).toEqual([0, 1, 2, 3]);
    expect(laps.map((l) => l.sourceNumber)).toEqual([0, 0, 2, 3]);
  });

  it('sourceNumber carries the sim value in normal recordings', () => {
    const laps = buildLapIndex(synthetic());
    expect(laps.map((l) => l.sourceNumber)).toEqual([0, 1, 2, 3]);
  });

  it('falls back to geometric duration when Lap Time channel disagrees', () => {
    const channels = synthetic();
    // Inject a false lap time value that is 5 seconds larger than the real lap.
    channels.lapTime.values[10] = 5.9;

    const laps = buildLapIndex(channels);
    const lap1Duration = laps[1].endTime - laps[1].startTime;
    expect(laps[1].lapTime).toBeCloseTo(lap1Duration, 6);
  });

  it('still takes lapTime from the channel when the two agree', () => {
    const channels = synthetic();
    const laps = buildLapIndex(channels);
    // For the synthetic fixture, the lap duration is 1.0 s (from 0.5 to 1.5)
    // and the max Lap Time is 0.9.
    const lap1Duration = laps[1].endTime - laps[1].startTime;
    expect(laps[1].lapTime).toBeCloseTo(0.9, 6);
    expect(Math.abs(laps[1].lapTime - lap1Duration)).toBeGreaterThan(0.1);
  });

  // FIX 4: the fallback fires on 2 of 34 real Knockhill laps and swaps
  // millisecond precision for the wrap grid's ~100 ms. A consumer has to be
  // able to tell which laps deserve to be rendered as 1:59.874.
  it('reports lapTimeApproximate false when the channel value is credible', () => {
    const laps = buildLapIndex(synthetic());
    expect(laps[1].lapTimeApproximate).toBe(false);
  });

  it('reports lapTimeApproximate true when the channel disagrees and geometry wins', () => {
    const channels = synthetic();
    channels.lapTime.values[10] = 5.9;

    const laps = buildLapIndex(channels);
    expect(laps[1].lapTimeApproximate).toBe(true);
    expect(laps[1].lapTime).toBeCloseTo(laps[1].endTime - laps[1].startTime, 6);
  });

  // FIX 7: Knockhill contains a NON-wrap backwards step of 0.41643 between
  // samples 1 and 2. The threshold's real margin is 0.084, not 0.5; lowering it
  // to chase a missed wrap would invent phantom laps and renumber every
  // LapMeta.number, invalidating every persisted LapRef.
  it('does not read a 0.42 backwards step as a lap boundary', () => {
    const channels = synthetic();
    // Inside lap 2 (indices 15..24), drop back by 0.42 — bigger than any noise
    // but smaller than a wrap. Lap 2 starts at 0.0, so lift it first.
    channels.carPosNorm.values[17] = 0.85;
    channels.carPosNorm.values[18] = 0.85 - 0.42;

    const laps = buildLapIndex(channels);
    expect(laps).toHaveLength(4);
    expect(laps.map((l) => l.startIndex)).toEqual([0, 5, 15, 25]);
  });
});
