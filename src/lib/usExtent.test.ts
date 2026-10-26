import { describe, expect, it } from "vitest";
import { viewingUnitedStates } from "./usExtent";

describe("viewingUnitedStates", () => {
  it("is true over the states, Alaska, Hawaii, and the island territories", () => {
    expect(viewingUnitedStates(41.6, -93.5)).toBe(true); // Iowa
    expect(viewingUnitedStates(61.2, -149.9)).toBe(true); // Anchorage
    expect(viewingUnitedStates(52.9, 173)).toBe(true); // Attu, across the antimeridian
    expect(viewingUnitedStates(21.3, -157.8)).toBe(true); // Honolulu
    expect(viewingUnitedStates(18.4, -66.1)).toBe(true); // San Juan
    expect(viewingUnitedStates(-14.3, -170.7)).toBe(true); // Pago Pago
    expect(viewingUnitedStates(13.5, 144.8)).toBe(true); // Guam
  });

  it("is false over other countries and the open ocean", () => {
    expect(viewingUnitedStates(48.9, 2.3)).toBe(false); // Paris
    expect(viewingUnitedStates(19.4, -99.1)).toBe(false); // Mexico City
    expect(viewingUnitedStates(51.5, -0.1)).toBe(false); // London
    expect(viewingUnitedStates(0, -140)).toBe(false);
    expect(viewingUnitedStates(Number.NaN, -93)).toBe(false);
  });
});
