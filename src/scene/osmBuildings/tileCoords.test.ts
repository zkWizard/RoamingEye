import { describe, expect, it } from "vitest";
import { mvtToLatLon, tileIndex, tileKey } from "./tileCoords";

describe("tileIndex", () => {
  it("indexes Manhattan near z14", () => {
    const [x, y] = tileIndex(40.758, -73.9855, 14);
    expect(x).toBeGreaterThan(4800);
    expect(y).toBeGreaterThan(6100);
  });
});

describe("mvtToLatLon", () => {
  it("maps tile centre back to the tile origin", () => {
    const { lat, lon } = mvtToLatLon(2048, 2048, 4824, 6157, 14);
    expect(lat).toBeGreaterThan(35);
    expect(lat).toBeLessThan(45);
    expect(lon).toBeGreaterThan(-80);
    expect(lon).toBeLessThan(-70);
  });
});

describe("tileKey", () => {
  it("formats stable keys", () => {
    expect(tileKey(14, 1, 2)).toBe("14/1/2");
  });
});
