import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeDelta, openSession } from '../../src/core';
import { parseLdx } from '../../src/core/ld/ldx';
import { findSampleFiles, samplesAvailable } from '../fixtures/samples';

const samples = findSampleFiles();

describe.skipIf(!samplesAvailable() || samples.length === 0)('real MoTeC files', () => {
  for (const sample of samples) {
    describe(sample.name, () => {
      const ldxText = sample.ldxPath ? readFileSync(sample.ldxPath, 'latin1') : undefined;
      const ldx = ldxText ? parseLdx(ldxText) : undefined;
      const hasSidecar = ldx !== undefined;
      const hasEnoughBeacons = (ldx?.beaconTimes.length ?? 0) >= 2;

      const session = openSession(new Uint8Array(readFileSync(sample.ldPath)), {
        fileName: sample.name,
        ...(ldxText ? { ldxText } : {}),
      });

      it('reads 186 channels with unique full names', () => {
        expect(session.meta.channels).toHaveLength(186);
        const names = new Set(session.meta.channels.map((c) => c.name));
        expect(names.size).toBe(186);
      });

      it('has non-unique short names, so they are labels only', () => {
        const shortNames = new Set(session.meta.channels.map((c) => c.shortName));
        expect(shortNames.size).toBeLessThan(186);
      });

      it('reports the driver, vehicle and venue', () => {
        expect(session.meta.driver.length).toBeGreaterThan(0);
        expect(session.meta.vehicle.length).toBeGreaterThan(0);
        expect(session.meta.venue.length).toBeGreaterThan(0);
      });

      it('finds complete laps', () => {
        const complete = session.meta.laps.filter((l) => l.complete);
        expect(complete.length).toBeGreaterThan(5);
      });

      // On the Knockhill recording there are 34 Car Pos Norm wraps but only 33
      // Lap Number transitions: the sim's lap counter stays at 0 through the
      // whole first flying lap. Lap identity therefore comes from the wraps,
      // not from Lap Number, and sourceNumber (which mirrors Lap Number) is
      // known to duplicate across laps — it is asserted as a plausible value
      // only, never for uniqueness.
      it('derives lap identity from Car Pos Norm wraps, not from Lap Number', () => {
        const carPosNorm = session.channel('Car Pos Norm');
        let wraps = 0;
        for (let i = 1; i < carPosNorm.length; i++) {
          if (carPosNorm[i] < carPosNorm[i - 1] - 0.5) wraps++;
        }

        const laps = session.meta.laps;
        expect(laps.length).toBe(wraps + 1);

        const numbers = laps.map((l) => l.number);
        expect(new Set(numbers).size).toBe(laps.length);
        expect(numbers).toEqual([...laps.keys()]);

        for (const lap of laps) {
          expect(Number.isInteger(lap.sourceNumber)).toBe(true);
          expect(lap.sourceNumber).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(lap.sourceNumber)).toBe(true);
        }
      });

      // buildLapIndex falls back to the geometric span (endTime - startTime)
      // whenever the recorded lapTime disagrees with it by more than 0.25s, so
      // this bound is enforced by construction rather than by the data. This
      // test only guards against that fallback logic regressing.
      it('keeps lapTime within the by-construction fallback tolerance of the wrap span', () => {
        for (const lap of session.meta.laps) {
          if (!lap.complete) continue;
          const span = lap.endTime - lap.startTime;
          expect(Math.abs(lap.lapTime - span)).toBeLessThan(0.25);
        }
      });

      // A track length that is merely "in a plausible range" does not catch a
      // scaling bug: multiplying the resolved length by 1.5 leaves lap times
      // and deltas untouched (resampleToDistance/resampleElapsedTime both
      // normalise by grid.length), so only the axis scale itself pins the bug
      // down. Pin it exactly against the sidecar's own Venue Length.
      it.skipIf(!hasSidecar)(
        'resolves meta.trackLength and grid.length exactly to the .ldx Venue Length',
        () => {
          const declared = ldx!.trackLength!;
          expect(declared).toBeGreaterThan(0);

          expect(
            Math.abs(session.meta.trackLength! - declared),
            `meta.trackLength ${session.meta.trackLength} vs sidecar Venue Length ${declared}`,
          ).toBeLessThan(1e-6);

          expect(session.grid.approximate).toBe(false);
          expect(
            Math.abs(session.grid.length - declared),
            `grid.length ${session.grid.length} vs sidecar Venue Length ${declared}`,
          ).toBeLessThan(1e-6);

          const expectedPoints = Math.ceil(session.grid.length / session.grid.step);
          expect(
            session.grid.points,
            `grid.points ${session.grid.points} vs expected ceil(length / step) = ${expectedPoints}`,
          ).toBe(expectedPoints);
        },
      );

      // Independent cross-check: opening the same recording WITHOUT the
      // sidecar forces trackLength to be estimated from the median despiked
      // Lap Distance over complete laps — a completely different code path
      // from reading the .ldx. The two agreeing is real evidence that the
      // resolved length is correct, not just internally self-consistent.
      it.skipIf(!hasSidecar)(
        'estimates a track length from Lap Distance that agrees with the .ldx Venue Length',
        () => {
          const declared = ldx!.trackLength!;
          const withoutLdx = openSession(new Uint8Array(readFileSync(sample.ldPath)), {
            fileName: sample.name,
          });

          expect(withoutLdx.grid.approximate).toBe(true);
          expect(withoutLdx.meta.trackLength).toBeUndefined();

          const estimated = withoutLdx.grid.length;
          const relativeError = Math.abs(estimated - declared) / declared;
          expect(
            relativeError,
            `estimated grid.length ${estimated} vs sidecar Venue Length ${declared} (relative error ${relativeError})`,
          ).toBeLessThan(0.01);
        },
      );

      it('resamples Ground Speed onto the grid with finite values', () => {
        const lap = session.meta.laps.find((l) => l.complete);
        expect(lap).toBeDefined();

        const speed = session.series(lap!.number, 'Ground Speed');
        expect(speed).toHaveLength(session.grid.points);
        expect([...speed].every(Number.isFinite)).toBe(true);
        expect(Math.max(...speed)).toBeGreaterThan(100);
      });

      it('produces a zero delta for a lap against itself', () => {
        const lap = session.meta.laps.find((l) => l.complete)!;
        const delta = session.delta(lap.number, lap.number);
        expect([...delta].every((v) => v === 0)).toBe(true);
      });

      it('produces a delta that starts near zero between two laps', () => {
        const complete = session.meta.laps.filter((l) => l.complete);
        expect(complete.length).toBeGreaterThan(1);

        const delta = session.delta(complete[0].number, complete[1].number);
        expect(delta).toHaveLength(session.grid.points);
        expect(Math.abs(delta[0])).toBeLessThan(0.5);
        expect([...delta].every(Number.isFinite)).toBe(true);
      });

      // The .ldx sidecar records the absolute session time of every start/finish
      // crossing independently of our own lap-detection pipeline. The gaps
      // between consecutive beacons are lap times measured by MoTeC, not by us,
      // making this the strongest end-to-end check available: our fastest
      // complete lap should agree with the smallest beacon gap.
      it.skipIf(!hasSidecar || !hasEnoughBeacons)(
        'agrees with the .ldx beacon gaps on the fastest lap time',
        () => {
          const gaps: number[] = [];
          for (let i = 1; i < ldx!.beaconTimes.length; i++) {
            gaps.push(ldx!.beaconTimes[i] - ldx!.beaconTimes[i - 1]);
          }
          const smallestGap = Math.min(...gaps);

          const complete = session.meta.laps.filter((l) => l.complete);
          const fastest = complete.reduce((best, lap) => (lap.lapTime < best.lapTime ? lap : best));

          expect(
            Math.abs(fastest.lapTime - smallestGap),
            `fastest lap time ${fastest.lapTime}s vs smallest beacon gap ${smallestGap}s`,
          ).toBeLessThan(0.3);
        },
      );

      // FIX 1: series(lap, 'Lap Time') is non-monotone or ends at the wrong
      // value on 5 of 14 complete Monza laps and 13 of 33 Knockhill laps, and
      // a delta built from two of them ended at -20.293 s on Knockhill laps
      // 1 vs 2 where the correct answer is -5.086 s.
      it('refuses to resample the raw Lap Time channel', () => {
        const lap = session.meta.laps.find((l) => l.complete)!;
        expect(() => session.series(lap.number, 'Lap Time')).toThrow(/elapsed/);
      });

      it('gives elapsed lap time that starts at zero and never goes backwards, on every complete lap', () => {
        for (const lap of session.meta.laps.filter((l) => l.complete)) {
          const elapsed = session.elapsed(lap.number);
          expect(elapsed).toHaveLength(session.grid.points);
          expect(Math.abs(elapsed[0]), `lap ${lap.number} starts at ${elapsed[0]}`).toBeLessThan(
            0.05,
          );
          for (let i = 1; i < elapsed.length; i++) {
            expect(
              elapsed[i],
              `lap ${lap.number} goes backwards at node ${i}`,
            ).toBeGreaterThanOrEqual(elapsed[i - 1] - 1e-4);
          }
          expect(
            Math.abs(elapsed[elapsed.length - 1] - lap.lapTime),
            `lap ${lap.number} elapsed end ${elapsed[elapsed.length - 1]} vs lapTime ${lap.lapTime}`,
          ).toBeLessThan(0.3);
        }
      });

      it('composes a finite cross-session delta from two sessions elapsed arrays', () => {
        const other = openSession(new Uint8Array(readFileSync(sample.ldPath)), {
          fileName: sample.name,
          ...(ldxText ? { ldxText } : {}),
        });
        expect(other.meta.id).not.toBe(session.meta.id);

        const complete = session.meta.laps.filter((l) => l.complete);
        const delta = computeDelta(session.elapsed(complete[0].number), other.elapsed(complete[1].number));

        expect(delta).toHaveLength(session.grid.points);
        expect([...delta].every(Number.isFinite)).toBe(true);

        const expectedEnd = complete[1].lapTime - complete[0].lapTime;
        expect(
          Math.abs(delta[delta.length - 1] - expectedEnd),
          `cross-session delta end ${delta[delta.length - 1]}s vs lapTime difference ${expectedEnd}s`,
        ).toBeLessThan(0.3);
      });

      // FIX 2: 94 of Monza's 186 channels used to come back as views over the
      // whole 29,958,704-byte file. postMessage with transfer would have
      // detached the file and killed every other channel in the session.
      it('returns channels that own their buffers, so they are safe to transfer', () => {
        for (const meta of session.meta.channels) {
          const values = session.channel(meta.name);
          expect(
            values.buffer.byteLength,
            `${meta.name} is a view over a ${values.buffer.byteLength}-byte buffer`,
          ).toBe(values.byteLength);
        }
      });

      // FIX 3: Knockhill's Car Pos Norm hits 1.3802 at sample 1, inside the
      // opening partial lap. The running maximum latched on it, so the whole
      // grid mapped into the 0.1 s between two basis nodes and Ground Speed
      // came back spanning 0.00001 kph — a flat line, with no NaN and no flag.
      //
      // The metric is the value span, not the distinct-value count: pchip over
      // a squeezed interval still emits 74 distinct floats, all within
      // 0.00001 kph of each other. After the fix the same lap spans 101.5 kph.
      //
      // A partial lap legitimately leaves the uncovered part of the grid
      // clamped flat (Knockhill's lap 0 covers only the last 73 m of 2020),
      // which is why this asserts a span and not a shape.
      it('does not collapse a lap into a flat line after a position spike', () => {
        for (const lap of session.meta.laps) {
          const speed = session.series(lap.number, 'Ground Speed');
          const span = Math.max(...speed) - Math.min(...speed);
          expect(span, `lap ${lap.number} Ground Speed spans only ${span} kph`).toBeGreaterThan(10);
        }
      });

      // FIX 4: the geometric fallback fires on 2 of 34 Knockhill laps.
      it('flags whether each lapTime came from the channel or from the geometry', () => {
        for (const lap of session.meta.laps) {
          expect(typeof lap.lapTimeApproximate).toBe('boolean');
          if (!lap.lapTimeApproximate) continue;
          expect(lap.lapTime).toBeCloseTo(lap.endTime - lap.startTime, 6);
        }
      });

      it('produces an end-to-end delta between the fastest and slowest laps consistent with their lap times', () => {
        const complete = session.meta.laps.filter((l) => l.complete);
        expect(complete.length).toBeGreaterThan(1);

        const fastest = complete.reduce((best, lap) => (lap.lapTime < best.lapTime ? lap : best));
        const slowest = complete.reduce((worst, lap) => (lap.lapTime > worst.lapTime ? lap : worst));

        const delta = session.delta(fastest.number, slowest.number);
        expect(delta).toHaveLength(session.grid.points);
        expect([...delta].every(Number.isFinite)).toBe(true);
        expect(Math.abs(delta[0])).toBeLessThan(0.5);

        const expectedEnd = slowest.lapTime - fastest.lapTime;
        const actualEnd = delta[delta.length - 1];
        expect(
          Math.abs(actualEnd - expectedEnd),
          `delta end ${actualEnd}s vs lapTime difference ${expectedEnd}s`,
        ).toBeLessThan(0.3);
      });
    });
  }
});
