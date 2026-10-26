import { expect, test } from "vitest";
import { solidRgbPng, VEGETATION_GREEN } from "./gibs-fixture";

test("the imagery fixture is a solid truecolor PNG of the requested size", () => {
  const png = solidRgbPng(8, 4, VEGETATION_GREEN);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  // signature (8) + length (4) + "IHDR" (4) = 16, then width and height.
  expect(png.toString("ascii", 12, 16)).toBe("IHDR");
  expect(png.readUInt32BE(16)).toBe(8);
  expect(png.readUInt32BE(20)).toBe(4);
  expect(png[24]).toBe(8); // bit depth
  expect(png[25]).toBe(2); // truecolor, so the legend green is not quantized
});
