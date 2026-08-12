import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openSession } from '../../src/core';
import { parseLdx } from '../../src/core/ld/ldx';
import { findSampleFiles, samplesAvailable } from '../fixtures/samples';

const samples = findSampleFiles();

describe.skipIf(!samplesAvailable() || samples.length === 0)('real MoTeC files', () => {
  for (const sample of samples) {
    describe(sample.name, () => {
      const session = openSession(new Uint8Array(readFileSync(sample.ldPath)), {
        fileName: sample.name,
        ...(sample.ldxPath ? { ldxText: readFileSync(sample.ldxPath, 'latin1') } : {}),
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

      it('reads the track length from the .ldx', () => {
        if (!sample.ldxPath) return;
        expect(session.grid.approximate).toBe(false);
        expect(session.meta.trackLength).toBeGreaterThan(1000);
        expect(session.meta.trackLength).toBeLessThan(10000);
      });

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
      it('agrees with the .ldx beacon gaps on the fastest lap time', () => {
        if (!sample.ldxPath) return;
        const ldx = parseLdx(readFileSync(sample.ldxPath, 'latin1'));
        if (ldx.beaconTimes.length < 2) return;

        const gaps: number[] = [];
        for (let i = 1; i < ldx.beaconTimes.length; i++) {
          gaps.push(ldx.beaconTimes[i] - ldx.beaconTimes[i - 1]);
        }
        const smallestGap = Math.min(...gaps);

        const complete = session.meta.laps.filter((l) => l.complete);
        const fastest = complete.reduce((best, lap) => (lap.lapTime < best.lapTime ? lap : best));

        expect(
          Math.abs(fastest.lapTime - smallestGap),
          `fastest lap time ${fastest.lapTime}s vs smallest beacon gap ${smallestGap}s`,
        ).toBeLessThan(0.3);
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
