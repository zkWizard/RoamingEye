import { describe, expect, it } from "vitest";
import { orbFrame, type OrbState } from "./orbGeometry";

const STATES: OrbState[] = ["searching", "listening"];
const SIZES = [64, 20] as const;

describe("orbFrame", () => {
  for (const state of STATES) {
    for (const size of SIZES) {
      describe(`${state} at ${size}px`, () => {
        // A spread of instants, including the reduced-motion still.
        const instants: Array<number | "still"> = ["still", 0, 1.3, 7.9, 123.4];

        it("keeps every dot inside its canvas", () => {
          for (const t of instants) {
            for (const d of orbFrame(state, size, t).dots) {
              expect(d.x - d.r).toBeGreaterThanOrEqual(0);
              expect(d.x + d.r).toBeLessThanOrEqual(size);
              expect(d.y - d.r).toBeGreaterThanOrEqual(0);
              expect(d.y + d.r).toBeLessThanOrEqual(size);
            }
          }
        });

        it("draws far to near, so near dots cover far ones", () => {
          for (const t of instants) {
            const z = orbFrame(state, size, t).dots.map((d) => d.z);
            expect(z).toEqual([...z].sort((a, b) => a - b));
          }
        });

        it("is a pure function of the instant", () => {
          // Every orb shares the page clock, so two orbs of a kind agree, and
          // a still frame is the same frame on every paint.
          expect(orbFrame(state, size, 7.9)).toEqual(
            orbFrame(state, size, 7.9)
          );
          expect(orbFrame(state, size, "still")).toEqual(
            orbFrame(state, size, "still")
          );
          expect(orbFrame(state, size, 7.9)).not.toEqual(
            orbFrame(state, size, 8.4)
          );
        });

        it("draws something at a 20px scale, not an empty canvas", () => {
          expect(orbFrame(state, size, 1.3).dots.length).toBeGreaterThan(20);
        });
      });
    }
  }
});
